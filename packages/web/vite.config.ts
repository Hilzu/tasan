import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, isSsrBuild }) => ({
  ssr: {
    external: command === "build" || undefined,
  },
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  build: {
    target:
      isSsrBuild ? "node22.14" : (
        ["chrome109", "edge131", "firefox128", "safari15"]
      ),
  },
}));
