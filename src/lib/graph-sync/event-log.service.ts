/**
 * Wraps local event-log reads and writes used by graph sync.
 */
import { Array, Effect, Option, pipe } from "effect";
import * as DB from "../db.service";
import * as EventRepo from "../event.repo";
import * as Messages from "./contract/messages";
import { MAX_EVENTS_PER_COMMIT } from "./contract/limits";
import * as Errors from "./machine/errors";
import * as GraphSyncEncryption from "./encryption/service";
import * as GraphSyncEncryptionSchema from "./encryption/schema";
import type { NonEmptyReadonlyArray } from "effect/Array";

export const PUSH_BATCH_SIZE = MAX_EVENTS_PER_COMMIT;

export class Service extends Effect.Service<Service>()(
  "GraphSyncEventLogService",
  {
    dependencies: [
      DB.Service.Default,
      EventRepo.Service.Default,
      GraphSyncEncryption.Service.Default,
    ],
    effect: Effect.gen(function* () {
      const db = yield* DB.Service;
      const eventRepo = yield* EventRepo.Service;
      const graphSyncEncryption = yield* GraphSyncEncryption.Service;

      const getLastCommitSeq = Effect.fn(
        "GraphSyncEventLogService.getLastCommitSeq",
      )(function* () {
        return yield* eventRepo.getLastCommitSeq();
      });

      const ensureLastCommitSeqEquals = Effect.fn(
        "GraphSyncEventLogService.ensureLastCommitSeqEquals",
      )(function* (expected: number) {
        const actual = yield* getLastCommitSeq();

        if (actual !== expected) {
          return yield* new Errors.LastCommitSeqMismatchError({
            expected,
            actual,
          });
        }
      });

      /**
       * Applies a validated contiguous committed suffix to the local event log.
       *
       * Committed rows must stay a gap-free prefix locally because reconnect
       * state is derived from `max(commitSeq)`.
       */
      const applyCommittedEvents = Effect.fn(
        "GraphSyncEventLogService.applyCommittedEvents",
      )(function* (events: NonEmptyReadonlyArray<Messages.CommittedEvent>) {
        const lastCommitSeq = yield* getLastCommitSeq();
        const unappliedEvents = pipe(
          events,
          Array.dropWhile((event) => event.commitSeq <= lastCommitSeq),
        );

        if (!Array.isNonEmptyReadonlyArray(unappliedEvents)) return;

        yield* db.transaction(
          Effect.forEach(
            unappliedEvents,
            (event) =>
              Effect.gen(function* () {
                const lastCommitSeq = yield* getLastCommitSeq();

                if (event.commitSeq <= lastCommitSeq) return;

                if (event.commitSeq !== lastCommitSeq + 1) {
                  return yield* new Errors.NextCommitSeqMismatchError({
                    expected: lastCommitSeq + 1,
                    actual: event.commitSeq,
                  });
                }

                const existing = yield* eventRepo.findByEventId(event.id);

                yield* Option.match(existing, {
                  onSome: Effect.fnUntraced(function* (existing) {
                    // Local optimistic writes reuse the same event id, so a commit
                    // ack turns the pending row into a committed one in place.
                    if (existing.commitSeq === null) {
                      return yield* eventRepo.markCommitted({
                        eventId: event.id,
                        commitSeq: event.commitSeq,
                      });
                    }

                    if (existing.commitSeq !== event.commitSeq) {
                      return yield* new Errors.CommittedEventConflictError({
                        eventId: event.id,
                        expectedCommitSeq: existing.commitSeq,
                        actualCommitSeq: event.commitSeq,
                      });
                    }
                  }),
                  onNone: Effect.fnUntraced(function* () {
                    // Replayed remote events arrive through the same local log so
                    // downstream materialization and tab sync keep using one path.
                    const envelope = yield* GraphSyncEncryptionSchema.decodeEnvelope(
                      event.payload,
                    );
                    const decrypted = yield* graphSyncEncryption.decryptEventBody({
                      id: event.id,
                      streamRef: event.streamRef,
                      createdAt: event.createdAt,
                      envelope,
                    });

                    yield* eventRepo.create({
                      noteId: decrypted.noteId,
                      type: "update",
                      payload: decrypted.payload,
                      createdAt: event.createdAt,
                      id: event.id,
                      commitSeq: event.commitSeq,
                    });
                  }),
                });
              }),
            { discard: true },
          ),
        );
      });

      /**
       * Builds the next commit batch from local rows that are still missing a
       * `commitSeq`, using the current committed prefix as `baseCommitSeq`.
       */
      const getPendingCommit = Effect.fn(
        "GraphSyncEventLogService.getPendingCommit",
      )(function* () {
        const pending = yield* eventRepo.findPending(PUSH_BATCH_SIZE);
        if (!Array.isNonEmptyReadonlyArray(pending)) return Option.none();

        const baseCommitSeq = yield* eventRepo.getLastCommitSeq();
        const events = yield* Effect.forEach(
          pending,
          Effect.fnUntraced(function* (event) {
            const streamRef = yield* graphSyncEncryption.deriveNoteStreamRef(
              event.noteId,
            );
            const encryptedPayload = yield* graphSyncEncryption.encryptEventBody({
              id: event.id,
              streamRef,
              createdAt: event.createdAt,
              noteId: event.noteId,
              payload: event.payload,
            });
            const encodedEnvelope = yield* GraphSyncEncryptionSchema.encodeEnvelope(
              encryptedPayload,
            );

            return new Messages.PendingEvent({
              id: event.id,
              streamRef,
              payload: encodedEnvelope,
              createdAt: event.createdAt,
            });
          }),
        );

        return Option.some({
          baseCommitSeq,
          events,
        });
      });

      return {
        applyCommittedEvents,
        ensureLastCommitSeqEquals,
        getLastCommitSeq,
        getPendingCommit,
      };
    }),
  },
) {}
