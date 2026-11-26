import { McpToken } from "@manotes/shared/mcp/token";
import { Base64 } from "effect/encoding";
import { createMemo, Show } from "solid-js";
import { GraphRuntimeContext } from "../../lib/graph-access/graph-runtime/context";
import { Button } from "../ui/button";
import { DescriptionList } from "../ui/description-list";
import { toast } from "../ui/sonner";
import { Surface } from "../ui/surface";
import { Focus } from "./focus";

export type Snapshot = {
  readonly client_key: Uint8Array | undefined;
};

export function Root(props: { attrs: Snapshot }) {
  const focus = Focus.useNode();
  const graph = GraphRuntimeContext.use();

  const encodedKey = createMemo(() => {
    const key = props.attrs.client_key;

    return key ? Base64.encode(key) : undefined;
  });

  const mcpUrl = createMemo(() => {
    const record = graph().record;

    if (record.mode !== "cloud") return undefined;

    const token = McpToken.encodeSync({
      version: 0,
      accountId: record.accountId,
      graphId: record.graphId,
    });

    return `${window.location.origin}/mcp/${token}`;
  });

  return (
    <div class="px-4 pb-4">
      <Surface.Root highlighted={focus.highlightWithin()}>
        <Surface.Header>AGENT</Surface.Header>
        <DescriptionList.Root>
          <DescriptionList.Row>
            <DescriptionList.Term>Key</DescriptionList.Term>
            <DescriptionList.Details>
              <Show
                when={encodedKey()}
                fallback={<span class="block py-1 text-fg-subtle">Missing key</span>}
              >
                {(key) => (
                  <div class="flex items-center gap-2">
                    <span class="truncate font-mono text-xs text-fg-subtle">{maskKey(key())}</span>
                    <Button variant="ghost" size="xs" onClick={() => copyText(key(), "Key copied")}>
                      Copy
                    </Button>
                  </div>
                )}
              </Show>
            </DescriptionList.Details>
          </DescriptionList.Row>
          <DescriptionList.Row>
            <DescriptionList.Term>MCP URL</DescriptionList.Term>
            <DescriptionList.Details>
              <Show
                when={mcpUrl()}
                fallback={<span class="block py-1 text-fg-subtle">Sync graph to enable MCP</span>}
              >
                {(url) => (
                  <div class="flex items-center gap-2">
                    <span class="truncate font-mono text-xs text-fg-subtle">{url()}</span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => copyText(url(), "MCP URL copied")}
                    >
                      Copy
                    </Button>
                  </div>
                )}
              </Show>
            </DescriptionList.Details>
          </DescriptionList.Row>
        </DescriptionList.Root>
      </Surface.Root>
    </div>
  );
}

function maskKey(key: string): string {
  if (key.length <= 12) return key;

  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function copyText(value: string, success: string): void {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(success),
    () => toast.error("Unable to copy to clipboard"),
  );
}

export * as ClientDef from "./client-def";
