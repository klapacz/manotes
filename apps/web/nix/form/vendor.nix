{
  lib,
  stdenv,
  runCommand,
  fetchzip,
  nodejs_24,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
}:
let
  revision = "22d7156b5cf2158c1afa281d52d992fdc66dc8e8";
  nodejs = nodejs_24;
  pnpm = pnpm_10.override {
    inherit nodejs;
    version = "10.33.0";
    hash = "sha256-v8wby60nmxOlFsRGp1s8WLaQS0XVehlRQRAV5Qt1GoA=";
  };
  upstream = fetchzip {
    extension = "tar.gz";
    url = "https://codeload.github.com/ryansolid/form/tar.gz/${revision}";
    hash = "sha256-MRivRusj0uKiblnp3nvNZnyPY2aPuH/ZdLwStuHTUj8=";
  };
  source = runCommand "solid-form-vendor-source" { nativeBuildInputs = [ nodejs ]; } ''
    mkdir -p "$out/packages"
    cp ${upstream}/{LICENSE,tsconfig.json} "$out/"
    for package in form-core solid-form; do
      mkdir -p "$out/packages/$package"
      cp -R ${upstream}/packages/$package/{src,package.json,tsconfig.json} "$out/packages/$package/"
    done
    cp ${upstream}/packages/solid-form/README.md "$out/packages/solid-form/"
    chmod -R u+w "$out"
    cd "$out"
    node ${./prepare-upstream.mjs}
    cp ${./pnpm-lock.yaml} pnpm-lock.yaml
  '';
in
stdenv.mkDerivation (finalAttrs: {
  pname = "solid-form-vendor";
  version = revision;
  src = source;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 3;
    hash = "sha256-VJ0bx5fgclv8dHw8N+NUTYRkFXeS8MbpDJF/XUaJVSc=";
  };

  nativeBuildInputs = [ nodejs pnpm pnpmConfigHook ];

  buildPhase = ''
    runHook preBuild
    for package in form-core solid-form; do
      pnpm --dir packages/$package exec tsdown --config build.config.mjs
    done
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    for package in form-core solid-form; do
      pnpm --dir packages/$package pack --out "$out/$package-${revision}.tgz"
    done
    runHook postInstall
  '';

  # npm archives must keep their normalized bytes, including executable modes.
  dontFixup = true;
  doInstallCheck = true;
  installCheckPhase = ''
    cd "$out"
    sha256sum --check <<'HASHES'
    50ac8a73a455c34fd125daa07f04d8497be319ef08c966ec85638b0af39e1ad7  form-core-${revision}.tgz
    46b3bc617d7136ffb8453216cb4b464044027b1c28284167d00febc27d166dca  solid-form-${revision}.tgz
    HASHES
  '';

  meta = {
    description = "Pinned TanStack Form Solid 2 packages";
    license = lib.licenses.mit;
    platforms = lib.platforms.unix;
  };
})
