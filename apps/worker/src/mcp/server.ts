import { Duration, Effect, Exit, Layer, Schema, Scope } from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai";
import { HttpRouter, HttpServer } from "effect/http";
import { RELAY_TIMEOUT, type RelayCalls, type SendReason } from "../graph-sync/relay-calls.ts";

const timeoutSeconds = Duration.toSeconds(RELAY_TIMEOUT);

const refusals: Record<SendReason, string> = {
  Duplicate: "This request is already in flight. Don't resend unless the user asks.",
  NoDevice: "No device is connected to this graph. It did not run.",
  SendFailed: "Failed to deliver request to the device. It did not run.",
  Disconnected: "The device disconnected before replying. It may have run.",
  Timeout: `No answer within ${timeoutSeconds} seconds. It may have run.`,
};

class ToolError extends Schema.TaggedError<ToolError>()("McpRelayServer.ToolError", {
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

/** Builds the MCP HTTP handler inside `GraphSyncDurableObject` so sessionful protocols (2025-*) work natively. */
export const makeHttpEffect = (relayCalls: RelayCalls.Registry) => {
  const handlers = McpToolkit.toLayer({
    send: Effect.fn("McpRelayServer.send")(function* ({ requestId, envelope }) {
      const answer = yield* relayCalls
        .send({ requestId, envelope })
        .pipe(Effect.mapError(({ reason }) => new ToolError({ reason: refusals[reason] })));

      return { envelope: answer };
    }),
  });

  const mcpLayer = McpServer.toolkit(McpToolkit).pipe(
    Layer.provide(handlers),
    Layer.provideMerge(
      McpServer.layerHttp({
        name: "manotes",
        version: "0.0.0",
        path: "/mcp/:token",
        allowSessionTermination: true,
        // Effect's McpServer rejects any request carrying an Origin header unless it is listed here
        // (no wildcard option); non-browser clients omit Origin, so keep a best-effort web allowlist.
        allowedOrigins: ["https://claude.ai", "https://chatgpt.com", "https://gemini.google.com"],
        protocols: [
          McpProtocol.v2026_07_28,
          McpProtocol.v2025_11_25,
          McpProtocol.v2025_06_18,
          McpProtocol.v2025_03_26,
        ],
      }),
    ),
    Layer.provide(HttpServer.layerServices),
    Layer.orDie,
  );

  // Keep the MCP server scope alive for the lifetime of the Durable Object instance.
  return Effect.acquireUseRelease(
    Scope.make(),
    (scope) => HttpRouter.toHttpEffect(mcpLayer).pipe(Scope.provide(scope)),
    (scope, exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void),
  );
};

export * as McpRelayServer from "./server.ts";
