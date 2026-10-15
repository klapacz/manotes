import { BrowserExtension } from "@manotes/shared/browser-extension/contract";
import { Match, Option, pipe } from "effect";
import { isAppUrl } from "../app-url";

const ports = new Set<Browser.runtime.Port>();

export default defineBackground(() => {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== BrowserExtension.BridgePortName) return;

    ports.add(port);

    port.onDisconnect.addListener(() => {
      ports.delete(port);
    });

    port.onMessage.addListener((message) => {
      const request = pipe(
        BrowserExtension.decodeBridgeRequest(message),
        Option.getOrElse(() => null),
      );

      if (request !== null) void handleMessage(request);
    });
  });

  browser.tabs.onCreated.addListener(() => {
    void broadcastTabs();
  });
  browser.tabs.onRemoved.addListener(() => {
    void broadcastTabs();
  });
  browser.tabs.onUpdated.addListener(() => {
    void broadcastTabs();
  });
  browser.tabs.onActivated.addListener(() => {
    void broadcastTabs();
  });
});

async function handleMessage(request: BrowserExtension.BridgeRequest) {
  await Match.value(request).pipe(
    Match.when({ type: "listTabs" }, async () => {
      await broadcastTabs();
    }),
    Match.exhaustive,
  );
}

async function broadcastTabs() {
  try {
    const tabs = await browser.tabs.query({});

    broadcastMessage(
      BrowserExtension.makeListTabsResponse(
        tabs.flatMap((tab) => {
          const normalized = normalizeTab(tab);

          return normalized === null ? [] : [normalized];
        }),
      ),
    );
  } catch (error) {
    console.error("Error while broadcasting tabs", error);
  }
}

function broadcastMessage(message: BrowserExtension.BridgeResponse) {
  for (const port of ports) {
    try {
      port.postMessage(message);
    } catch {
      ports.delete(port);
    }
  }
}

function normalizeTab(tab: Browser.tabs.Tab): BrowserExtension.TabCandidate | null {
  if (tab.id === undefined || tab.windowId === undefined || !tab.url || isAppUrl(tab.url)) {
    return null;
  }

  return {
    id: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title ?? "",
  };
}
