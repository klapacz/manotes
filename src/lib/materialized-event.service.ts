import { Effect } from "effect";
import * as EventRepo from "./event.repo";
import * as EventSchema from "./event.schema";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as NoteRepo from "./note.repo";

type CreateInput = Omit<typeof EventSchema.Create.Type, "type">;

export class Service extends Effect.Service<Service>()(
  "MaterializedEventService.Service",
  {
    dependencies: [
      EventRepo.Service.Default,
      MaterializationCheckpointRepo.Service.Default,
      NoteRepo.Service.Default,
    ],
    effect: Effect.gen(function* () {
      const eventRepo = yield* EventRepo.Service;
      const checkpointRepo = yield* MaterializationCheckpointRepo.Service;
      const noteRepo = yield* NoteRepo.Service;

      const create = Effect.fn("MaterializedEventService.create")(function* (
        input: CreateInput,
      ) {
        const event = yield* eventRepo.create({
          noteId: input.noteId,
          isDaily: input.isDaily,
          payload: input.payload,
          createdAt: input.createdAt,
          type: "update",
        });

        yield* checkpointRepo.waitUntilAtLeast(event.localSeq);

        return yield* noteRepo.getById(event.noteId);
      });

      return {
        create,
      };
    }),
  },
) {}
