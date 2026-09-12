---
name: nix-deps
description: Refresh the Nix CLI dependency hash. Must use after changing pnpm dependencies, the lockfile, workspace settings, patches, or pnpm itself.
---

# Nix dependency updates

1. Set `pnpmDeps.hash` in `nix/package.nix` to `""`.
2. Get `<ROOT>` from `jj git root` and `<REV>` from `jj log --no-graph -r @ -T commit_id`. Build that workspace revision:

   ```sh
   scripts/nix-develop -c nix build 'git+file://<ROOT>?rev=<REV>&allRefs=1#manotes.pnpmDeps' --no-link -L
   ```

3. Copy the expected hash mismatch's `got: sha256-...` into `pnpmDeps.hash`.
4. Run `scripts/nix-develop -c vp check --fix`. Get a fresh `<REV>`, then repeat the build with `#manotes` instead of `#manotes.pnpmDeps`. This includes smoke checks; follow `AGENTS.md`'s permission rule.
5. Keep the lockfile and hash in the same change. Report failures rather than claiming verification passed. Source-only edits need no hash refresh.

If upgrading pnpm itself, first match its override version to `package.json`'s `packageManager` and refresh its separate tarball hash:

```sh
scripts/nix-develop -c nix store prefetch-file --json 'https://registry.npmjs.org/pnpm/-/pnpm-<VERSION>.tgz'
```
