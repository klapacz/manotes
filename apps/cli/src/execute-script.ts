import { RecordSchema } from "@manotes/shared/record.schema";
import { CodemodeSandbox, type CodemodeTool } from "@earendil-works/pi-codemode";
import { Console, Data, Effect, Schema } from "effect";
import type { Api } from "./execute-api";

export class ScriptExecutionError extends Data.TaggedError("ExecuteScript.ScriptExecutionError")<{
  scriptPath: string;
  message: string;
  cause: unknown;
}> {}

export const run = Effect.fn("ExecuteScript.run")(function* (
  source: string,
  scriptPath: string,
  api: Api,
) {
  const pending: Promise<unknown>[] = [];

  const result = yield* Effect.acquireUseRelease(
    Effect.sync(() => {
      return new CodemodeSandbox({
        globals: createGlobals(api, pending),
        memoryLimitBytes: 256 * 1024 * 1024,
      });
    }),
    (sandbox) => {
      return Effect.tryPromise({
        try: (signal) => sandbox.execute(source, { signal }),
        catch: (cause) => {
          return new ScriptExecutionError({
            scriptPath,
            message: "Could not execute script",
            cause,
          });
        },
      });
    },
    (sandbox) => {
      return Effect.gen(function* () {
        yield* Effect.promise(() => sandbox.close());
        // Wait for interrupted transactions before the caller closes the database.
        yield* Effect.promise(() => Promise.allSettled(pending));
      });
    },
  );

  for (const item of result.output) {
    if (item.type === "text") yield* Console.log(item.text);
  }

  if (!result.ok) {
    return yield* Effect.fail(
      new ScriptExecutionError({
        scriptPath,
        message: `${scriptPath}: ${result.error.message}`,
        cause: result.error,
      }),
    );
  }
});

function createGlobals(api: Api, pending: Promise<unknown>[]): CodemodeTool[] {
  return [
    {
      name: "api.editRecord",
      spread: true,
      execute: (args, { signal }) => {
        const [id, edits] = decodeEditRecordArgs(args);
        const call = api.editRecord(id, edits, signal);
        pending.push(call);

        return call;
      },
    },
    {
      name: "api.createRecord",
      spread: true,
      execute: (args, { signal }) => {
        const [id, edits] = decodeCreateRecordArgs(args);
        const call = api.createRecord(id ?? undefined, edits, signal);
        pending.push(call);

        return call;
      },
    },
  ];
}

const AppendEdit = Schema.Struct({
  kind: Schema.Literal("append"),
  markdown: Schema.String,
});

const DateEdit = Schema.Struct({
  kind: Schema.Literal("date"),
  date: Schema.String,
});

const ReplaceEdit = Schema.Struct({
  kind: Schema.Literal("replace"),
  text: Schema.String,
  with: Schema.String,
  occurrence: Schema.optionalKey(
    Schema.Union([Schema.Literal("all"), Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))]),
  ),
});

const CreateEdit = Schema.Union([AppendEdit, DateEdit]);

const Edit = Schema.Union([CreateEdit, ReplaceEdit]);

const decodeEditRecordArgs = Schema.decodeUnknownSync(
  Schema.Tuple([RecordSchema.Id, Schema.Array(Edit)]),
);

const decodeCreateRecordArgs = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.NullOr(RecordSchema.Id), Schema.Array(CreateEdit)]),
);
