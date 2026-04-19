/**
 * Encodes and decodes graph sync wire messages with MsgPack.
 */
import { Msgpack } from "effect/unstable/encoding";
import { Schema } from "effect";
import { ClientMessage, ServerMessage } from "./messages";

const ClientMessageMsgPack = Msgpack.schema(ClientMessage);

const ServerMessageMsgPack = Msgpack.schema(ServerMessage);

export const decodeClientMessage = Schema.decodeEffect(ClientMessageMsgPack);

export const encodeClientMessage = Schema.encodeEffect(ClientMessageMsgPack);

export const decodeServerMessage = Schema.decodeEffect(ServerMessageMsgPack);

export const encodeServerMessageUnsafe = Schema.encodeSync(ServerMessageMsgPack);
