# Manotes

Manotes is a local-first note-taking app with E2EE sync. Read [the blog
post](https://klapacz.dev/blog/0004-building-manotes-a-local-first-note-taking-app-with-e2ee-sync/) to learn more.

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
