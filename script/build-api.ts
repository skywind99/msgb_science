import { build } from "esbuild";

await build({
  entryPoints: ["api/index.ts"],
  platform: "node",
  bundle: true,
  format: "cjs",
  outfile: "api/handler.js",
  external: ["pg-native", "bufferutil", "utf-8-validate"],
  minify: false,
});

console.log("API bundle complete");
