import { Server } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices, NodeSocketServer } from "@effect/platform-node";
import { ConfigProvider, Deferred, Effect, Fiber, Runtime, Stdio } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { RouteConflictError, RouteStore } from "portless";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DevEnv } from "../packages/shared/src/dev-env.ts";
import { PortSchema } from "../packages/shared/src/schema/port.ts";
import { DevPorts } from "./dev-ports.ts";
import { DevStage } from "./dev-stage.ts";
import { main } from "./dev.ts";

const store = new RouteStore(join(homedir(), ".cache", "manotes", "dev-ports"));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("DevStage.get", () => {
  it("trims the workspace name and username before constructing the stage", () => {
    expect(readStage("  01\n", " developer ")).toEqual({
      workspace: "01",
      stage: "dev_developer_01",
    });
  });

  it.each(["", "  ", "\n"])("rejects an empty workspace name %j", (workspace) => {
    expect(() => readStage(workspace, "developer")).toThrow();
  });

  it("normalizes the configured username for Alchemy's stage", () => {
    expect(readStage("default", " first.last@host ").stage).toBe("dev_first_last_host_default");
  });

  it.each([undefined, "", "  "])("rejects an absent or empty USER value %j", (user) => {
    expect(() => readStage("default", user)).toThrow();
  });
});

describe("reservePorts", () => {
  it("keeps distinct ports claimed but available for servers until the scope closes", async () => {
    const before = store.loadRoutes();
    await Effect.runPromise(
      Effect.gen(function* () {
        const ports = yield* DevPorts.reservePorts();
        const values = Object.values(ports);
        expect(new Set(values).size).toBe(3);
        expect(store.loadRoutes()).toEqual(
          expect.arrayContaining(
            values.map((port) => ({ hostname: String(port), port, pid: process.pid })),
          ),
        );
        yield* Effect.forEach(values, (port) => NodeSocketServer.make({ host: "127.0.0.1", port }));
      }).pipe(Effect.scoped),
    );
    expect(store.loadRoutes()).toEqual(before);
  });

  it("keeps concurrent allocations distinct until released", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const leases = yield* Effect.all([DevPorts.reservePorts(), DevPorts.reservePorts()], {
          concurrency: "unbounded",
        });

        const ports = leases.flatMap((lease) => [lease.web, lease.api, lease.extension]);
        expect(new Set(ports).size).toBe(6);
      }).pipe(Effect.scoped),
    );
  });

  it("shares claims even when devshells have different temporary directories", async () => {
    const before = store.loadRoutes();
    const temporary = tmpdir();

    await Effect.runPromise(
      Effect.gen(function* () {
        vi.stubEnv("TMPDIR", join(temporary, "manotes-first-shell"));
        const first = yield* DevPorts.reservePorts();
        vi.stubEnv("TMPDIR", join(temporary, "manotes-second-shell"));
        const second = yield* DevPorts.reservePorts();

        expect(store.loadRoutes()).toHaveLength(before.length + 6);
        expect(new Set([...Object.values(first), ...Object.values(second)]).size).toBe(6);
      }).pipe(Effect.scoped),
    );
    expect(store.loadRoutes()).toEqual(before);
  });

  it("retries a port claimed by another process during the TCP probe", async () => {
    const add = vi.spyOn(RouteStore.prototype, "addRoute").mockImplementationOnce(() => {
      throw new RouteConflictError("claimed", process.pid);
    });

    await Effect.runPromise(DevPorts.reservePorts().pipe(Effect.scoped));
    expect(add).toHaveBeenCalledTimes(4);
  });

  it("does not reuse a port already claimed by the same process", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* DevPorts.reservePorts();
        vi.spyOn(Server.prototype, "address").mockReturnValueOnce({
          port: first.web,
          address: "127.0.0.1",
          family: "IPv4",
        });
        const second = yield* DevPorts.reservePorts();
        expect(new Set([...Object.values(first), ...Object.values(second)]).size).toBe(6);
      }).pipe(Effect.scoped),
    );
  });

  it("closes a probe that unexpectedly returns a Unix socket address", async () => {
    const before = store.loadRoutes();
    const probe = vi.spyOn(Server.prototype, "address").mockReturnValueOnce("unix-socket");

    await expect(Effect.runPromise(DevPorts.reservePorts().pipe(Effect.scoped))).rejects.toThrow(
      "Could not reserve a dev server port",
    );
    expect(probe.mock.contexts[0]).toMatchObject({ listening: false });
    expect(store.loadRoutes()).toEqual(before);
  });

  it("releases earlier claims when a later allocation fails without retrying filesystem errors", async () => {
    const before = store.loadRoutes();
    const addRoute = RouteStore.prototype.addRoute.bind(store);

    const add = vi
      .spyOn(RouteStore.prototype, "addRoute")
      .mockImplementationOnce(addRoute)
      .mockImplementationOnce(() => {
        throw new Error("store is not writable");
      });

    await expect(Effect.runPromise(DevPorts.reservePorts().pipe(Effect.scoped))).rejects.toThrow(
      "Could not reserve a dev server port",
    );
    expect(add).toHaveBeenCalledTimes(2);
    expect(store.loadRoutes()).toEqual(before);
  });

  it("bounds retries when every candidate is claimed", async () => {
    const before = store.loadRoutes();

    const add = vi.spyOn(RouteStore.prototype, "addRoute").mockImplementation(() => {
      throw new RouteConflictError("claimed", process.pid);
    });

    await expect(Effect.runPromise(DevPorts.reservePorts().pipe(Effect.scoped))).rejects.toThrow(
      "Could not reserve a dev server port",
    );
    expect(add).toHaveBeenCalledTimes(100);
    expect(store.loadRoutes()).toEqual(before);
  });

  it("releases claims when the running session is interrupted", async () => {
    const before = store.loadRoutes();
    await Effect.runPromise(
      Effect.gen(function* () {
        const ready = yield* Deferred.make<void>();

        const session = yield* DevPorts.reservePorts().pipe(
          Effect.andThen(Deferred.succeed(ready, undefined)),
          Effect.andThen(Effect.never),
          Effect.scoped,
          Effect.forkChild,
        );

        yield* Deferred.await(ready);
        expect(store.loadRoutes()).toHaveLength(before.length + 3);
        yield* Fiber.interrupt(session);
        expect(store.loadRoutes()).toEqual(before);
      }),
    );
  });
});

