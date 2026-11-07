import type {
  CodemodeRemoteMessage,
  CodemodeRemoteReply,
} from "@earendil-works/pi-codemode/portable";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

// SAFETY: pi-codemode and our host own this trusted protocol; only attach its types.
export class ExchangeRpc extends RpcGroup.make(
  Rpc.make("exchange", {
    payload: { messages: Schema.make<Schema.Codec<CodemodeRemoteMessage[]>>(Schema.Any.ast) },
    success: Schema.make<Schema.Codec<CodemodeRemoteReply>>(Schema.Any.ast),
  }),
) {}
