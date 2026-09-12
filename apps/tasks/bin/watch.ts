import { watch } from "node:fs";
import { fileURLToPath } from "node:url";

// Bun 1.3.9 and 1.3.10 miss imported TSX loaded by OpenTUI's onLoad plugin
// under --watch. Verified with the actual preload: imported-file edits did not
// reload, while entrypoint edits did. Watch source directories outside the
// renderer process so writes and rename-on-save get a fresh Solid/native runtime.
const workspace = new URL("../../../", import.meta.url);

const args = process.argv.slice(2).filter((arg) => arg !== "--watch");

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

const command = [
  process.execPath,
  "--preload",
  fileURLToPath(new URL("./preload.ts", import.meta.url)),
  fileURLToPath(new URL("../src/main.tsx", import.meta.url)),
  ...args,
];

let stopped = false;

let restartRequested = false;

let timer: ReturnType<typeof setTimeout> | undefined;

let killTimer: ReturnType<typeof setTimeout> | undefined;

let child: ReturnType<typeof Bun.spawn> | undefined;

let wake: (() => void) | undefined;

const watchers = (
  interactive
    ? [
        "apps/tasks/src",
        "apps/tasks/bin",
        "apps/web/src",
        "apps/web/drizzle",
        "packages/shared/src",
      ]
    : []
).map((dir) =>
  watch(new URL(dir, workspace), { recursive: true }, (_event, filename) => {
    if (stopped || filename?.split(/[\\/]/).includes("node_modules")) return;

    if (filename && !/\.(?:[cm]?[jt]sx?|json|sql)$/.test(filename)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      restartRequested = true;

      if (child) terminateChild();
      else wake?.();
    }, 100);
  }).on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  }),
);

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, stop);

try {
  while (!stopped) {
    restartRequested = false;
    child = Bun.spawn(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    const exitCode = await child.exited;
    clearTimeout(killTimer);
    killTimer = undefined;
    child = undefined;

    if (stopped) break;

    if (restartRequested) continue;

    if (exitCode === 0 || !interactive) {
      process.exitCode = exitCode;
      break;
    }

    console.error(`Task browser exited with code ${exitCode}. Waiting for a source change...`);
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
    wake = undefined;
  }
} finally {
  stop();
}

function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(timer);

  for (const watcher of watchers) watcher.close();
  terminateChild();
  wake?.();
}

function terminateChild() {
  const current = child;

  if (!current || killTimer) return;
  current.kill("SIGTERM");
  // Wait for cleanup before respawning, but bound a stuck finalizer.
  killTimer = setTimeout(() => current.kill("SIGKILL"), 5000);
}
