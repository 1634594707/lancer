import path from "node:path";
import { fileURLToPath } from "node:url";

// Source archives have no Git remote. CI uses its own repository, while local
// packagers supply the destination explicitly instead of inheriting upstream.
export function releaseHomepage(env = process.env, required = false) {
  const value =
    env.LANCER_REPOSITORY_URL ||
    (env.GITHUB_ACTIONS === "true" && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY}`
      : undefined);
  if (!value) {
    if (required)
      throw new Error(
        "Set LANCER_REPOSITORY_URL to your repository's HTTPS URL before building Linux packages.",
      );
    return undefined;
  }
  // Restrict the value to a repository URL, including when pnpm.cmd runs through
  // a Windows shell. Never put credentials, query parameters or shell syntax here.
  if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/.test(value))
    throw new Error(
      "LANCER_REPOSITORY_URL must be an HTTPS owner/repository URL without credentials or query parameters.",
    );
  const url = value.replace(/\/$/, "");
  if (/^https:\/\/github\.com\/minghinmatthewlam\/pi-gui(?:\.git)?$/i.test(url))
    throw new Error("Use the Lancer repository, not the upstream pi-gui repository.");
  return url;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(releaseHomepage(process.env, true));
}
