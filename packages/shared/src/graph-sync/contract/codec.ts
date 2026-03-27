/**
 * Encodes and decodes graph sync wire messages with MsgPack.
 */
import * as MsgPack from "@effect/platform/MsgPack";
import { Schema } from "effect";
import { ClientMessage, ServerMessage } from "./messages";

const ClientMessageMsgPack = MsgPack.schema(ClientMessage);

const ServerMessageMsgPack = MsgPack.schema(ServerMessage);

export const decodeClientMessage = Schema.decode(ClientMessageMsgPack);

export const encodeClientMessage = Schema.encode(ClientMessageMsgPack);

export const decodeServerMessage = Schema.decode(ServerMessageMsgPack);

export const encodeServerMessageUnsafe = Schema.encodeSync(ServerMessageMsgPack);
