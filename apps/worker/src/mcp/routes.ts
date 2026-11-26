import { McpToken } from "@manotes/shared/mcp/token";
import { Duration, Effect, Layer, Option, Schema } from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai";
import { HttpRouter } from "effect/http";
import GraphRegistryDurableObject from "../graph-registry/durable-object.ts";
import GraphSyncDurableObject from "../graph-sync/durable-object.ts";
import { RELAY_TIMEOUT, type SendReason } from "../graph-sync/relay-calls.ts";

const timeoutSeconds = Duration.toSeconds(RELAY_TIMEOUT);

const refusals: Record<SendReason, string> = {
  Duplicate: "This request is already in flight. Don't resend unless the user asks.",
  NoDevice: "No device is connected to this graph. It did not run.",
  SendFailed: "Failed to deliver request to the device. It did not run.",
  Disconnected: "The device disconnected before replying. It may have run.",
  Timeout: `No answer within ${timeoutSeconds} seconds. It may have run.`,
};

class ToolError extends Schema.TaggedError<ToolError>()("McpRoutes.ToolError", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

const SendTool = Tool.make("send", {
  description: `Send an encrypted script request to a connected device for this graph and wait up to ${timeoutSeconds} seconds for the encrypted answer.`,
  parameters: Schema.Struct({
    requestId: Schema.NonEmptyString,
    envelope: Schema.NonEmptyString,
  }),
  success: Schema.Struct({ envelope: Schema.String }),
  failure: ToolError,
});

const McpToolkit = Toolkit.make(SendTool);

const TokenParams = Schema.Struct({ token: Schema.NonEmptyString });

// Read RouteContext optionally so declaring the toolkit layer does not require it in R.
const readToken = Effect.serviceOption(HttpRouter.RouteContext).pipe(
  Effect.flatMap(Effect.fromOption),
  Effect.flatMap(({ params }) => Schema.decodeUnknownEffect(TokenParams)(params)),
  Effect.flatMap(({ token }) => McpToken.decode(token)),
  Effect.mapError(() => new ToolError({ reason: "Invalid MCP token." })),
);

const handlers = Layer.unwrap(
  Effect.gen(function* () {
    const graphRegistryNS = yield* GraphRegistryDurableObject;
    const graphSyncNS = yield* GraphSyncDurableObject;

    return McpToolkit.toLayer({
      send: Effect.fn("McpRoutes.send")(function* ({ requestId, envelope }) {
        const { accountId, graphId } = yield* readToken;

        const registry = yield* graphRegistryNS.getByName(accountId);
        const graph = yield* registry.getGraph({ graphId }).pipe(Effect.orDie);

        if (Option.isNone(graph)) return yield* new ToolError({ reason: "Graph not found." });

        const outcome = yield* graphSyncNS
          .getByName(JSON.stringify([accountId, graphId]))
          .relaySend({ requestId, envelope })
          .pipe(Effect.orDie);

        if (outcome.status === "refused") {
          return yield* new ToolError({ reason: refusals[outcome.reason] });
        }

        return { envelope: outcome.envelope };
      }),
    });
  }),
);

export const layer = McpServer.toolkit(McpToolkit).pipe(
  Layer.provide(handlers),
  Layer.provideMerge(
    McpServer.layerHttpRequestScoped({
      name: "manotes",
      version: "0.0.0",
      path: "/mcp/:token",
      protocols: [McpProtocol.v2026_07_28],
    }),
  ),
  Layer.orDie,
);

export * as McpRoutes from "./routes.ts";
