import { SqlClient } from "@effect/sql";
import { SqliteClient } from "@effect/sql-sqlite-do";
import { Cause, ManagedRuntime, Option, Predicate, Schema } from "effect";
import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import * as Repo from "./repo";
import * as GraphSchema from "./schema";

type GraphRegistryRuntime = ManagedRuntime.ManagedRuntime<
  SqlClient.SqlClient,
  never
>;

const app = new Hono<{
  Bindings: Env & { runtime: GraphRegistryRuntime };
}>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

app.get("/graphs", async (c) => {
  const graphs = await c.env.runtime.runPromise(Repo.listGraphs());
  return c.json(graphs);
});

app.post(
  "/graphs",
  sValidator(
    "json",
    Schema.Struct({
      displayName: GraphSchema.DisplayNameSchema,
    }).pipe(Schema.standardSchemaV1),
  ),
  async (c) => {
    const body = c.req.valid("json");

    const result = await c.env.runtime.runPromiseExit(
      Repo.createGraph({
        displayName: body.displayName,
      }),
    );

    if (result._tag === "Success") {
      return c.json(result.value, 201);
    }

    return handleFailure(result.cause);
  },
);

app.get("/graphs/:graphId", async (c) => {
  const graph = await c.env.runtime.runPromise(
    Repo.getGraph({
      graphId: c.req.param("graphId"),
    }),
  );

  return Option.match(graph, {
    onNone: () => c.json({ error: "Not found" }, 404),
    onSome: (value) => c.json(value),
  });
});

app.patch(
  "/graphs/:graphId",
  sValidator(
    "json",
    Schema.Struct({
      displayName: GraphSchema.DisplayNameSchema,
    }).pipe(Schema.standardSchemaV1),
  ),
  async (c) => {
    const body = c.req.valid("json");

    const result = await c.env.runtime.runPromiseExit(
      Repo.renameGraph({
        graphId: c.req.param("graphId"),
        displayName: body.displayName,
      }),
    );

    if (result._tag === "Success") {
      return Option.match(result.value, {
        onNone: () => c.json({ error: "Not found" }, 404),
        onSome: (value) => c.json(value),
      });
    }

    return handleFailure(result.cause);
  },
);

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export class GraphRegistryDurableObject extends DurableObject<Env> {
  private readonly runtime = ManagedRuntime.make(
    SqliteClient.layer({
      db: this.ctx.storage.sql,
      spanAttributes: {
        durableObject: "GraphRegistryDurableObject",
      },
    }),
  );

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    ctx.blockConcurrencyWhile(() => this.runtime.runPromise(Repo.migrate));
  }

  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, {
      ...this.env,
      runtime: this.runtime,
    });
  }

  async graphExists(graphId: string): Promise<boolean> {
    const graph = await this.runtime.runPromise(
      Repo.getGraph({
        graphId,
      }),
    );

    return Option.isSome(graph);
  }
}

function handleFailure(cause: Cause.Cause<unknown>) {
  const failure = Cause.failureOption(cause);

  if (
    Option.isSome(failure) &&
    Predicate.isTagged(failure.value, "GraphRegistry.DisplayNameTakenError")
  ) {
    return Response.json(
      { error: "A graph with that name already exists." },
      { status: 409 },
    );
  }

  return Response.json({ error: Cause.pretty(cause) }, { status: 500 });
}
