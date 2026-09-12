#!/usr/bin/env node
import { tsImport } from "tsx/esm/api";

// Resolve from this installation, not the notes directory or its tsconfig.
await tsImport("../src/cli/cli.ts", { parentURL: import.meta.url, tsconfig: false });
