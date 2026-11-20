{ runCommand, fetchzip, gnutar, gzip }:
let
  # Virtua PR 1061 ports the Solid adapter; the published 0.55.0 adapter still targets Solid 1.
  revision = "21a041e81a462f49d83e72173c617f7d7065eee5";
  upstream = fetchzip {
    url = "https://codeload.github.com/inokawa/virtua/tar.gz/${revision}";
    extension = "tar.gz";
    hash = "sha256-s/M1An7TW/sMy2JGrjBE1ntZ7yk39cVbFisjsVUvHvM=";
  };
  manifest = builtins.toFile "package.json" (builtins.toJSON {
    name = "@manotes/virtua-solid2-source";
    version = "0.55.0-21a041e";
    type = "module";
    license = "MIT";
    sideEffects = false;
    exports."./solid" = "./src/solid/index.ts";
    peerDependencies = { solid-js = "2.0.3"; "@solidjs/web" = "2.0.3"; };
  });
in
runCommand "virtua-vendor-${revision}" { nativeBuildInputs = [ gnutar gzip ]; } ''
  mkdir -p package/src "$out"
  # Preserve upstream core/Solid sources and license; only package metadata changes.
  cp -R ${upstream}/src/{core,solid} package/src/
  cp ${upstream}/LICENSE package/
  cp ${manifest} package/package.json
  # Normalize archive metadata so the lockfile integrity is independent of build time/user.
  tar --exclude='*.spec.*' --exclude=__snapshots__ \
    --sort=name --mtime=@0 --owner=0 --group=0 --mode='u+rwX,go+rX' \
    -czf "$out/virtua-${revision}.tgz" package
''
