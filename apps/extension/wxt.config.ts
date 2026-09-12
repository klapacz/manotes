import { DevEnv } from "@manotes/shared/dev-env";
import { PortSchema } from "@manotes/shared/schema/port";
import { defineConfig } from "wxt";

const extensionPort = PortSchema.decode(process.env[DevEnv.names.extensionPort]);

export default defineConfig({
  manifest: {
    name: "Manotes",
    permissions: ["tabs"],
  },
  dev: {
    server: {
      host: "127.0.0.1",
      origin: "127.0.0.1",
      port: extensionPort,
      strictPort: extensionPort !== undefined,
    },
  },
});
