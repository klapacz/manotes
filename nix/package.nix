{
  lib,
  stdenv,
  nodejs_24,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
  python3,
  makeWrapper,
  cctools,
}:
let
  nodejs = nodejs_24;
  # Keep the dependency store format stable even when a consumer follows another nixpkgs.
  pnpm = pnpm_10.override {
    inherit nodejs;
    version = "10.33.0";
    hash = "sha256-v8wby60nmxOlFsRGp1s8WLaQS0XVehlRQRAV5Qt1GoA=";
  };
in
stdenv.mkDerivation (finalAttrs: {
  pname = "manotes";
  version = (lib.importJSON ../apps/web/package.json).version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../LICENSE
      ../package.json
      ../pnpm-lock.yaml
      ../pnpm-workspace.yaml
      ../patches
      ../tsconfig.base.json
      ../apps/web/package.json
      ../apps/web/bin
      ../apps/web/src
      ../apps/web/drizzle
      ../packages/shared/package.json
      ../packages/shared/tsconfig.json
      ../packages/shared/vite.config.ts
      ../packages/shared/src
      ../packages/sql-sqlite-wasm/package.json
      ../packages/sql-sqlite-wasm/tsconfig.json
      ../packages/sql-sqlite-wasm/vite.config.ts
      ../packages/sql-sqlite-wasm/src
    ];
  };

  pnpmWorkspaces = [ "@manotes/web..." ];
  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src pnpmWorkspaces;
    inherit pnpm;
    fetcherVersion = 3;
    hash = "sha256-hPkdM9or9CYdEobXY/B+Z8yGA7vhL6U9qsT7I+WxoOU=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
    python3
    makeWrapper
  ] ++ lib.optionals stdenv.hostPlatform.isDarwin [ cctools ];

  # Compile better-sqlite3 against the packaged Node, without downloading headers or prebuilds.
  npm_config_nodedir = nodejs;
  npm_config_build_from_source = "true";

  buildPhase = ''
    runHook preBuild
    pnpm --filter @manotes/shared build
    pnpm --filter @manotes/sql-sqlite-wasm build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    # Preserve source-relative migration paths and tsx's runtime script loading.
    # Enable lockfile-based deployment for this command without changing workspace linking in development.
    pnpm --filter @manotes/web --offline --config.inject-workspace-packages=true \
      deploy --prod --ignore-scripts "$out/lib/manotes"
    # Rebuild the deployed addon directly; pnpm rebuild can skip scripts in a deployed tree.
    for sqlite in "$out"/lib/manotes/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3; do
      npm --offline --prefix "$sqlite" run install
    done
    makeWrapper ${lib.getExe nodejs} "$out/bin/manotes" \
      --add-flags "$out/lib/manotes/bin/manotes.mjs"
    install -Dm644 LICENSE "$out/share/licenses/manotes/LICENSE"

    runHook postInstall
  '';

  # Avoid invoking strip on every file in the vendored JavaScript dependency tree.
  dontStrip = true;

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    ${lib.getExe nodejs} ${./smoke.mjs} "$out/bin/manotes"
    runHook postInstallCheck
  '';

  meta = {
    description = "Local-first notes CLI with end-to-end encrypted sync";
    homepage = "https://github.com/klapacz/manotes";
    license = lib.licenses.mit;
    mainProgram = "manotes";
    platforms = [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ];
  };
})
