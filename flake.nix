{
  description = "manotes-rewrite development shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
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
      devShells = forEachSystem (
        { pkgs }:
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_24
              pnpm
              bun
              process-compose
            ];

            shellHook = ''
              export PC_CONFIG_FILES=process-compose.yaml

              echo "manotes-rewrite dev shell"
              echo "- Node: $(node --version)"
              echo "- pnpm: $(pnpm --version)"
              echo "- Bun: $(bun --version)"
              echo "- process-compose: $(process-compose version)"
              echo "- process-compose config: $PC_CONFIG_FILES"
            '';
          };
        }
      );
    };
}
