import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;
const pathsProject = path.resolve(projectRoot, "tsconfig.paths.json");
const devPort = Number(process.env.PI_APP_DEV_PORT ?? "5173");
export default defineConfig(({ command }) => {
  const cleanOutputs = command === "build";

  return {
    main: {
      plugins: [tsconfigPaths({ projects: [pathsProject] })],
      build: {
        outDir: "out/main",
        externalizeDeps: { exclude: ["@earendil-works/chord", "@lancer/extension-ui"] },
        emptyOutDir: cleanOutputs,
        rollupOptions: {
          input: {
            main: path.resolve(projectRoot, "electron/main.ts"),
          },
        },
      },
    },
    preload: {
      plugins: [tsconfigPaths({ projects: [pathsProject] })],
      build: {
        outDir: "out/preload",
        emptyOutDir: cleanOutputs,
        rollupOptions: {
          input: {
            preload: path.resolve(projectRoot, "electron/preload.ts"),
            "pi-orb-preload": path.resolve(projectRoot, "electron/windows/pi-orb-preload.ts"),
          },
        },
      },
    },
    renderer: {
      root: projectRoot,
      base: "./",
      plugins: [
        react(),
        tsconfigPaths({ projects: [pathsProject] }),
        {
          name: "lancer-renderer-csp",
          apply: "build",
          transformIndexHtml() {
            return [
              {
                tag: "meta",
                injectTo: "head-prepend",
                attrs: {
                  "http-equiv": "Content-Security-Policy",
                  // Main's will-frame-navigate cancels non-extension destinations before
                  // any request. Let it preserve the existing frame rather than letting
                  // parent frame-src replace it with Chromium's blocked-document page.
                  content:
                    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src pi-extension: https: http:; object-src 'none'; base-uri 'none'; form-action 'none'",
                },
              },
            ];
          },
        },
      ],
      server: {
        port: devPort,
        strictPort: true,
      },
      build: {
        outDir: "out/renderer",
        emptyOutDir: true,
        rollupOptions: {
          input: {
            index: path.resolve(projectRoot, "index.html"),
            "pi-orb": path.resolve(projectRoot, "pi-orb.html"),
          },
        },
      },
    },
  };
});
