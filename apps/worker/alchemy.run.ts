import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import Worker from "./src/index.ts";

export default Alchemy.Stack(
  "Manotes",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* Worker;
    const stage = yield* Alchemy.Stage;

    const web = yield* Cloudflare.Website.Vite("App", {
      rootDir: "../web",
      dev: { port: 5173 },
      workersDev: false,
      domain: stage === "prod" ? "sand.manotes.dev" : undefined,
    });

    return {
      app: web.url,
      workerUrl: worker.url,
    };
  }),
);
