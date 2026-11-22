import { Attrs } from "@manotes/shared/attrs.service";
import { Effect, Predicate, Stream } from "effect";
import { createMemo, type Accessor } from "solid-js";
import type * as Y from "yjs";
import { useGraphStream } from "..";

export function use(opts: { doc: Accessor<Y.Doc | undefined> }) {
  // The caller supplies a document only after its initial Yjs updates have loaded.
  // Changing it interrupts the previous attrs stream before the new snapshot resolves.
  const record = useGraphStream(() => {
    const doc = opts.doc();

    if (!doc) return Stream.succeed(undefined);

    return Attrs.Service.use((attrs) => Effect.succeed(attrs.watch({ doc }))).pipe(Stream.unwrap);
  });

  const editable = createMemo(() => record() !== undefined);

  const definition = createMemo(() => {
    const current = record();

    if (!current) return undefined;

    const snapshot = current.attrs;
    const { prop_type, prop_default, prop_targets } = snapshot;

    // Only kind and value type are needed; other malformed fields stay replaceable.
    if (!Predicate.isTagged(snapshot, "prop") || prop_type === undefined) return undefined;

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

  const preset = createMemo(() => {
    const current = record();

    if (!current) return undefined;

    const { preset_filter, preset_default } = current.attrs;

    if (!Predicate.isTagged(current.attrs, "preset")) return undefined;

    return { preset_filter, preset_default: preset_default === true };
  });

  return { editable, definition, rule, preset };
}

export * as EditorAttrs from "./attrs";
