import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as KeyStore from "../key-store/service";
import type * as LocalRegistry from "../local-registry/schema";
import { CliSetup } from "./cli-setup";

const graph: LocalRegistry.CloudRecord = {
  localGraphId: "local-id",
  graphId: "cloud'id; $(printf wrong)",
  displayName: "My graph",
  accountId: "account-id",
  mode: "cloud",
  status: "active",
  graphKeyEnvelope: {
    version: 0,
    iterations: 600_000,
    salt: new Uint8Array(16),
    wrappingIv: new Uint8Array(12),
    wrappedGraphKey: new Uint8Array(48),
  },
};
const origin = "https://manotes.example";
const graphKey = new Uint8Array(32).fill(7);

afterEach(() => vi.unstubAllGlobals());

describe("CliSetup.prepare", () => {
  it("uses the in-memory key and cloud ID, quotes arguments, and only requests a token", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ apiKey: "cli-token" }));

    const command = await Effect.runPromise(
      Effect.gen(function* () {
        const keys = yield* KeyStore.Service;
        yield* keys.set(graph.graphKeyEnvelope, graphKey);
        return yield* CliSetup.prepare({ graph, origin });
      }).pipe(
        Effect.provide(KeyStore.Service.layer),
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    );

    expect(command).toBe(
      " manotes init --origin 'https://manotes.example' --token 'cli-token' " +
        "--graph-id 'cloud'\\''id; $(printf wrong)' " +
        `--graph-key '${Buffer.from(graphKey).toString("base64")}'`,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0];
    expect(request?.[0]).toEqual(new URL(`${origin}/api/auth/api-key`));
    expect(request?.[1]?.method).toBe("POST");
    // Encryption material stays in the browser. The server only issues authentication.
    expect(request?.[1]?.body).toBeUndefined();
  });

  it("does not issue a token when the graph has been locked", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();

    await expect(
      Effect.runPromise(
        CliSetup.prepare({ graph, origin }).pipe(
          Effect.provide(KeyStore.Service.layer),
          Effect.provide(FetchHttpClient.layer),
          Effect.provideService(FetchHttpClient.Fetch, fetch),
        ),
      ),
    ).rejects.toThrow("Unlock the graph before setting up the CLI.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not produce a command when authentication fails", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* KeyStore.Service;
          yield* keys.set(graph.graphKeyEnvelope, graphKey);
          return yield* CliSetup.prepare({ graph, origin });
        }).pipe(
          Effect.provide(KeyStore.Service.layer),
          Effect.provide(FetchHttpClient.layer),
          Effect.provideService(FetchHttpClient.Fetch, fetch),
        ),
      ),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("CliSetup.copy", () => {
  it("copies the prepared command verbatim without issuing another token", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("fetch", fetch);
    const command = " manotes init --token 'test-token'";

    await Effect.runPromise(CliSetup.copy(command));
    await Effect.runPromise(CliSetup.copy(command));

    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenNthCalledWith(1, command);
    expect(writeText).toHaveBeenNthCalledWith(2, command);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows retrying a clipboard failure with the same prepared command", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Clipboard denied"))
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const command = " manotes init --token 'test-token'";

    await expect(Effect.runPromise(CliSetup.copy(command))).rejects.toThrow(
      "Could not copy the init command.",
    );
    await Effect.runPromise(CliSetup.copy(command));

    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith(command);
  });
});
