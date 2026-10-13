import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { RuleProps } from "@manotes/shared/rule-props";
import type * as RulePropsModule from "@manotes/shared/rule-props";
import { Effect, Layer, Option, Stream, SubscriptionRef } from "effect";
import { Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { NotePropsEntries } from "../components/note/note-props.entries";
import { LiveDoc } from "./live-doc.service";
import { LivePropsAtom } from "./live-props.atom";

let runtime: Atom.AtomRuntime<LiveDoc.Service, never>;

// Exercise the real atom families without mounting a router or graph UI.
vi.mock("./graph-access/graph-runtime/context", () => ({
  useGraph: () => () => ({ runtime: { atom: runtime } }),
}));

vi.mock("@manotes/shared/rule-props", async (importOriginal) => {
  const original = await importOriginal<typeof RulePropsModule>();

  return {
    ...original,
    RuleProps: { ...original.RuleProps, watch: vi.fn(original.watch) },
  };
});

const recordId = AttrsSchema.NoteId.make("record_id:shared");

const propId = AttrsSchema.NoteId.make("prop_id:priority");

const def = PropRecordRepo.Defs.number.make({
  id: propId,
  title: "Priority",
  prop_type: "number",
  prop_default: null,
});

function snapshot(value: number) {
  return {
    groups: {
      top: RuleProps.EditorGroup.Top({
        props: {
          [propId]: {
            propId,
            def: Option.some(def),
            expectation: Option.none(),
            value: Attrs.ValueState.Valid({
              value: AttrsSchema.PropVal.cases.number.make({ val: value }),
            }),
          },
        },
      }),
      groups: {},
    },
    defs: { [propId]: def },
  };
}

describe("shared live props atom", () => {
  it("shares one pipeline, replays its latest value to menus, and keeps subscriptions through edits", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const doc = yield* Effect.acquireRelease(
          Effect.sync(() => new Y.Doc()),
          (doc) => Effect.sync(() => doc.destroy()),
        );

        const docState = yield* SubscriptionRef.make<LiveDoc.Doc>(LiveDoc.Doc.Loading());
        const source = yield* SubscriptionRef.make(snapshot(1));
        let subscriptions = 0;
        let stops = 0;

        const watch = vi.mocked(RuleProps.watch).mockImplementation((opts) => {
          expect(opts.doc).toBe(doc);
          expect(opts.recordId).toBe(recordId);

          return Stream.suspend(() => {
            subscriptions++;

            return SubscriptionRef.changes(source);
          }).pipe(
            Stream.ensuring(
              Effect.sync(() => {
                stops++;
              }),
            ),
          );
        });

        yield* Effect.addFinalizer(() => Effect.sync(() => watch.mockRestore()));

        runtime = Atom.runtime(
          Layer.succeed(LiveDoc.Service, {
            acquire: () => Effect.succeed(docState),
          }),
        );

        const registry = yield* Effect.acquireRelease(
          Effect.sync(() => AtomRegistry.make()),
          (registry) => Effect.sync(() => registry.dispose()),
        );

        const surface = LivePropsAtom.byRecord()(recordId);
        expect(LivePropsAtom.byRecord()(recordId)).toBe(surface);
        const unmountSurface = registry.mount(surface);
        yield* Effect.addFinalizer(() => Effect.sync(unmountSurface));
        expect(subscriptions).toBe(0);

        yield* SubscriptionRef.set(docState, LiveDoc.Doc.Ready({ doc }));
        expect(yield* AtomRegistry.getResult(registry, surface)).toEqual(snapshot(1));
        expect(subscriptions).toBe(1);

        const menu = NotePropsEntries.byRecord()(recordId);
        const unmountMenu = registry.mount(menu);
        expect((yield* AtomRegistry.getResult(registry, menu)).top).toEqual(snapshot(1).groups.top);
        expect(subscriptions).toBe(1);
        unmountMenu();

        const updated = snapshot(2);
        yield* SubscriptionRef.set(source, updated);
        yield* AtomRegistry.toStreamResult(registry, surface).pipe(
          Stream.filter(({ groups }) => {
            const value = groups.top.props[propId]?.value;

            return value?._tag === "Valid" && value.value.val === 2;
          }),
          Stream.runHead,
        );
        const unmountReopened = registry.mount(menu);
        expect((yield* AtomRegistry.getResult(registry, menu)).top).toEqual(updated.groups.top);
        expect(subscriptions).toBe(1);
        expect(stops).toBe(0);
        unmountReopened();
      }).pipe(Effect.scoped),
    );
  });
});
