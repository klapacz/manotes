import { createHash, X509Certificate } from "node:crypto";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Redacted, Stream } from "effect";
import { Argument, Command } from "effect/unstable/cli";
import { Playwright, chromium } from "effect-playwright";
import { DevEntry } from "./dev-entry.ts";

export const run = Effect.fn("Enter.run")(
  function* (entry: DevEntry.Entry) {
    const playwright = yield* Playwright.Playwright;

    const browser = yield* playwright.launchScoped(chromium, {
      headless: false,
      // HTTP/1 limits concurrent Vite module requests through Portless.
      args: ["--disable-http2", ...certificateArgs(entry.caCertificate)],
    });

    const context = yield* browser.newContext();
    context.setDefaultTimeout(120_000);
    yield* context.addCookies([
      {
        name: "session",
        value: Redacted.value(entry.sessionToken),
        url: entry.origin,
        httpOnly: true,
        secure: entry.origin.startsWith("https:"),
        sameSite: "Lax",
      },
    ]);
    const page = yield* context.newPage;

    const unlockForm = page.locator("main").filter({ hasText: `Unlock ${entry.graphName}` });

    const password = unlockForm.getByLabel("Password", { exact: true });

    // Reloads discard the graph key. Keep using the normal password form.
    const unlock = Effect.gen(function* () {
      yield* password.waitFor({ state: "visible", timeout: 0 });
      yield* password.fill(Redacted.value(entry.graphPassword));
      yield* unlockForm.getByRole("button", { name: "Unlock graph", exact: true }).click();
      yield* password.waitFor({ state: "hidden" });
    }).pipe(Effect.forever);

    const open = Effect.gen(function* () {
      yield* page.goto(entry.origin);
      yield* page
        .getByRole("button", { name: /Open$/ })
        .filter({ hasText: entry.graphName })
        .click();
      yield* page
        .locator('[data-sync-state="Ready"][data-sync-pending="false"]')
        .waitFor({ state: "attached" });
      yield* page.locator('[contenteditable="true"]').first().waitFor({ state: "visible" });
      yield* Console.log("Demo graph is open and synced. Close Chromium or press Ctrl-C to exit.");
      yield* Effect.never;
    });

    const closed = Effect.raceFirst(
      page.eventStream("close").pipe(Stream.runHead),
      browser.eventStream("disconnected").pipe(Stream.runHead),
    );

    yield* Effect.raceFirst(closed, Effect.raceFirst(unlock, open)).pipe(
      Effect.catch((error) =>
        page.isClosed() || !browser.isConnected() ? Effect.void : Effect.fail(error),
      ),
    );
  },
  Effect.mapError(
    () => new Error("Could not enter the demo graph. Check that its dev server is running."),
  ),
);

function certificateArgs(pem: string | undefined) {
  if (!pem) return [];
  const key = new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" });
  const fingerprint = createHash("sha256").update(key).digest("base64");

  return [`--ignore-certificate-errors-spki-list=${fingerprint}`];
}

const cli = Command.make(
  "enter",
  {
    id: Argument.string("id").pipe(Argument.withSchema(DevEntry.Id)),
  },
  ({ id }) => DevEntry.read(id).pipe(Effect.flatMap(run)),
);

if (import.meta.main) {
  NodeRuntime.runMain(
    Command.run(cli, { version: "0.0.0" }).pipe(
      Effect.scoped,
      Effect.provide(NodeServices.layer),
      Effect.provide(Playwright.layer),
    ),
  );
}
