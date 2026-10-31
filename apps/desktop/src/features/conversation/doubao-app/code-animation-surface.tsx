import { useEffect, useRef, useState } from "react";
import { drawMotion } from "../../../../contracts/code-animation";
import type { DoubaoAppController } from "./use-doubao-app";

export function CodeAnimationSurface({ bridge }: { readonly bridge: DoubaoAppController }) {
  const animation = bridge.animation;
  const [idea, setIdea] = useState(animation?.idea ?? "");
  useEffect(() => {
    setIdea(animation?.idea ?? "");
  }, [animation?.videoId, animation?.idea]);
  const [start, setStart] = useState(120);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (animation?.scene && canvas.current) {
      const ctx = canvas.current.getContext("2d");
      if (ctx) drawMotion(ctx, animation.scene, time);
    }
  }, [animation?.scene, time]);
  useEffect(() => {
    if (!playing) return;
    const origin = performance.now() - time * 1000;
    let id = 0;
    const tick = (now: number) => {
      const next = Math.min(5, (now - origin) / 1000);
      setTime(next);
      if (next < 5) id = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
    // Playback uses one fixed origin, not a new clock on every frame.
  }, [playing]);
  if (!animation) return null;
  const busy = bridge.animationPending || animation.status === "running";
  return (
    <section className="code-animation" aria-label="代码动画工作区">
      <header>
        <strong>参考快照</strong>
        <span>点击快照选择起点 · 复刻 5 秒</span>
      </header>
      <div className="animation-filmstrip" aria-label="视频快照横排" tabIndex={0}>
        {animation.frames.map((frame) => (
          <button
            key={frame.frameIndex}
            type="button"
            aria-pressed={start === frame.ptsMs / 1000}
            onClick={() => setStart(frame.ptsMs / 1000)}
            disabled={busy}
          >
            <img
              src={frame.image}
              alt={`原视频 ${(frame.ptsMs / 1000).toFixed(1)} 秒快照`}
              width={160}
              height={90}
              loading="lazy"
            />
            <span>{(frame.ptsMs / 1000).toFixed(1)} s</span>
          </button>
        ))}
      </div>
      <label className="animation-idea">
        新想法
        <textarea
          aria-label="新想法"
          placeholder="保留这个画风，你想做什么？例如：几何图形拼成一朵花，最后出现「向阳生长」。"
          value={idea}
          maxLength={2000}
          disabled={busy}
          onChange={(event) => setIdea(event.target.value)}
        />
      </label>
      <div className="doubao-app-actions">
        <label>
          起点（秒）
          <input
            aria-label="片段起点秒"
            type="number"
            min={0}
            step={1}
            value={start}
            onChange={(event) => setStart(Number(event.target.value))}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          disabled={busy || !Number.isFinite(start)}
          onClick={() => {
            setPlaying(false);
            setTime(0);
            void bridge.runAnimation("create", start * 1000, idea).catch(() => undefined);
          }}
        >
          {busy ? "处理中…" : idea.trim() ? "生成 5 秒动画" : "Terra 复刻 5 秒"}
        </button>
      </div>
      <p role="status">
        {animation.stage}
        {animation.error ? ` · ${animation.error}` : ""}
      </p>
      {animation.scene ? (
        <>
          <header>
            <strong>{animation.scene.title}</strong>
            <span>代码绘制 · 960 × 540 · 30 fps</span>
          </header>
          <canvas ref={canvas} width={960} height={540} aria-label="5 秒代码动画预览" />
          <div className="animation-playback">
            <button
              type="button"
              onClick={() => {
                if (time >= 5) setTime(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "暂停" : time >= 5 ? "重播" : "播放"}
            </button>
            <input
              aria-label="动画播放位置"
              type="range"
              min={0}
              max={5}
              step={1 / 30}
              value={time}
              onChange={(event) => {
                setPlaying(false);
                setTime(Number(event.target.value));
              }}
            />
            <output>{time.toFixed(1)} / 5.0 s</output>
            <button
              type="button"
              disabled={busy || animation.status !== "ready"}
              onClick={() => {
                void bridge.runAnimation("export").catch(() => undefined);
              }}
            >
              导出 MP4
            </button>
          </div>
          {animation.exportPath ? (
            <p className="animation-export-result">已导出到当前项目 · animation.mp4</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
