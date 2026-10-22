# Agent instructions

## App philosophy

- Notes capture thoughts, ideas, and experiences. Pages are simply notes with an H1 heading, representing entities: projects, libraries, articles in progress. Notes connect thoughts to those entities.
- Streams are the core: live, filtered views for searching, browsing, and exploring connections. Stream refs carry their filter and view settings.
- The niri-inspired scrolling workspace opens notes, pages, and streams side by side, preserving context as you follow connections.
- Keep capture effortless and organization optional. Prefer whole-note/page refs over block refs; minimize manual filing and linking.

## Development

- Be concise. Keep schemas beside encode/decode helpers, small file-local helpers below the main exported implementation, and `index.ts` files for re-exports only.
- For copied dependency/reference code, document the source path, dependency version, reason for copying, and modifications.
- Use Jujutsu. Pass `--git` to diff-style commands, including `jj diff` and `jj log -p`.
- Follow [jj-workspace](.agents/skills/jj-workspace/SKILL.md) for parallel work and T3 threads, including T3 setup-hook conversion. Never create a separate JJ repository.
- Change descriptions must follow Conventional Commits.
- Run development commands through `scripts/nix-develop -c <command>` from the workspace, not the main checkout. The wrapper uses the main checkout's Nix devshell.
- See [database maintenance](docs/database.md) for column codecs, query helpers, and migration/patch references.
- Generate SQLite migrations with `effectdb migrate generate --config apps/cli/effectdb.config.ts` or `apps/web/effectdb.config.ts` from the workspace root. Rebuild `@manotes/shared` and `@manotes/effect-db-sqlite` after schema/tool changes. Never edit applied SQL files.
- After dependency or pnpm changes, use [nix-deps](.agents/skills/nix-deps/SKILL.md).
- After making changes, run exactly `vp check --fix` with no additional arguments. When changing a Jujutsu stack, run it on every revision whose contents changed. Get explicit permission before running any other typechecking, linting, or testing command.

IMPORTANT: Explicit user requests take precedence over the rules above.
