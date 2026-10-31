// Runtime state is never source, even if it was accidentally tracked by Git.
// Keep this shared by both exports and the archive verifier.
export function isPrivateRuntimePath(file) {
  if (file === ".env.example") return false;
  const parts = file.replaceAll("\\", "/").split("/");
  if (
    parts.some((part) =>
      /^(?:\.git|\.pi|\.codex|\.claude|\.lancer|\.lancer-task|\.artifacts|node_modules|\.next|\.cache|\.DS_Store|Local Storage|Session Storage|IndexedDB|Cookies|Network)$/i.test(
        part,
      ),
    )
  )
    return true;
  const name = parts.at(-1);
  return (
    (parts.length > 1 && name === ".npmrc") ||
    /^(?:auth|models|models-store|settings|ui-state|catalogs|assistants|doubao-app|pi-orb-positions|scheduled-tasks|video-learn-tools|local-signing|credentials|cookies)(?:[.-][^.]+)*\.(?:json|jsonl|toml|ya?ml|txt|bak)$/i.test(
      name,
    ) ||
    /^\.env(?:\..*)?$|\.(?:p12|pfx|key|pem|sqlite(?:3)?|db|log|jsonl)(?:-[a-z]+)?$/i.test(name) ||
    /^(?:id_rsa|id_ed25519|\.netrc|\.git-credentials|\.npmrc\.local)$/i.test(name)
  );
}

export function publicSourceBytes(file, data) {
  // The only public package-manager setting required by this workspace.
  // Never copy a maintainer's registry, username or authentication lines.
  return file === ".npmrc" ? Buffer.from("node-linker=hoisted\n") : data;
}
