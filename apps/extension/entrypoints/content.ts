import * as BrowserExtension from "@manotes/shared/browser-extension/contract";
import { Option, pipe } from "effect";
import { AppUrlMatchPatterns } from "../app-url";

export default defineContentScript({
  matches: AppUrlMatchPatterns,
  runAt: "document_start",
  main() {
    const port = browser.runtime.connect({
      name: BrowserExtension.BridgePortName,
    });

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;

      const request = pipe(
        BrowserExtension.decodeBridgeRequest(event.data),
        Option.getOrElse(() => null),
      );

      if (request === null) return;
      port.postMessage(request);
    });

    port.onMessage.addListener((message) => {
      const response = pipe(
        BrowserExtension.decodeBridgeResponse(message),
        Option.getOrElse(() => null),
      );

      if (response === null) return;
      window.postMessage(response, window.location.origin);
    });
  },
});
