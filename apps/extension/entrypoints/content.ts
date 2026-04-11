import * as BrowserExtension from "@manotes/shared/browser-extension/contract";
import { Option, pipe } from "effect";
import { AppUrlMatchPatterns } from "../app-url";

// In MV3 the background is a service worker that Chrome terminates after ~30 s
// of inactivity. When that happens the runtime port disconnects and all further
// postMessage calls on it silently fail. We must reconnect the port so the
// content-script ↔ background bridge stays alive for the lifetime of the page.

export default defineContentScript({
  matches: AppUrlMatchPatterns,
  runAt: "document_start",
  main() {
    let port: Browser.runtime.Port;

    function connect() {
      port = browser.runtime.connect({
        name: BrowserExtension.BridgePortName,
      });

      port.onMessage.addListener((message) => {
        const response = pipe(
          BrowserExtension.decodeBridgeResponse(message),
          Option.getOrElse(() => null),
        );

        if (response === null) return;
        window.postMessage(response, window.location.origin);
      });

      port.onDisconnect.addListener(() => {
        connect();
      });
    }

    connect();

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;

      const request = pipe(
        BrowserExtension.decodeBridgeRequest(event.data),
        Option.getOrElse(() => null),
      );

      if (request === null) return;
      try {
        port.postMessage(request);
      } catch {
        connect();
        port.postMessage(request);
      }
    });
  },
});
