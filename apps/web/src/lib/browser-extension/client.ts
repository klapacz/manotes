import * as BrowserExtension from "@manotes/shared/browser-extension/contract";
import { Effect, Option, pipe, Queue, Stream } from "effect";

export const watchTabs = Stream.callback<BrowserExtension.TabCandidate[]>((queue) =>
  Effect.sync(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;

      const response = pipe(
        BrowserExtension.decodeBridgeResponse(event.data),
        Option.getOrElse(() => null),
      );

      if (response === null || response.type !== "listTabs") return;
      Queue.offerUnsafe(queue, Array.from(response.tabs));
    };

    window.addEventListener("message", onMessage);
    window.postMessage(BrowserExtension.makeListTabsRequest(), window.location.origin);

    return pipe(
      Effect.sync(() => window.removeEventListener("message", onMessage)),
      Effect.andThen(Queue.end(queue)),
    );
  }),
);
