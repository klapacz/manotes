import { homedir } from "node:os";
import { join } from "node:path";
import { NodeSocketServer } from "@effect/platform-node";
import { Cause, Effect, Match } from "effect";
import { RouteConflictError, RouteStore } from "portless";

export const reservePorts = Effect.fn("DevPorts.reservePorts")(function* () {
  // Nix gives each shell its own TMPDIR. Use a stable per-user store so separate
  // workspaces share atomic claims without publishing internal ports as proxy routes.
  const store = yield* Effect.try(
    () => new RouteStore(join(homedir(), ".cache", "manotes", "dev-ports")),
  );

  return yield* Effect.all({
    web: reservePort(store),
    api: reservePort(store),
    extension: reservePort(store),
  });
});

const reservePort = Effect.fn("DevPorts.reservePort")(function* (store: RouteStore) {
  // The short-lived TCP probe closes before the server starts. Its claim stays
  // registered until the enclosing dev session ends, including on interruption.
  return yield* Effect.acquireRelease(
    claimPort(store).pipe(
      Effect.retry({
        times: 99,
        while: (error) => Cause.isUnknownError(error) && error.cause instanceof RouteConflictError,
      }),
      Effect.mapError((cause) => new Error("Could not reserve a dev server port.", { cause })),
    ),
    (port) => Effect.sync(() => store.removeRoute(String(port), process.pid)),
  );
});

const claimPort = Effect.fn("DevPorts.claimPort")(function* (store: RouteStore) {
  const { address } = yield* NodeSocketServer.make({ host: "127.0.0.1", port: 0 });

  const port = yield* Match.value(address).pipe(
    Match.tag("TcpAddress", ({ port }) => Effect.succeed(port)),
    Match.orElse(() => Effect.fail(new Error("The TCP probe did not return an IP address."))),
  );

  yield* Effect.try(() => {
    const owner = store.loadRoutes().find((route) => route.port === port);

    // RouteStore permits replacement by the same PID. Our concurrent scopes must not.
    if (owner) throw new RouteConflictError(String(port), owner.pid);

    store.addRoute(String(port), port, process.pid);
  });

  return port;
}, Effect.scoped);

export * as DevPorts from "./dev-ports.ts";
