import { useAtomValue } from "@effect/atom-solid";
import { Attrs } from "@manotes/shared/attrs.service";
import { Effect, Predicate, Stream } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, type Accessor } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createSyncedAtom } from "..";

export function use(opts: { doc: Accessor<Y.Doc | undefined> }) {
  // The caller supplies a document only after its initial Yjs updates have loaded.
  // Changing it releases the previous attrs subscription through the atom's scope.
  const docAtom = createSyncedAtom(opts.doc);

  const attrsAtom = bindRt((rt) =>
    rt.atom((get) => {
      const doc = get(docAtom);

      if (!doc) {
        return Stream.succeed(undefined);
      }

      return Attrs.Service.use((attrs) => Effect.succeed(attrs.watch({ doc }))).pipe(Stream.unwrap);
    }),
  );

  const attrs = useAtomValue(attrsAtom);

  const record = createMemo(() => {
    const result = attrs();

    // Atoms retain the previous success while loading; never use another note's attrs.
    if (!AsyncResult.isSuccess(result) || result.value?.doc !== opts.doc()) {
      return undefined;
    }

    return result.value;
  });

  const editable = createMemo(() => {
    const current = record();

    return current !== undefined;
  });

  const definition = createMemo(() => {
    const current = record();

    if (!current) {
      return undefined;
    }

    const snapshot = current.attrs;
    const { prop_type, prop_default, prop_targets } = snapshot;

    // Only kind and value type are needed; other malformed fields stay replaceable.
    if (!Predicate.isTagged(snapshot, "prop") || prop_type === undefined) {
      return undefined;
    }

    return {
      prop_type,
      prop_default,
      prop_targets,
    };
  });

  const rule = createMemo(() => {
    const current = record();

    if (!current) return undefined;

    const { rule_storage, rule_targets, rule_expects } = current.attrs;

    if (!Predicate.isTagged(current.attrs, "rule")) return undefined;

    return { rule_storage, rule_targets, rule_expects };
  });

  return { editable, definition, rule };
}

export * as EditorAttrs from "./attrs";