describe("main", () => {
  it.each(["--invalid", "--servers"])(
    "rejects unsupported argument %s before starting commands",
    async (flag) => {
      const spawner = makeSpawner();

      await expect(
        Effect.runPromise(
          run([flag]).pipe(
            Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
            Effect.provide(NodeServices.layer),
          ),
        ),
      ).rejects.toThrow();
      expect(spawner.string).not.toHaveBeenCalled();
      expect(spawner.exitCode).not.toHaveBeenCalled();
    },
  );

  it("supports CLI help without building packages or claiming ports", async () => {
    const spawner = makeSpawner();
    const before = store.loadRoutes();

    await Effect.runPromise(
      run(["--help"]).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(spawner.string).not.toHaveBeenCalled();
    expect(spawner.exitCode).not.toHaveBeenCalled();
    expect(store.loadRoutes()).toEqual(before);
  });

  it.each([
    { workspace: "default", extension: false },
    { workspace: "01", extension: true },
  ])(
    "launches $workspace directly through Portless with extension=$extension",
    async ({ workspace, extension }) => {
      const spawner = makeSpawner(workspace);
      const before = store.loadRoutes();
      vi.stubEnv(DevEnv.names.extensionPort, "invalid inherited port");
      vi.stubEnv(DevEnv.names.stage, "prod");

      spawner.exitCode.mockImplementation((command) =>
        Effect.sync(() => {
          if (!ChildProcess.isStandardCommand(command))
            throw new Error("Expected a single command");

          if (command.command === "vp") return ChildProcessSpawner.ExitCode(0);

          const env = command.options.env;
          const webPort = PortSchema.decode(env?.[DevEnv.names.webPort] ?? "");
          const apiPort = PortSchema.decode(env?.[DevEnv.names.apiPort] ?? "");
          expect(webPort).not.toBe(apiPort);
          expect(env?.[DevEnv.names.stage]).toMatch(new RegExp(`^dev_.+_${workspace}$`));
          expect(command.args.slice(1, 9)).toEqual([
            `${workspace}.manotes`,
            "--app-port",
            String(webPort),
            "vp",
            "run",
            "--parallel",
            "--log",
            "labeled",
          ]);
          expect(command.args).not.toContain("--servers");
          expect(command.args).not.toContain(import.meta.filename.replace("dev.test.ts", "dev.ts"));
          expect(command.args.includes("@manotes/extension")).toBe(extension);
          expect(command.args.at(-1)).toBe("dev");
          expect(store.loadRoutes()).toHaveLength(before.length + 3);
          const extensionPort = PortSchema.decode(env?.[DevEnv.names.extensionPort] ?? "");
          expect(new Set([webPort, apiPort, extensionPort]).size).toBe(3);

          return ChildProcessSpawner.ExitCode(0);
        }),
      );

      await Effect.runPromise(
        run(extension ? ["--extension"] : []).pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provide(NodeServices.layer),
        ),
      );
      expect(spawner.string).toHaveBeenCalledOnce();
      expect(spawner.exitCode).toHaveBeenCalledTimes(3);
      expect(store.loadRoutes()).toEqual(before);
    },
  );

  it.each([1, 3])(
    "preserves command failure exit codes and releases claims after command %i",
    async (failedCommand) => {
      const spawner = makeSpawner();
      const before = store.loadRoutes();
      let calls = 0;
      spawner.exitCode.mockImplementation(() =>
        Effect.sync(() => ChildProcessSpawner.ExitCode(++calls === failedCommand ? 17 : 0)),
      );

      const error = await Effect.runPromise(
        run([]).pipe(
          Effect.flip,
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provide(NodeServices.layer),
        ),
      );

      expect(Runtime.getErrorExitCode(error)).toBe(17);
      expect(spawner.exitCode).toHaveBeenCalledTimes(failedCommand);
      expect(store.loadRoutes()).toEqual(before);
    },
  );
});

function makeSpawner(workspace = "01") {
  return {
    ...ChildProcessSpawner.make(() => Effect.die("Unexpected process spawn")),
    string: vi.fn(() => Effect.succeed(`${workspace}\n`)),
    exitCode: vi.fn((_command: ChildProcess.Command) =>
      Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    ),
  };
}

function readStage(workspace: string, user: string | undefined) {
  return Effect.runSync(
    DevStage.get(import.meta.dirname).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, makeSpawner(workspace)),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ USER: user }),
      ),
    ),
  );
}

function run(args: ReadonlyArray<string>) {
  return main.pipe(Effect.provide(Stdio.layerTest({ args: Effect.succeed(args) })));
}
