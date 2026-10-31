import semver from "semver";

// Only exact, checked-in version overrides may replace a dependency requirement.
// Unsupported selectors keep the original range, so packaging fails closed.
export function approvedDependencyRange(parent, dependency, required, overrides) {
  for (const [selector, replacement] of Object.entries(overrides)) {
    if (!semver.valid(replacement)) continue;
    const parts = selector.split(/>(?=[@a-z])/);
    if (parts.length > 2) continue;
    if (parts.length === 2 && !matches(parts[0], parent.name, parent.version)) continue;
    if (matches(parts.at(-1), dependency, required)) return replacement;
  }
  return required;
}

function matches(selector, name, range) {
  if (selector === name) return true;
  if (!selector.startsWith(`${name}@`)) return false;
  const selectedRange = selector.slice(name.length + 1);
  return Boolean(
    semver.validRange(range) &&
    semver.validRange(selectedRange) &&
    semver.subset(range, selectedRange),
  );
}
