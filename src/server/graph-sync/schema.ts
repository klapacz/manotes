import { Effect, ParseResult, Schema } from "effect";
import * as Messages from "../../lib/graph-sync/contract/messages";

export const Record = Schema.Struct({
  commitSeq: Schema.NonNegative,
  id: Schema.NonEmptyString,
  streamRef: Schema.Uint8ArrayFromSelf,
  // Opaque encrypted event-envelope bytes. The server never decrypts them.
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
