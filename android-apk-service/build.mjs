import { build } from "esbuild";
// Vercel's function loader cannot synchronously require the ESM serde module
// used inside the SDK's CommonJS Drives dependency. Bundle these dependencies
// together so no cross-format package require remains at invocation time.
await build({
  entryPoints: ["src/session.mjs"],
  outfile: "dist/session.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  banner: {
    js: 'import { createRequire as createRuntimeRequire } from "node:module"; const require = createRuntimeRequire(import.meta.url);',
  },
  logLevel: "info",
});
