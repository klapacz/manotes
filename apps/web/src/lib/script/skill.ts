import { Effect, Schema, Stream } from "effect";
import { Zip } from "effect/encoding";
import mcpScript from "./skill/manotes-mcp.mjs?raw";
import skillMd from "./skill/SKILL.md?raw";

const pluginMeta = {
  name: "manotes",
  version: "0.0.0",
  description: "Query, create, and edit Manotes records end-to-end encrypted.",
  skills: "./skills/",
  mcpServers: "./.mcp.json",
};

export const buildSkillZip = Effect.fn("ScriptSkill.buildSkillZip")(function* (encodedKey: string) {
  return yield* zipFiles([
    Zip.file("manotes/SKILL.md", skillMd),
    Zip.file("manotes/scripts/manotes-mcp.mjs", mcpScript),
    Zip.file("manotes/pairing.json", formatJson({ key: encodedKey })),
  ]);
});

export const buildPluginZip = Effect.fn("ScriptSkill.buildPluginZip")(function* ({
  encodedKey,
  mcpUrl,
}: {
  readonly encodedKey: string;
  readonly mcpUrl: string;
}) {
  const mcpJson = formatJson({
    mcpServers: {
      manotes: { type: "http", url: mcpUrl },
    },
  });

  const portableMcpJson = formatJson({
    mcpServers: {
      manotes: { type: "streamable-http", url: mcpUrl },
    },
  });

  const geminiExtensionJson = formatJson({
    name: pluginMeta.name,
    version: pluginMeta.version,
    description: pluginMeta.description,
    mcpServers: {
      manotes: { httpUrl: mcpUrl },
    },
  });

  const manifestJson = formatJson(pluginMeta);

  const codexManifestJson = formatJson({
    ...pluginMeta,
    interface: {
      displayName: "Manotes",
      shortDescription: "Manage your Manotes records",
      longDescription: pluginMeta.description,
      developerName: "Korneliusz Łapacz",
      category: "Productivity",
      capabilities: ["Read", "Write"],
    },
  });

  const portableManifestJson = formatJson({ ...pluginMeta, mcpServers: "./mcp.json" });

  return yield* zipFiles([
    Zip.file("manotes-plugin/plugin.json", portableManifestJson),
    Zip.file("manotes-plugin/mcp.json", portableMcpJson),
    Zip.file("manotes-plugin/.claude-plugin/plugin.json", manifestJson),
    Zip.file("manotes-plugin/.codex-plugin/plugin.json", codexManifestJson),
    Zip.file("manotes-plugin/.mcp.json", mcpJson),
    Zip.file("manotes-plugin/gemini-extension.json", geminiExtensionJson),
    Zip.file("manotes-plugin/skills/manotes/SKILL.md", skillMd),
    Zip.file("manotes-plugin/skills/manotes/scripts/manotes-mcp.mjs", mcpScript),
    Zip.file("manotes-plugin/skills/manotes/pairing.json", formatJson({ key: encodedKey })),
  ]);
});

export const downloadSkillZip = Effect.fn("ScriptSkill.downloadSkillZip")(function* (
  encodedKey: string,
) {
  triggerDownload(yield* buildSkillZip(encodedKey), "manotes-skill.zip");
});

export const downloadPluginZip = Effect.fn("ScriptSkill.downloadPluginZip")(function* (opts: {
  readonly encodedKey: string;
  readonly mcpUrl: string;
}) {
  triggerDownload(yield* buildPluginZip(opts), "manotes-plugin.zip");
});

const zipFiles = Effect.fn("ScriptSkill.zipFiles")(function* (
  entries: ReadonlyArray<ReturnType<typeof Zip.file>>,
) {
  const chunks = yield* Stream.fromIterable(entries).pipe(
    Stream.pipeThroughChannel(Zip.encode()),
    Stream.runCollect,
  );

  return new Blob(
    chunks.map((chunk) => new Uint8Array(chunk)),
    { type: "application/zip" },
  );
});

function formatJson(value: Schema.Json): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export * as ScriptSkill from "./skill";
