export const names = {
  stage: "ALCHEMY_STAGE",
  webPort: "MANOTES_WEB_PORT",
  apiPort: "MANOTES_API_PORT",
  extensionPort: "MANOTES_EXTENSION_PORT",
  seedSecret: "MANOTES_DEV_SEED_SECRET",
  url: "PORTLESS_URL",
} as const;

export * as DevEnv from "./dev-env.ts";
