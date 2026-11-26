import { Schema } from "effect";

export const TokenV0Schema = Schema.Struct({
  version: Schema.Literal(0),
  accountId: Schema.NonEmptyString,
  graphId: Schema.NonEmptyString,
});

export const TokenSchema = TokenV0Schema;

export type Token = typeof TokenSchema.Type;

export const TokenFromString = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(Schema.fromJsonString(TokenSchema)),
);

export const encodeSync = Schema.encodeSync(TokenFromString);

export const decode = Schema.decodeUnknownEffect(TokenFromString);

export const decodeSync = Schema.decodeUnknownSync(TokenFromString);

export * as McpToken from "./token";
