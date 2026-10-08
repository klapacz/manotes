import { Cause, Effect, Exit, Layer, PlatformError, Result } from "effect";
import { CliError } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";
import { expect, it } from "vite-plus/test";
import { CliUrl } from "./url";

it("keeps the spawn failure cause without exposing it in the user message", async () => {
  const cause = PlatformError.badArgument({
    module: "ChildProcess",
    method: "spawn",
    description: "secret-token",
  });

  const result = await Effect.runPromise(
    CliUrl.open("https://example.com").pipe(
      Effect.provide(
        Layer.succeed(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() => Effect.fail(cause)),
        ),
      ),
      Effect.scoped,
      Effect.result,
    ),
  );

  expect(Result.isFailure(result)).toBe(true);

  if (!Result.isFailure(result)) return;
  expect(result.failure).toBeInstanceOf(CliError.UserError);
  expect(result.failure.cause).toBe(cause);
  expect(result.failure.userMessage).toBe(
    "Could not open the browser. Open the printed URL manually.",
  );
  expect(result.failure.message).not.toContain("secret-token");
});

it("leaves unexpected defects in the defect channel", async () => {
  const defect = new Error("unexpected defect");

  const exit = await Effect.runPromiseExit(
    CliUrl.open("https://example.com").pipe(
      Effect.provide(
        Layer.succeed(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() => Effect.die(defect)),
        ),
      ),
      Effect.scoped,
    ),
  );

  expect(Exit.isFailure(exit)).toBe(true);

  if (!Exit.isFailure(exit)) return;
  expect(Cause.hasDies(exit.cause)).toBe(true);
  expect(Cause.hasFails(exit.cause)).toBe(false);
});

it("wraps an unsupported platform with manual opening instructions", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });

  try {
    const result = await Effect.runPromise(
      CliUrl.open("https://example.com").pipe(
        Effect.provide(
          Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make(() => Effect.die("must not spawn")),
          ),
        ),
        Effect.scoped,
        Effect.result,
      ),
    );

    expect(Result.isFailure(result)).toBe(true);

    if (!Result.isFailure(result)) return;
    expect(result.failure.cause).toEqual(new Error("Opening URLs is not supported on win32."));
    expect(result.failure.userMessage).toContain("Open the printed URL manually.");
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
});
