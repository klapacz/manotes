import { Context, Effect, Layer, Record, Result, Array, Predicate, pipe } from "effect";
import * as Y from "yjs";
import { DB } from "../db.service";
import { NoteRepo } from "../note.repo";
import { NoteSchema } from "../note.schema";
import { NoteDoc } from "../note/doc";
import { PropRepo } from "../prop.repo";
import { RuleExpectRepo } from "../rule-expect.repo";
import { YSchema } from "../y-schema";

export class Service extends Context.Service<Service>()("MaterializerAttrs.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;
    const noteRepo = yield* NoteRepo.Service;
    const propRepo = yield* PropRepo.Service;
    const expectRepo = yield* RuleExpectRepo.Service;

    const materialize = Effect.fn("MaterializerAttrs.materialize")(function* (opts: {
      readonly recordId: NoteSchema.Id;
      readonly yDoc: Y.Doc;
    }) {
      const projection = yield* project({ yDoc: opts.yDoc });

      yield* noteRepo.updateAttrs({ id: opts.recordId, columns: projection.columns });

      yield* propRepo.deleteForRecord({ recordId: opts.recordId });

      if (Array.isReadonlyArrayNonEmpty(projection.props)) {
        yield* propRepo.insert({
          rows: Array.map(projection.props, (prop) => ({ ...prop, recordId: opts.recordId })),
        });
      }

      yield* expectRepo.deleteForRule({ ruleId: opts.recordId });

      if (Array.isReadonlyArrayNonEmpty(projection.expects)) {
        yield* expectRepo.insert({
          rows: Array.map(projection.expects, (expect) => ({ ...expect, ruleId: opts.recordId })),
        });
      }
    }, db.transaction);

    return { materialize };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(DB.Service.layer),
    Layer.provide(NoteRepo.Service.layer),
    Layer.provide(PropRepo.Service.layer),
    Layer.provide(RuleExpectRepo.Service.layer),
  );
}

const project = Effect.fn("MaterializerAttrs.project")(function* (opts: { readonly yDoc: Y.Doc }) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.yDoc });
  const loose = yield* YSchema.exportLoose(attrs);
  const strict = yield* YSchema.exportStrict(attrs).pipe(Effect.result);

  const columns: NoteRepo.AttrsColumns = {
    _tag: loose._tag ?? "note",
    prop_type: loose.prop_type ?? null,
    prop_default: loose.prop_default ?? null,
    prop_targets: loose.prop_targets ?? null,
    owned_type: loose.owned_type ?? null,
    owned_parent: loose.owned_parent ?? null,
    rule_storage: loose.rule_storage ?? null,
    rule_targets: loose.rule_targets ?? null,
    attrs_valid: Result.isSuccess(strict),
  };

  return {
    columns,
    props: pipe(
      loose.props ?? {},
      Record.filter(Predicate.isNotUndefined),
      // Group projection will be added with rule-scoped assignments.
      Record.filter((value) => !Predicate.isTagged(value, "group")),
      Record.collect((propId, value) => ({ propId, value })),
    ),
    expects: pipe(
      loose.rule_expects ?? {},
      Record.filter(Predicate.isNotUndefined),
      Record.collect((propId, value) => ({ propId, value })),
    ),
  };
});

export * as MaterializerAttrs from "./attrs.service";
