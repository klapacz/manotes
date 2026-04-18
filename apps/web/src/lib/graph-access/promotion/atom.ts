import { Effect } from "effect";
import * as Runtime from "../runtime";
import * as Service from "./service";

export type UploadInput = Service.UploadInput;

export const upload = Runtime.atom.fn(
  Effect.fn("GraphAccessPromotionAtom.upload")(function* (opts: UploadInput) {
    const promotion = yield* Service.Service;
    return yield* promotion.upload(opts);
  }),
);

export type DetachInput = Service.DetachInput;

export const detach = Runtime.atom.fn(
  Effect.fn("GraphAccessPromotionAtom.detach")(function* (opts: DetachInput) {
    const promotion = yield* Service.Service;
    return yield* promotion.detach(opts);
  }),
);
