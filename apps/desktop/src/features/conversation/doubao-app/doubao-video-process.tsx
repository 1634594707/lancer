import { useContext, useEffect, useState, type CSSProperties } from "react";
import type { VideoLearnSnapshot, VideoLearnStage } from "../../../../contracts/video-learn";
import type { AnimationSnapshot } from "../../../../contracts/code-animation";
import { ModelBrandIcon } from "../../../ui/model-brand-icon";
import { ChevronRightIcon } from "../../../ui/icons";
import { ImageAttachmentThumb } from "../image-attachment-thumb";
import { videoLearnStageArtifacts } from "../video-learn-stages";
import { ProcessHandoffCard } from "../process-timeline/process-handoff-card";
import { RunningBorder } from "../lancer-process/running-border";
import { ProcessDataContext } from "../lancer-process/process-glyph";
import "./doubao-video-process.css";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} 秒`;
const frameTime = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;

function VideoFrames({
  frames,
  lessons,
}: {
  readonly frames: AnimationSnapshot["frames"];
  readonly lessons: VideoLearnSnapshot["lessons"];
}) {
  const [all, setAll] = useState(false);
  return (
    <div className="video-process-frames">
      <div className="video-process-filmstrip" aria-label="视频快照">
        {(all ? frames : frames.slice(0, 8)).map((frame) => (
          <figure
            key={frame.frameIndex}
            data-referenced={
              lessons?.some((lesson) => lesson.frame_index === frame.frameIndex) || undefined
            }
          >
            <ImageAttachmentThumb
              src={frame.image}
              name={`视频快照 ${frameTime(frame.ptsMs)}`}
              className="video-process-thumbnail"
            />
            <figcaption>{frameTime(frame.ptsMs)}</figcaption>
          </figure>
        ))}
      </div>
      {frames.length > 8 ? (
        <button type="button" onClick={() => setAll(!all)}>
          {all ? "收起快照" : `查看全部 ${frames.length} 张快照`}
        </button>
      ) : null}
    </div>
  );
}

function VideoStage({
  snapshot,
  stage,
  frames,
}: {
  readonly snapshot: VideoLearnSnapshot;
  readonly stage: VideoLearnStage;
  readonly frames: AnimationSnapshot["frames"];
}) {
  const data = useContext(ProcessDataContext);
  const id = `video-learn-event:${snapshot.videoId}:${stage.id}`;
  const event = data?.events.find((event) => event.id === id);
  const color = data?.lanes.find((lane) => lane.id === event?.lane)?.color ?? "#428ee6";
  const [open, setOpen] = useState(stage.running || stage.id === "media" || stage.id === "handoff");
  useEffect(() => {
    if (stage.running) setOpen(true);
  }, [stage.running]);
  const artifacts = videoLearnStageArtifacts(snapshot, stage.id);
  const operations = stage.id === "media" ? (snapshot.operations ?? []) : [];
  const duration =
    operations.length && operations.every((op) => op.durationMs !== undefined)
      ? operations.reduce((sum, op) => sum + op.durationMs!, 0)
      : undefined;
  const from = snapshot.stages.find((entry) => entry.id === "analysis")?.model;
  const title =
    stage.id === "handoff" && stage.model
      ? `交接 → ${stage.model}`
      : stage.id === "media" && stage.ok && frames.length
        ? `提交 / 保存 · 视频快照 ×${frames.length}`
        : stage.guiLabel;
  const count = operations.length || artifacts.length;
  return (
    <details
      className="video-process-stage"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-stage={stage.id}
      data-failed={(!stage.ok && !stage.running) || undefined}
      style={{ "--lc": color } as CSSProperties}
    >
      <summary className="process-stage__head" data-running={stage.running || undefined}>
        {stage.running ? <RunningBorder /> : null}
        <ChevronRightIcon />
        <span
          className={`video-process-mark ${stage.id === "handoff" ? "video-process-mark--handoff" : ""}`}
          data-chat-anchor={event ? id : undefined}
          data-anchor-key={event ? `chat:${id}` : undefined}
          aria-hidden="true"
        />
        <span className="video-process-title">{title}</span>
        <span className="video-process-meta">
          {stage.running
            ? "进行中"
            : !stage.ok
              ? "未完成"
              : count
                ? `${count} ${operations.length ? "步" : "个文件"}`
                : "已完成"}
          {duration !== undefined ? ` · ${seconds(duration)}` : ""}
        </span>
      </summary>
      <div className="video-process-branch">
        {stage.id === "handoff" && from && stage.model ? (
          <ProcessHandoffCard
            from={from}
            to={stage.model}
            files={videoLearnStageArtifacts(snapshot, "analysis")
              .filter((artifact) => artifact.path.endsWith("spec.json"))
              .map((artifact) => artifact.path)}
            summary="携带视频观察与快照引用，继续整理可复用的剪辑方法。"
            status={
              stage.ok
                ? `${snapshot.lessons?.length ?? 0} 条结论 · 引用已核验`
                : stage.running
                  ? "正在整理学习结论"
                  : "交接未完成"
            }
          />
        ) : null}
        <details className="video-process-steps" open>
          <summary>
            <ChevronRightIcon />
            {stage.running ? "执行记录" : stage.ok ? "已完成" : "处理停止"}
            {count ? ` ${count} ${operations.length ? "个步骤" : "个文件"}` : ""}
            {duration !== undefined ? ` · ${seconds(duration)}` : ""}
          </summary>
          {operations.map((operation) => (
            <details className="video-process-step" key={operation.id}>
              <summary>
                <ChevronRightIcon />
                <span>{operation.label}</span>
                <small>
                  {operation.status === "error"
                    ? "失败"
                    : operation.durationMs !== undefined
                      ? seconds(operation.durationMs)
                      : "进行中"}
                </small>
              </summary>
              <div className="process-tool-step__terminal">
                <pre className="process-tool-step__command">$ {operation.command}</pre>
                {operation.output ? (
                  <pre className="process-tool-step__output">{operation.output}</pre>
                ) : null}
                {operation.error ? <p role="alert">{operation.error}</p> : null}
              </div>
            </details>
          ))}
          {!operations.length
            ? artifacts.map((artifact) => (
                <details className="video-process-step" key={artifact.path}>
                  <summary>
                    <ChevronRightIcon />
                    <span>保存 {artifact.path.split("/").at(-1)}</span>
                    <small>
                      {artifact.status === "passed"
                        ? "已核验"
                        : artifact.status === "failed"
                          ? "未通过"
                          : "未验证"}
                    </small>
                  </summary>
                  <div className="video-process-file">
                    <code>{artifact.path}</code>
                    <code>SHA256 {artifact.sha256}</code>
                  </div>
                </details>
              ))
            : null}
          {stage.id === "media" && frames.length ? (
            <VideoFrames frames={frames} lessons={snapshot.lessons} />
          ) : null}
        </details>
        {!stage.ok && !stage.running ? (
          <p role="alert" className="video-process-error">
            {stage.statusCode}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function DoubaoVideoProcess({
  snapshot,
  frames = [],
}: {
  readonly snapshot: VideoLearnSnapshot;
  readonly frames?: AnimationSnapshot["frames"];
}) {
  const model = snapshot.stages.find((stage) => stage.id === "handoff")?.model;
  const lessons = snapshot.lessons ?? [];
  return (
    <section className="doubao-video-process" aria-label="视频学习进度">
      {snapshot.stages.map((stage) => (
        <VideoStage
          key={`${snapshot.videoId}:${stage.id}`}
          snapshot={snapshot}
          stage={stage}
          frames={frames}
        />
      ))}
      {lessons.length ? (
        <article className="video-process-conclusion">
          <header>
            <ModelBrandIcon modelId={model} />
            <b>{model ?? "学习结论"}</b>
          </header>
          {lessons.slice(0, 2).map((lesson, i) => (
            <p key={i}>
              {lesson.lesson}
              <small>依据 {frameTime(lesson.pts_ms)}</small>
            </p>
          ))}
          {lessons.length > 2 ? (
            <details>
              <summary>其余 {lessons.length - 2} 条结论</summary>
              {lessons.slice(2).map((lesson, i) => (
                <p key={i}>
                  {lesson.lesson}
                  <small>依据 {frameTime(lesson.pts_ms)}</small>
                </p>
              ))}
            </details>
          ) : null}
          {snapshot.guiStatus === "HANDED_OFF" ? (
            <span className="video-process-complete">✓ 阶段完成 · 学片与模型交接完成</span>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
