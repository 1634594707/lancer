export const SITE_NAME = "Lancer";
const repository = process.env.NEXT_PUBLIC_LANCER_GITHUB_URL?.replace(/\/$/, "") ?? "";
export const GITHUB_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository)
  ? repository
  : "";
const origin = process.env.NEXT_PUBLIC_LANCER_SITE_URL ?? "";
export const SITE_URL = /^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(origin)
  ? origin
  : "http://localhost:3000";
export const SITE_PUBLISHED = SITE_URL.startsWith("https:") && Boolean(GITHUB_URL);
export const RELEASES_AVAILABLE =
  Boolean(GITHUB_URL) && process.env.NEXT_PUBLIC_LANCER_RELEASES_AVAILABLE === "true";
export const RELEASES_URL = RELEASES_AVAILABLE ? `${GITHUB_URL}/releases` : "#install";
export const PI_URL = "https://github.com/earendil-works/pi";
export const UPSTREAM_URL = "https://github.com/minghinmatthewlam/pi-gui";
export const OG_IMAGE_PATH = "/og.png";
export const OG_IMAGE_ALT = "Lancer: conversations, parallel tasks and traceable delivery";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const SITE_TITLE = "Lancer: a workspace for parallel AI tasks";
export const SITE_DESCRIPTION =
  "Lancer connects AI conversations, parallel branches and deliverables in one desktop workspace. Built on pi-gui and pi. Alpha release in preparation; macOS is the primary verified platform.";
export const SITE_SOCIAL_DESCRIPTION =
  "Conversations, parallel branches and traceable delivery. Lancer desktop Alpha.";
