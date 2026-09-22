import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "index": "src/index.ts" },
  format: ["cjs", "esm"],
  dts: false, // types generated separately via tsc --declaration
  clean: true,
  splitting: false,
  sourcemap: true,
});
