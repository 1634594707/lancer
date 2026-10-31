import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import desktop from "../../playwright.config";

export default defineConfig({
  ...desktop,
  testDir: ".",
  testMatch: "record.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 900_000,
  outputDir: resolve(".artifacts/lancer-r8-media"),
});
