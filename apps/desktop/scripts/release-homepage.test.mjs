import assert from "node:assert/strict";
import test from "node:test";
import { releaseHomepage } from "./release-homepage.mjs";

test("source builds use their destination repository without depending on Git history", () => {
  assert.equal(releaseHomepage({}), undefined);
  assert.throws(() => releaseHomepage({}, true), /LANCER_REPOSITORY_URL/);
  assert.equal(
    releaseHomepage(
      {
        GITHUB_ACTIONS: "true",
        GITHUB_REPOSITORY: "example/lancer",
      },
      true,
    ),
    "https://github.com/example/lancer",
  );
  assert.equal(
    releaseHomepage(
      {
        GITHUB_ACTIONS: "true",
        GITHUB_REPOSITORY: "example/lancer",
        LANCER_REPOSITORY_URL: "https://git.example.org/team/lancer/",
      },
      true,
    ),
    "https://git.example.org/team/lancer",
  );
  assert.equal(releaseHomepage({ GITHUB_REPOSITORY: "example/lancer" }), undefined);
});

test("packaging rejects upstream, credentials and shell syntax in repository URLs", () => {
  for (const value of [
    "https://github.com/minghinmatthewlam/pi-gui",
    "https://github.com/minghinmatthewlam/pi-gui.git/",
    "https://token@github.com/example/lancer",
    "https://github.com/example/lancer?token=private",
    "https://github.com/example/lancer&whoami",
    "https://github.com/example/lancer%20test",
    "https://github.com/example/lancer\nwhoami",
    "http://github.com/example/lancer",
  ])
    assert.throws(() => releaseHomepage({ LANCER_REPOSITORY_URL: value }, true));
});
