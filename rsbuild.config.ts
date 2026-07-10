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
  tools: {
    rspack: {
      experiments: {
        asyncWebAssembly: true,
      },
      module: {
        rules: [
          {
            test: /@ternlight[\\/]base[\\/]pkg-bundler[\\/].*\.js$/,
            type: "javascript/esm",
          },
        ],
      },
    },
  },
  server: {
    publicDir: {
      name: "public",
    },
  },
});
