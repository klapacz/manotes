import { Schema } from "effect";

export const BridgeChannel = "manotes-browser-extension";

export const BridgePortName = BridgeChannel;

const MessageBase = {
  channel: Schema.Literal(BridgeChannel),
};

export const TabCandidate = Schema.Struct({
  id: Schema.Number,
  windowId: Schema.Number,
  url: Schema.NonEmptyString,
  title: Schema.String,
});

export type TabCandidate = typeof TabCandidate.Type;

export const ListTabsRequest = Schema.Struct({
  ...MessageBase,
  kind: Schema.Literal("request"),
  type: Schema.Literal("listTabs"),
});

export type ListTabsRequest = typeof ListTabsRequest.Type;

export const BridgeRequest = ListTabsRequest;

export type BridgeRequest = typeof BridgeRequest.Type;

export const ListTabsResponse = Schema.Struct({
  ...MessageBase,
  kind: Schema.Literal("response"),
  type: Schema.Literal("listTabs"),
  tabs: Schema.Array(TabCandidate),
});

export type ListTabsResponse = typeof ListTabsResponse.Type;

export const BridgeResponse = ListTabsResponse;

export type BridgeResponse = typeof BridgeResponse.Type;

export const decodeBridgeRequest = Schema.decodeUnknownOption(BridgeRequest);

export const decodeBridgeResponse = Schema.decodeUnknownOption(BridgeResponse);

export function makeListTabsRequest(): ListTabsRequest {
  return {
    channel: BridgeChannel,
    kind: "request",
    type: "listTabs",
  };
}

export function makeListTabsResponse(tabs: ReadonlyArray<TabCandidate>): ListTabsResponse {
  return {
    channel: BridgeChannel,
    kind: "response",
    type: "listTabs",
    tabs: Array.from(tabs),
  };
}
