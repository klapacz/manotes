# Agent instructions

- Be concise. Keep schemas beside encode/decode helpers, small file-local helpers below the main exported implementation, and `index.ts` files for re-exports only.
- For copied dependency/reference code, document the source path, dependency version, reason for copying, and modifications.
- Use Jujutsu. Pass `--git` to diff-style commands, including `jj diff` and `jj log -p`.
- Run development commands through `scripts/nix-develop -c <command>` from the workspace, not the main checkout. The wrapper uses the main checkout's Nix devshell.
- Generate Drizzle migrations with `drizzle-kit generate`; never handwrite migration SQL.
- After making changes, run exactly `vp check --fix` with no additional arguments. When changing a Jujutsu stack, run it on every revision whose contents changed. Get explicit permission before running any other typechecking, linting, or testing command.

IMPORTANT: Explicit user requests take precedence over the rules above.
