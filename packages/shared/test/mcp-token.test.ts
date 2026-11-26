import { Effect } from "effect";
import { expect, it } from "vite-plus/test";
import { McpToken } from "../src/mcp/token";

it("encodes and decodes v0 routing tokens as url-safe base64url", async () => {
  const token = {
    version: 0,
    accountId: "acc_01J9XYZ+foo/bar=",
    graphId: "graph_01J9ABC",
  } as const;

  const encoded = McpToken.encodeSync(token);
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(McpToken.decodeSync(encoded)).toEqual(token);
  expect(await Effect.runPromise(McpToken.decode(encoded))).toEqual(token);
});

it("rejects malformed or unsupported tokens", async () => {
  const wrongVersion = Buffer.from(
    JSON.stringify({ version: 1, accountId: "acc", graphId: "graph" }),
  ).toString("base64url");

  const emptyField = Buffer.from(
    JSON.stringify({ version: 0, accountId: "", graphId: "graph" }),
  ).toString("base64url");

  const notJson = Buffer.from("not-json").toString("base64url");

  for (const invalid of ["", "!!!", notJson, wrongVersion, emptyField]) {
    const exit = await Effect.runPromiseExit(McpToken.decode(invalid));
    expect(exit._tag).toBe("Failure");
  }
});
