{
  description = "Manotes CLI and development shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forEachSystem =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f {
            pkgs = import nixpkgs { inherit system; };
          }
        );
    in
    {
      packages = forEachSystem (
        { pkgs }:
        rec {
          manotes = pkgs.callPackage ./nix/package.nix { };
          default = manotes;
        }
      );

      apps = forEachSystem (
        { pkgs }:
        let
          package = self.packages.${pkgs.stdenv.hostPlatform.system}.manotes;
          app = {
            type = "app";
            program = pkgs.lib.getExe package;
            meta.description = package.meta.description;
          };
        in
        {
          manotes = app;
          default = app;
        }
      );

      devShells = forEachSystem (
        { pkgs }:
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_24
              pnpm
              bun
              jq
              # Use the installed zk fork rather than overriding it with nixpkgs' zk.
              (writeShellScriptBin "tasks" (builtins.readFile ./scripts/tasks))
            ];

            shellHook = ''
              # workerd (used by Alchemy local remote bindings) does not always
              # discover Nix's CA bundle on its own. Without this, local KV/email
              # calls to Cloudflare fail TLS verification with
              # "unable to get local issuer certificate".
              export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
              export NIX_SSL_CERT_FILE="$SSL_CERT_FILE"

              echo "manotes-rewrite dev shell"
              echo "- Node: $(node --version)"
              echo "- pnpm: $(pnpm --version)"
              echo "- Bun: $(bun --version)"
              echo "- Development: vp run dev"
              echo "- With extension: vp run dev:extension"
            '';
          };
        }
      );
    };
}
