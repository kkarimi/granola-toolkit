import { defineConfig } from "vite-plus";

function assertSupportedVpCommand(): void {
  if (process.argv[2] === "build") {
    throw new Error(
      "This repo is a CLI package, not a web app. Use `vp pack` or `npm run build` instead of `vp build`.",
    );
  }
}

assertSupportedVpCommand();

export default defineConfig({
  pack: {
    clean: true,
    dts: false,
    entry: {
      cli: "index.ts",
    },
    format: ["esm"],
    outDir: "dist",
    outExtensions() {
      return {
        js: ".js",
      };
    },
    platform: "node",
    sourcemap: false,
    target: "node20",
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    ignorePatterns: ["dist/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
