import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC is required so NestJS decorator metadata works under vitest (esbuild can't emit it).
export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    environment: "node",
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2022",
      },
    }),
  ],
});
