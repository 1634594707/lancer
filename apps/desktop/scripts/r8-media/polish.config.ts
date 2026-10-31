import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import desktop from "./playwright.config";
export default defineConfig({
  ...desktop,
  testMatch: "polish.spec.ts",
  outputDir: resolve(".artifacts/lancer-polish"),
});
