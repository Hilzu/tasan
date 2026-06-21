import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command, isSsrBuild }) => ({
  ssr: {
    external: command === "build" || undefined,
  },
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    target:
      isSsrBuild ? "node24.16" : (
        ["chrome109", "edge131", "firefox128", "safari15"]
      ),
  },
}));
