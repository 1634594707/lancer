import { createLightLayer } from "../dist/index.js";
const output = document.querySelector("#result");
let checks = 0;
const assert = (value, message) => {
  if (!value) throw new Error(message);
  checks++;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await wait(20);
  }
  throw new Error("Observable state did not arrive");
};
const source = document.createElement("div"),
  target = document.createElement("div");
source.style.cssText = "position:fixed;left:40px;top:300px;width:20px;height:20px";
target.style.cssText = "position:fixed;left:640px;top:400px;width:20px;height:20px";
document.body.append(source, target);
const layer = createLightLayer();
try {
  const first = layer.emit({
    id: "first",
    source,
    target,
    color: "#2789c3",
    duration: 1000,
    seed: 0.2,
  });
  await until(() => document.querySelector('[data-flight-head="first"]'));
  assert(
    document.querySelector('[data-curve-id="first"]').getAttribute("d").startsWith("M 50 310"),
    "Source uses actual element center",
  );
  target.style.left = "700px";
  await until(() =>
    document.querySelector('[data-curve-id="first"]').getAttribute("d").endsWith("710 410"),
  );
  assert(true, "Target follows real layout changes");
  layer.pause();
  const paused = document.querySelector("[data-light-layer]").innerHTML;
  await wait(90);
  assert(document.querySelector("[data-light-layer]").innerHTML === paused, "Pause freezes paint");
  layer.resume();
  assert((await first.finished) === "arrived", "Resume completes at real target");
  await until(() => layer.activeCount === 0);
  assert(!document.querySelector("[data-flight-head]"), "Finished trails removed");
  let mutations = 0;
  const observer = new MutationObserver(() => mutations++);
  observer.observe(document.querySelector("[data-light-layer]"), {
    subtree: true,
    attributes: true,
    childList: true,
  });
  await wait(90);
  observer.disconnect();
  assert(mutations === 0, "No idle animation paints");
  const cancelled = layer.emit({ id: "cancel", source, target, color: "#2789c3" });
  cancelled.cancel();
  assert((await cancelled.finished) === "cancelled", "Cancellation settles the handle");
  const missing = layer.emit({ id: "missing", source, target: () => null, color: "#2789c3" });
  assert(
    (await missing.finished) === "missing-anchor",
    "Missing target never guesses a nearby node",
  );
  const secondLayer = createLightLayer();
  const one = layer.emit({ id: "one", source, target, color: "#2789c3", duration: 10000 }),
    two = secondLayer.emit({ id: "two", source, target, color: "#8660cf", duration: 10000 });
  await until(() => document.querySelectorAll("linearGradient").length === 2);
  assert(
    new Set([...document.querySelectorAll("linearGradient")].map((n) => n.id)).size === 2,
    "Independent layers have unique gradients",
  );
  let duplicate = false;
  try {
    layer.emit({ id: "one", source, target, color: "#2789c3" });
  } catch {
    duplicate = true;
  }
  assert(duplicate, "Duplicate event IDs rejected");
  layer.destroy();
  secondLayer.destroy();
  assert(
    (await one.finished) === "cancelled" && (await two.finished) === "cancelled",
    "Destroy settles pending flights",
  );
  assert(!document.querySelector("[data-light-layer]"), "Destroy removes overlays");
  output.dataset.status = "passed";
  output.textContent = `${checks} checks passed`;
} catch (error) {
  layer.destroy();
  output.dataset.status = "failed";
  output.textContent = String(error?.stack ?? error);
}
