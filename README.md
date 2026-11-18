# Manotes

Manotes is a local-first note-taking app with E2EE sync. Read [the blog
post](https://klapacz.dev/blog/0004-building-manotes-a-local-first-note-taking-app-with-e2ee-sync/) to learn more.

## CLI with npm

Install Node 24, then install a CLI tarball with npm. Node and `zk` are not bundled;
the CLI does not need `zk`. npm downloads the sandbox and WebSocket dependencies.

```powershell
npm.cmd install -g ./manotes-cli.tgz
manotes.cmd --help
```

On macOS and Linux, use `npm` and `manotes` without the `.cmd` suffix. On Windows,
use PowerShell and run the app's generated init command with `manotes.cmd` if
execution policy blocks npm's PowerShell wrapper.

Build a tarball from a checkout with dependencies installed:

```sh
scripts/nix-develop -c node apps/cli/bin/pack.mjs
```

The output is `apps/cli/dist/manotes-cli.tgz`. The Windows workflow builds it and
checks installation, SQLite migrations, sandboxed scripts, Unicode, and paths
with spaces. Attach the validated tarball to a GitHub release and use that asset's
URL with `npm.cmd install -g <tarball-url>`. The existing `cli-v0.1.0` release is
for the previous CLI.

## CLI with Nix

Run the CLI with `nix run github:klapacz/manotes/dune -- --help`, or install it with
`nix profile add github:klapacz/manotes/dune#manotes`. The package includes its runtime
and works without a checkout or development shell on `aarch64-darwin`, `aarch64-linux`,
and `x86_64-linux`.

For Home Manager, add `github:klapacz/manotes/dune` as the `manotes` flake input and
include `inputs.manotes.packages.${pkgs.stdenv.hostPlatform.system}.manotes` in
`home.packages`. Update with `nix flake update manotes`, then rebuild your configuration.

To connect the CLI, sign in at [dune.manotes.dev](https://dune.manotes.dev), open and
unlock your cloud graph, then choose **Set up CLI** from the graph menu. Run the
generated init command in a new empty directory. Dune has separate accounts and
graphs from sand; keep their CLI directories separate too.

## Contributing

Feel free to open an issue if you would like to suggest or add something. PRs for larger changes without prior discussion in an issue will
be closed.

## License

Manotes is MIT licensed.
