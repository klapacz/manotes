import { DevEnv } from "@manotes/shared/dev-env";
import { fileURLToPath } from "node:url";
import { PortSchema } from "@manotes/shared/schema/port";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Command from "alchemy/Command";
import * as Effect from "effect/Effect";
import Worker from "./src/index.ts";
import { Config, Layer } from "effect";

export default Alchemy.Stack(
  "Manotes",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Command.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* Worker;
    const stage = yield* Alchemy.Stage;

    const web = yield* Cloudflare.Website.Vite("App", {
      rootDir: "../web",
      dev: {
        host: "127.0.0.1",
        port: PortSchema.decode(process.env[DevEnv.names.webPort]) ?? 5173,
        strictPort: true,
      },
      workersDev: false,
      domain: stage === "prod" ? "sand.manotes.dev" : undefined,
    });

    const dev = yield* Alchemy.ALCHEMY_DEV;
    const seedType = yield* Config.string(DevEnv.names.seedType).pipe(Config.withDefault(""));

    if (dev && seedType === "demo") {
      yield* Command.Exec("SeedDemo", {
        command: "node --import tsx scripts/seed.ts",
        cwd: fileURLToPath(new URL("../cli/", import.meta.url)),
        memo: false,
        timeout: "2 minutes",
        env: {
          [DevEnv.names.seedId]: yield* Config.nonEmptyString(DevEnv.names.seedId),
          [DevEnv.names.seedSecret]: yield* Config.redacted(DevEnv.names.seedSecret),
          [DevEnv.names.seedApiUrl]: worker.url,
          [DevEnv.names.url]: yield* Config.nonEmptyString(DevEnv.names.url),
        },
      });
    }

    return yield* getUrls({
      app: web.url,
      api: worker.url,
    });
  }),
);

const getUrls = Effect.fn("AppStack.getUrls")(function* (outputs: {
  app: Alchemy.Output<string | undefined, never>;
  api: Alchemy.Output<string | undefined, never>;
}) {
  const DEV = yield* Alchemy.ALCHEMY_DEV;

  if (!DEV) return outputs;

  const url = yield* Config.nonEmptyString(DevEnv.names.url);

  return {
    app: url,
    api: new URL("/api", url).href,
  };
});
