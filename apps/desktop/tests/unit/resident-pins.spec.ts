import { expect, test } from "@playwright/test";
import {
  residentBotForSession,
  residentPins,
  type ResidentSession,
} from "../../src/features/conversation/lancer-process/resident-pins";
import type { ProcessSidebarGroup } from "../../src/features/conversation/lancer-process/process-types";

function session(id: string, actor: string): ResidentSession {
  return {
    id,
    actor,
    title: id,
    branch: "main",
    status: "done",
  };
}

function group(name: string, sessions: readonly ResidentSession[]): ProcessSidebarGroup {
  return { name, count: `${sessions.length}`, sessions };
}

test("resident slots stay a0 a1 a2 when every module actor is the same", () => {
  const pins = residentPins([
    group("视频学习", [session("video", "sol"), session("video-2", "sol")]),
    group("外网调研", [session("research", "sol")]),
    group("Lancer", [session("lancer", "sol")]),
    group("小红书", [session("xhs", "sol")]),
  ]);
  expect(pins.map((pin) => pin.bot)).toEqual([0, 1, 2]);
  expect(pins.map((pin) => pin.session?.id)).toEqual(["video", "research", "lancer"]);
  expect(new Set(pins.map((pin) => pin.bot)).size).toBe(3);
});

test("later sessions fill empty portrait slots inside one module", () => {
  const pins = residentPins([
    group("Lancer", [
      session("first", "sol"),
      session("second", "sol"),
      session("third", "sol"),
      session("fourth", "sol"),
    ]),
  ]);
  expect(pins.map((pin) => [pin.bot, pin.session?.id])).toEqual([
    [0, "first"],
    [1, "second"],
    [2, "third"],
  ]);
});

test("session rows use their module pin, and a pin session keeps its own portrait", () => {
  const sidebar = [
    group("视频学习", [session("video", "sol"), session("video-2", "sol")]),
    group("外网调研", [session("research", "sol")]),
    group("Lancer", [session("lancer", "sol"), session("lancer-2", "opus")]),
    group("小红书", [session("xhs", "sol")]),
  ];
  expect(residentBotForSession(sidebar, "video")).toBe(0);
  expect(residentBotForSession(sidebar, "video-2")).toBe(0);
  expect(residentBotForSession(sidebar, "research")).toBe(1);
  expect(residentBotForSession(sidebar, "lancer")).toBe(2);
  expect(residentBotForSession(sidebar, "lancer-2")).toBe(2);
  expect(residentBotForSession(sidebar, "xhs")).toBe(0);
});

test("a session that fills a later pin keeps that pin inside one module", () => {
  const sidebar = [
    group("Lancer", [
      session("first", "sol"),
      session("second", "sol"),
      session("third", "sol"),
      session("fourth", "sol"),
    ]),
  ];
  expect(residentBotForSession(sidebar, "first")).toBe(0);
  expect(residentBotForSession(sidebar, "second")).toBe(1);
  expect(residentBotForSession(sidebar, "third")).toBe(2);
  expect(residentBotForSession(sidebar, "fourth")).toBe(0);
});

test("missing sessions leave the remaining portrait slots empty", () => {
  const pins = residentPins([group("Lancer", [session("only", "opus")])]);
  expect(pins).toEqual([
    { bot: 0, session: session("only", "opus") },
    { bot: 1, session: null },
    { bot: 2, session: null },
  ]);
});
