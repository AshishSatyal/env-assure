import { defineConfig } from "tsup";

export default defineConfig([
  // Main library — CJS + ESM + type declarations
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    treeshake: true,
    target: "node16",
  },
  // CLI binary — CJS only, no type declarations
  {
    entry: { cli: "src/cli.ts" },
    format: ["cjs"],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    treeshake: true,
    target: "node16",
    banner: { js: "#!/usr/bin/env node" },
  },
]);
