import * as S from "effect/Schema";

export const Schema = S.Int.check(S.isBetween({ minimum: 1, maximum: 65_535 }));

export const FromString = S.NumberFromString.pipe(S.decodeTo(Schema));

export const decode = S.decodeSync(S.UndefinedOr(FromString));

export * as PortSchema from "./port.ts";
