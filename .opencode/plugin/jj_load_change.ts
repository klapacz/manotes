import { type Plugin } from "@opencode-ai/plugin";
import { EXCLUDE_FILTER } from "../lib/jj-filters";

/**
 * Pattern: %<change-id>:<format>
 *
 * Named captures:
 * - id: the jujutsu change ID (e.g., "abc", "nszzwrpu")
 * - format: optional output format (diff, stat, log, show)
 *
 * Examples:
 *   %abc        -> diff (default)
 *   %abc:diff   -> full diff
 *   %abc:stat   -> file statistics only
 *   %abc:log    -> commit message/description
 *   %abc:show   -> description + diff combined
 */
const changePattern = /%(?<id>[a-zA-Z][a-zA-Z0-9]*)(:(?<format>diff|stat|log|show))?/g;

// Type-safe format options derived from the regex
type Format = "diff" | "stat" | "log" | "show";

const formatCommands: Record<Format, (id: string) => string[]> = {
  diff: (id) => ["jj", "diff", "-r", id, "--git", EXCLUDE_FILTER],
  stat: (id) => ["jj", "diff", "-r", id, "--stat", EXCLUDE_FILTER],
  log: (id) => ["jj", "log", "-r", id, "--no-graph", "-T", "description"],
  show: (id) => ["jj", "show", "-r", id, "--git", EXCLUDE_FILTER],
};

/**
 * Expands jujutsu change references in messages.
 *
 * Usage: Include %<change-id> or %<change-id>:<format> in your message.
 *
 * Examples:
 *   "review %abc - check for performance issues"
 *   "summarize %xyz:log for the changelog"
 *   "what files changed in %qrs:stat?"
 */
export const JjLoadChangePlugin: Plugin = async (ctx) => {
  return {
    "chat.message": async (_input, output) => {
      for (const part of output.parts) {
        if (part.type !== "text") continue;

        const matches = [...part.text.matchAll(changePattern)];
        if (matches.length === 0) continue;

        let expandedText = part.text;
        const contexts: string[] = [];

        for (const match of matches) {
          const fullMatch = match[0];
          // Named groups are typed by arkregex
          const { id, format } = match.groups!;
          const fmt: Format = (format as Format) ?? "diff";

          try {
            const args = formatCommands[fmt](id);
            const result = await ctx.$`${args}`.text().catch(() => null);

            if (result && result.trim()) {
              expandedText = expandedText.replace(
                fullMatch,
                `[change:${id}${format ? `:${format}` : ""}]`,
              );
              contexts.push(`<jujutsu-change id="${id}" format="${fmt}">
${result.trim()}
</jujutsu-change>`);
            } else {
              expandedText = expandedText.replace(fullMatch, `[empty ${fmt} for ${id}]`);
            }
          } catch {
            expandedText = expandedText.replace(fullMatch, `[error: ${id}]`);
          }
        }

        part.text = expandedText;
        if (contexts.length > 0) {
          part.text = `${expandedText}\n\n${contexts.join("\n\n")}`;
        }
      }
    },
  };
};
