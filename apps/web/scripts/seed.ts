import { randomUUID } from "node:crypto";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { DevEnv } from "@manotes/shared/dev-env";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import { Config, Console, Effect, Layer, Option, Redacted, Schedule, Schema } from "effect";
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { Reactivity } from "effect/unstable/reactivity";
import { DevEntry } from "../../../scripts/dev-entry.ts";
import { CliConfig } from "../src/cli/cli.config";
import { CliDB } from "../src/cli/cli.db";
import { CliSync } from "../src/cli/cli.sync";
import * as DB from "../src/lib/db.service";
import * as EventRepo from "../src/lib/event.repo";
import { bundle } from "./generate-demo-graph";

const seed = Effect.gen(function* () {
  const id = yield* Config.schema(DevEntry.Id, DevEnv.names.seedId);
  const previous = yield* DevEntry.read(id).pipe(Effect.option);

  // Alchemy can reconcile again during the same dev invocation. Keep manual edits.
  if (Option.isSome(previous)) return id;

  const origin = yield* Config.nonEmptyString(DevEnv.names.seedApiUrl);
  const secret = yield* Config.redacted(DevEnv.names.seedSecret);

  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

  const session = yield* client
    .post(`${origin}/api/dev/seed-session`, {
      headers: { "x-manotes-dev-seed-secret": Redacted.value(secret) },
      body: HttpBody.jsonUnsafe({ seedId: id }),
    })
    .pipe(
      Effect.retry({ times: 30, schedule: Schedule.spaced("1 second") }),
      Effect.flatMap(decodeSession),
    );

  const graphPassword = Redacted.make(randomUUID());

  const key = yield* Effect.tryPromise(() =>
    GraphEncryption.createGraphKey(Redacted.value(graphPassword)),
  );

  const protocol = RpcClient.layerProtocolHttp({
    url: `${origin}/api/rpc/graph-registry`,
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(session.sessionToken)),
  }).pipe(Layer.provide(RpcSerialization.layerJson));

  const registry = yield* RpcClient.make(GraphRegistryRpc, { flatten: true }).pipe(
    Effect.provide(protocol),
  );

  const graph = yield* registry("createGraph", {
    displayName: bundle.sourceGraphDisplayName,
    graphKeyEnvelope: key.envelope,
  });

  yield* Effect.gen(function* () {
    const events = yield* EventRepo.Service;
    yield* events.importBackupEvents(bundle.events);
    yield* CliSync.run();
  }).pipe(
    Effect.provide(CliSync.layer),
    Effect.provide(EventRepo.Service.layer),
    Effect.provide(CliDB.layer),
    Effect.provideService(DB.Config, { localGraphId: graph.graphId, databasePath: ":memory:" }),
    Effect.provideService(CliConfig.Service, {
      origin,
      token: Redacted.value(session.sessionToken),
      graphId: graph.graphId,
      graphKey: Redacted.make(key.graphKey),
    }),
  );

  yield* DevEntry.write(id, {
    origin: yield* Config.nonEmptyString(DevEnv.names.url),
    sessionToken: session.sessionToken,
    graphId: graph.graphId,
    graphName: graph.displayName,
    graphPassword,
  });

  return id;
});

const Session = Schema.Struct({
  sessionToken: Schema.RedactedFromValue(Schema.String),
});

const decodeSession = HttpClientResponse.schemaBodyJson(Session);

NodeRuntime.runMain(
  seed.pipe(
    Effect.scoped,
    Effect.tap((id) => Console.log(`Demo graph synced. Open a fresh browser: vp run enter ${id}`)),
    // RPC errors can contain authenticated requests. Keep credentials out of terminal output.
    Effect.catchCause(() =>
      Effect.fail(new Error("Demo seeding failed. Restart dev --seed-type demo to try again.")),
    ),
    Effect.provide(NodeServices.layer),
    Effect.provide(Reactivity.layer),
    Effect.provide(FetchHttpClient.layer),
  ),
);
