import { Effect, DateTime, Layer } from "effect";
import { DB, EventRepo, Migrator } from "./lib";

const AppLive = Layer.mergeAll(EventRepo.Service.Default, DB.Service.Default);

const program = Effect.gen(function* () {
  yield* Migrator.migrate;

  const eventRepo = yield* EventRepo.Service;

  const returned = yield* eventRepo.create({
    type: "create",
    payload: new Uint8Array([1, 2, 3]),
    timestamp: yield* DateTime.now,
  });

  console.log(returned);
}).pipe(Effect.provide(AppLive));

Effect.runCallback(program, {
  onExit: (exit) => {
    console.log("Program exited:", exit);
  },
});
