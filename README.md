# Manotes

Manotes is a local-first note-taking app with E2EE sync. Read [the blog
post](https://klapacz.dev/blog/0004-building-manotes-a-local-first-note-taking-app-with-e2ee-sync/) to learn more.

## CLI with npm

Install a CLI tarball with Node 24 and npm. No npm registry publication is needed;
the package's runtime dependencies are still downloaded from npm.

```sh
npm install -g ./manotes-cli.tgz
manotes --help
```

To create the tarball from a checkout with dependencies installed, run from the
workspace:

```sh
scripts/nix-develop -c node apps/web/bin/pack.mjs
```

The output is `apps/web/dist/manotes-cli.tgz`. Attach it to a GitHub release to
enable installation by URL:

```sh
npm install -g https://github.com/klapacz/manotes/releases/latest/download/manotes-cli.tgz
```

On Windows, use PowerShell and `manotes.cmd` if script execution policy blocks
the npm PowerShell wrapper. The release URL works once a tarball has been uploaded.

## CLI with Nix

Run the CLI with `nix run github:klapacz/manotes/sand -- --help`, or install it with
`nix profile add github:klapacz/manotes/sand#manotes`. The package includes its runtime
and works without a checkout or development shell on `aarch64-darwin`, `aarch64-linux`,
and `x86_64-linux`.

For Home Manager, add `github:klapacz/manotes/sand` as the `manotes` flake input and
include `inputs.manotes.packages.${pkgs.stdenv.hostPlatform.system}.manotes` in
`home.packages`. Update with `nix flake update manotes`, then rebuild your configuration.

## Contributing

Feel free to open an issue if you would like to suggest or add something. PRs for larger changes without prior discussion in an issue will
be closed.

## License

Manotes is MIT licensed.
