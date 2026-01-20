import { defineConfig } from "@rsbuild/core";
import { pluginSvelte } from "@rsbuild/plugin-svelte";

export default defineConfig({
  plugins: [pluginSvelte()],
  source: {
    entry: {
      index: "./src/main.ts",
    },
  },
  html: {
    template: "./src/index.html",
  },
  output: {
    assetPrefix: "/",
  },
  server: {
    publicDir: {
      name: "public",
    },
  },
});
