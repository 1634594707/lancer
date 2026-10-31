import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Owned package declarations must come from their implementation, never a local
// ambient substitute (which can silently shadow exports even with skipLibCheck).
export function checkContractDeclarations(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const failures = [];
  function visit(node) {
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      const name = node.name.text;
      // Also reject wildcard declarations that can supply an owned package.
      const pattern = new RegExp(
        `^${name
          .split("*")
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*")}$`,
      );
      const ownedExamples = [
        "@lancer/session-driver",
        "@lancer/session-driver/runtime-types",
        "@lancer/catalogs",
        "@lancer/pi-sdk-driver",
      ];
      if (
        name.startsWith("@lancer/") ||
        (name.includes("*") && ownedExamples.some((owned) => pattern.test(owned)))
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        failures.push(
          `${file}:${line + 1}: Do not redeclare owned package ${name}; import its canonical workspace exports.`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return failures;
}

export function checkContractAuthority(root) {
  // Archives have no .git. Inspect their source directly, even when the archive
  // is extracted inside another checkout; never use the parent repository's index.
  const files = existsSync(path.join(root, ".git"))
    ? execFileSync(
        "git",
        [
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "-z",
          "--",
          "apps",
          "packages",
          "scripts",
          "video",
        ],
        { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      ).split("\0")
    : ts.sys
        .readDirectory(
          root,
          [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"],
          [
            "**/node_modules/**",
            "**/dist/**",
            "**/out/**",
            "**/release*/**",
            "**/.next/**",
            "**/.cache/**",
            "**/test-results/**",
            "**/playwright-report/**",
          ],
          ["apps/**/*", "packages/**/*", "scripts/**/*", "video/**/*"],
        )
        .map((file) => path.relative(root, file));
  const failures = [];
  for (const file of new Set(files.filter((file) => /\.[cm]?[jt]sx?$/.test(file)))) {
    let text;
    try {
      text = readFileSync(path.join(root, file), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue; // Tracked deletion in the working tree.
      throw error;
    }
    failures.push(...checkContractDeclarations(file, text));
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = checkContractAuthority(fileURLToPath(new URL("../", import.meta.url)));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Owned workspace contracts have no ambient redeclarations.");
  }
}
