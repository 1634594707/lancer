/** Fixed, data-only canvas scene; no provider-authored JavaScript is executed. */
export interface MotionKey {
  t: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}
export interface MotionShape {
  kind: "rect" | "circle" | "triangle" | "semicircle" | "text";
  color: string;
  width: number;
  height: number;
  text?: string;
  keys: MotionKey[];
}
export interface MotionScene {
  title: string;
  background: string;
  shapes: MotionShape[];
}
export interface AnimationInput {
  workspaceId: string;
  videoId: string;
  startMs?: number;
  idea?: string;
}
export interface AnimationSnapshot {
  videoId: string;
  status: "idle" | "running" | "ready" | "failed";
  stage: string;
  error: string | null;
  startMs: number;
  idea?: string;
  frames: { frameIndex: number; ptsMs: number; image: string }[];
  scene: MotionScene | null;
  summary: string | null;
  sourceCode: string | null;
  exportPath: string | null;
}

/** Shared by the live canvas preview and the deterministic 150-frame MP4 renderer. */
export interface MotionCanvas {
  fillStyle: unknown;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
  ): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  fillText(text: string, x: number, y: number, maxWidth: number): void;
  fill(): void;
}
export function drawMotion(ctx: MotionCanvas, scene: MotionScene, time: number) {
  ctx.clearRect(0, 0, 960, 540);
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, 960, 540);
  for (const shape of scene.shapes) {
    const after = shape.keys.findIndex((key) => key.t >= time);
    const b = shape.keys[after < 0 ? shape.keys.length - 1 : after]!;
    const a = shape.keys[Math.max(0, after < 0 ? shape.keys.length - 1 : after - 1)]!;
    const raw = a.t === b.t ? 1 : Math.max(0, Math.min(1, (time - a.t) / (b.t - a.t)));
    const u = raw * raw * (3 - 2 * raw);
    const mix = (key: "x" | "y" | "scale" | "rotation" | "opacity") =>
      a[key] + (b[key] - a[key]) * u;
    ctx.save();
    ctx.translate(mix("x"), mix("y"));
    ctx.rotate((mix("rotation") * Math.PI) / 180);
    ctx.scale(mix("scale"), mix("scale"));
    ctx.globalAlpha = mix("opacity");
    ctx.fillStyle = shape.color;
    const w = shape.width,
      h = shape.height;
    ctx.beginPath();
    if (shape.kind === "rect") ctx.rect(-w / 2, -h / 2, w, h);
    if (shape.kind === "circle") ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (shape.kind === "semicircle") {
      ctx.ellipse(0, 0, w / 2, h / 2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
    }
    if (shape.kind === "triangle") {
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
    }
    if (shape.kind === "text") {
      ctx.font = `900 ${h}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(shape.text ?? "", 0, 0, w);
    } else ctx.fill();
    ctx.restore();
  }
}
