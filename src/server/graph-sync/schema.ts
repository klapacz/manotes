import { Effect, ParseResult, Schema } from "effect";
import * as Messages from "../../lib/graph-sync/contract/messages";

const BooleanFromInt = Schema.transform(Schema.Number, Schema.Boolean, {
  strict: true,
  decode: (value) => value !== 0,
  encode: (value) => (value ? 1 : 0),
});

export const Record = Schema.Struct({
  commitSeq: Schema.NonNegative,
  id: Schema.NonEmptyString,
  noteId: Schema.NonEmptyString,
  isDaily: BooleanFromInt,
  payload: Schema.instanceOf(Uint8Array<ArrayBufferLike>),
  createdAt: Schema.DateTimeUtc,
});

export const CommittedEventFromRecord = Schema.transformOrFail(
  Record,
  Schema.instanceOf(Messages.CommittedEvent),
  {
    strict: true,
    decode: (record) => Effect.succeed(new Messages.CommittedEvent(record)),
    encode: (event, _, ast) =>
      Effect.fail(
        new ParseResult.Forbidden(
          ast,
          event,
          "Encoding CommittedEvent back to Record is forbidden.",
        ),
      ),
  },
);

export const CreateRecord = Record.pipe(Schema.omit("commitSeq"));

export type RawRecord = Schema.Schema.Encoded<typeof Record>;
export type RawCreateRecord = Schema.Schema.Encoded<typeof CreateRecord>;

export const decodeNonEmptyArray = Schema.decode(
  Schema.NonEmptyArray(CommittedEventFromRecord),
);
export const decodeArray = Schema.decode(
  Schema.Array(CommittedEventFromRecord),
);

export const encodeCreateRecords = Schema.encodeSync(
  Schema.Array(CreateRecord),
);
