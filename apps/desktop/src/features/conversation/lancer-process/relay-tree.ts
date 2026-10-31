import processDefinition from "../../../../../../packages/video-learn-process/PROCESS.json";
import type { RelayArtifact, RelayStep, RelayTreeEvidence } from "../../../../contracts/relay-tree";
import type { VideoLearnSnapshot } from "../../../../contracts/video-learn";
import type { ProcessEvent, ProcessFixture, ProcessMessage } from "./process-types";
import { PROCESS_LANE_COLORS } from "./process-palette";

export interface RelayTreeInput extends RelayTreeEvidence {
  readonly snapshot: Pick<VideoLearnSnapshot, "videoId" | "stages" | "busy">;
}
const labels: Record<RelayStep, string> = {
  download: "下载",
  media: "媒体检查",
  analysis: "看帧",
  handoff: "学习结论",
  remake: "复刻",
};
export function shortRelayModel(model: string): string {
  return model
    .split(" + ")
    .map((name) => {
      const known = /(?:^|-)(terra|sol|astra)$/i.exec(name)?.[1];
      return known ? known[0]!.toUpperCase() + known.slice(1).toLowerCase() : name;
    })
    .join("+");
}
const epoch = (value?: string) => {
  const n = Date.parse(value ?? "");
  return Number.isFinite(n) ? n : undefined;
};
/** Real attempts become authored git-tree events; geometry belongs exclusively to ProcessTree. */
export function buildRelayTree(input: RelayTreeInput): ProcessFixture {
  const order: RelayStep[] = [
    ...(processDefinition.steps.flatMap((step) =>
      step.id === "download" || step.id === "media" || step.id === "analysis" ? [step.id] : [],
    ) as RelayStep[]),
    "handoff",
    "remake",
  ];
  const model = (step: RelayStep) =>
    input.models[step] ??
    input.snapshot.stages.find((s) => s.id === step)?.model ??
    (step === "download" ? "本地导入" : step === "media" ? "本地" : "未记录模型");
  const lanes = order.map((step, index) => ({
    id: `relay:${step}`,
    name: `${labels[step]} · ${shortRelayModel(model(step))}`,
    title: `${labels[step]} · ${model(step)}`,
    color: PROCESS_LANE_COLORS[index % PROCESS_LANE_COLORS.length]!,
    relay: [
      `relay-model:${step}`,
      ...(order[index + 1] ? [`relay-model:${order[index + 1]}`] : []),
    ],
    available: true,
  }));
  const groups = new Map<string, RelayArtifact[]>();
  const seen = new Set<string>();
  const artifacts = [...input.artifacts].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.path.localeCompare(b.path),
  );
  for (const artifact of artifacts) {
    const identity = `${artifact.gatePath ?? artifact.runId ?? artifact.step}:${artifact.path}:${artifact.sha256}`;
    if (seen.has(identity) || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) continue;
    seen.add(identity);
    const key = artifact.runId
      ? `remake:${artifact.runId}`
      : `${artifact.gatePath ?? artifact.step}:${artifact.timestamp}`;
    const group = groups.get(key) ?? [];
    group.push(artifact);
    groups.set(key, group);
  }
  // The tree may merge identical products, but each gate retains its own block.
  const gateGroups = new Map([...groups].map(([key, group]) => [key, [...group]]));
  // Reused source/media evidence has one node; retain all paths in its detail and
  // point each later occurrence back to it instead of losing its provenance.
  const canonical = new Map<string, string>();
  const duplicates = new Map<string, string>();
  for (const [key, group] of groups) {
    const first = group[0]!;
    if (
      (first.step !== "download" && first.step !== "media") ||
      group.some((a) => a.status !== "passed")
    )
      continue;
    const signature =
      first.step === "download"
        ? group.find((a) => a.path.endsWith("/source.mp4"))?.sha256
        : group
            .map((a) => a.sha256)
            .sort()
            .join(":");
    if (!signature) continue;
    const identity = `${first.step}:${signature}`;
    const previous = canonical.get(identity);
    if (previous) {
      duplicates.set(key, previous);
      groups.get(previous)!.push(...group);
    } else canonical.set(identity, key);
  }
  type Draft = {
    event: ProcessEvent;
    epoch: number;
    sequence: number;
    run: string;
    step: RelayStep;
    group: string;
  };
  const drafts: Draft[] = [];
  const runFor = (artifact: RelayArtifact, key: string) =>
    artifact.runId
      ? input.snapshot.videoId
      : (/^_gates\/[^.]+\.(.+)\.json$/.exec(artifact.gatePath ?? "")?.[1] ?? key);
  let currentRun = "";
  let currentStep: RelayStep = "download";
  let currentGroup = "";
  const messages: Record<string, ProcessMessage[]> = {};
  const starts = new Map<RelayStep, number>();
  const add = (event: Omit<ProcessEvent, "index" | "time">, at: number) => {
    drafts.push({
      event: { ...event, index: 0, time: 0 },
      epoch: at,
      sequence: drafts.length,
      run: currentRun,
      step: currentStep,
      group: currentGroup,
    });
  };
  const groupDetail = (produced: readonly RelayArtifact[]) =>
    produced.map((a) => `${a.path} · ${a.sha256}`).join("\n");
  const artifactDetail = (produced: readonly RelayArtifact[]) =>
    produced
      .map(
        (a) =>
          `${a.path} · ${a.sha256.slice(0, 8)}\nsha256: ${a.sha256}\n${a.statusCode ?? a.status}${a.errorCode ? ` · ${a.errorCode}` : ""}`,
      )
      .join("\n\n") + `\n\n证据时间: ${produced[0]!.timestamp}`;
  const artifactSteps = (id: string, produced: readonly RelayArtifact[], status: string) =>
    produced.map((a) => ({
      id: `${id}:${a.path}`,
      kind: "read" as const,
      label: `${a.path.split("/").at(-1)} · ${a.sha256.slice(0, 8)}`,
      duration: status,
      detail: `${a.path}\nsha256: ${a.sha256}\n${a.statusCode ?? a.status}${a.errorCode ? ` · ${a.errorCode}` : ""}`,
    }));
  for (const [key, produced] of groups) {
    const first = produced[0]!;
    currentRun = runFor(first, key);
    currentStep = first.step;
    currentGroup = key;
    const duplicate = duplicates.get(key);
    if (duplicate) {
      const at = epoch(first.timestamp) ?? epoch(first.mtime);
      if (at !== undefined)
        add(
          {
            id: `relay:${input.snapshot.videoId}:${key}:xref`,
            lane: `relay:${first.step}`,
            actor: `relay-model:${first.step}`,
            kind: "xref",
            reference: `relay:${input.snapshot.videoId}:${duplicate}`,
            label: `${labels[first.step]} · 复用`,
            summary: groupDetail(produced),
            evidenceTimestamp: first.timestamp,
            emits: false,
          },
          at,
        );
      continue;
    }
    const failure = produced.find((a) => a.status === "failed");
    const status = failure
      ? "failed"
      : produced.some((a) => a.status === "running")
        ? "running"
        : produced.some((a) => a.status === "unverified")
          ? "unverified"
          : "passed";
    const representative = failure ?? first;
    const statusLabel = { passed: "通过", failed: "失败", running: "运行中", unverified: "未验证" }[
      status
    ];
    const id = `relay:${input.snapshot.videoId}:${key}`;
    const next = order[order.indexOf(first.step) + 1];
    const at = first.runId
      ? Math.max(
          ...produced.flatMap((a) =>
            epoch(a.timestamp) === undefined ? [] : [epoch(a.timestamp)!],
          ),
        )
      : (epoch(first.timestamp) ?? epoch(first.mtime));
    if (at === undefined || !Number.isFinite(at)) continue; // No fabricated timestamp or progress.
    const times = produced.flatMap((a) => (epoch(a.mtime) === undefined ? [] : [epoch(a.mtime)!]));
    const began = Math.min(
      at,
      ...produced.flatMap((a) => (epoch(a.startedAt) === undefined ? [] : [epoch(a.startedAt)!])),
      ...(first.runId ? times : []),
    );
    const artifactAt = times.length ? Math.min(at, Math.max(...times)) : at;
    starts.set(first.step, Math.min(starts.get(first.step) ?? began, began));
    const branched = first.step !== "download" || status === "failed";
    const branchId = branched ? id : undefined;
    const detail = artifactDetail(produced);
    const attemptModel =
      representative.model ??
      (first.gatePath && !first.gatePath.includes(`.${input.snapshot.videoId}.`)
        ? "未记录模型"
        : model(first.step));
    const common = {
      lane: `relay:${first.step}`,
      actor: `relay-model:${first.step}`,
      evidenceTimestamp: first.timestamp,
      evidenceModel: attemptModel,
      summary: detail,
      emits: false,
    };
    if (branched)
      add(
        {
          ...common,
          id: `${id}:fork`,
          kind: "fork",
          branch: true,
          branchId,
          label: `${labels[first.step]} · 尝试`,
        },
        began,
      );
    const title =
      next && status === "passed"
        ? `交接 → ${model(next)}`
        : `${status === "failed" ? "失败" : "交付"} → ${representative.model ?? (status === "failed" ? "未记录模型" : model(first.step))}`;
    add(
      {
        ...common,
        id,
        emits: true,
        kind: status === "failed" ? "test" : "artifact",
        branch: branched,
        branchId,
        artifacts: produced,
        unverified: status === "unverified",
        artifactPath: representative.path,
        sha256: representative.sha256,
        hash: representative.sha256.slice(0, 8),
        statusCode: representative.statusCode,
        runId: first.runId,
        errorCode: failure?.errorCode,
        label: `${labels[first.step]}${first.runId ? ` · ${first.runId.slice(0, 8)}` : ""} · ${statusLabel} · ${produced.length} 个产物${failure?.errorCode ? ` · ${failure.errorCode}` : ""}`,
        summary: detail,
        fail: status === "failed",
        running: status === "running",
      },
      artifactAt,
    );
    if (status === "passed") {
      add(
        {
          ...common,
          id: `${id}:commit`,
          kind: "commit",
          branch: branched,
          branchId,
          label: `${labels[first.step]} · gate 通过`,
          summary: detail,
        },
        at,
      );
      if (branched)
        add(
          {
            ...common,
            id: `${id}:merge`,
            kind: "merge",
            branchId,
            label: `${labels[first.step]} · 合并`,
          },
          at,
        );
      const terminal = branched ? `${id}:merge` : `${id}:commit`;
      if (next) {
        starts.set(next, Math.min(starts.get(next) ?? at, at));
        add(
          {
            ...common,
            id: `${id}:handoff`,
            lane: `relay:${next}`,
            kind: "handoff",
            targetActor: `relay-model:${next}`,
            label: title,
            reference: terminal,
          },
          at,
        );
      }
    }
    (messages[`relay:${first.step}`] ??= []).push({
      id,
      anchorId: id,
      eventId: id,
      kind: "event",
      time: 0,
      text: title,
      steps: artifactSteps(id, produced, statusLabel),
    });
  }
  for (const [step, at] of starts) {
    currentRun = "";
    currentStep = step;
    currentGroup = "";
    add(
      {
        id: `relay:${input.snapshot.videoId}:${step}:start`,
        lane: `relay:${step}`,
        kind: "start",
        actor: `relay-model:${step}`,
        label: `wt/${step}`,
        summary: "",
        emits: false,
      },
      at,
    );
  }
  drafts.sort(
    (a, b) =>
      a.epoch - b.epoch ||
      Number(b.event.kind === "start") - Number(a.event.kind === "start") ||
      a.sequence - b.sequence,
  );
  const max = drafts.at(-1)?.epoch ?? 0;
  // The tree is an overview, not a replay of every historical run. Keep the
  // latest attempt in each stage and retain older failures in one real-evidence
  // retry summary. The conversation continues to contain every attempt.
  const selected = new Map<RelayStep, Draft>();
  const products = drafts.filter((draft) => draft.event.artifacts);
  for (const draft of products) {
    const current = selected.get(draft.step);
    const when = epoch(draft.event.evidenceTimestamp) ?? draft.epoch;
    const currentWhen = current
      ? (epoch(current.event.evidenceTimestamp) ?? current.epoch)
      : -Infinity;
    if (
      !current ||
      when > currentWhen ||
      (when === currentWhen && draft.sequence > current.sequence)
    )
      selected.set(draft.step, draft);
  }
  const offsets: Partial<Record<ProcessEvent["kind"], number>> = {
    fork: 0,
    artifact: 2.4,
    test: 3.8,
    commit: 3.2,
    merge: 3.8,
    handoff: 4.4,
    xref: 3.0,
  };
  const positioned: (ProcessEvent & { sequence: number })[] = [];
  for (const draft of drafts) {
    if (!draft.run) {
      positioned.push({ ...draft.event, time: 0.2, sequence: draft.sequence });
      continue;
    }
    if (selected.get(draft.step)?.group !== draft.group) continue;
    const base = 0.5 + order.indexOf(draft.step) * 5;
    positioned.push({
      ...draft.event,
      time: base + (draft.event.unverified ? 3.8 : (offsets[draft.event.kind] ?? 0)),
      sequence: draft.sequence,
    });
  }
  for (const [step, latest] of selected) {
    const base = 0.5 + order.indexOf(step) * 5;
    const earlierFailures = products.filter(
      (draft) => draft.step === step && draft.group !== latest.group && draft.event.fail,
    );
    if (earlierFailures.length) {
      const identity = earlierFailures
        .map((draft) => `${draft.event.id}:${draft.event.sha256}`)
        .join("|");
      let fingerprint = 2166136261;
      for (const character of identity)
        fingerprint = Math.imul(fingerprint ^ character.charCodeAt(0), 16777619);
      const id = `relay:${input.snapshot.videoId}:${step}:retries:${(fingerprint >>> 0).toString(16)}`;
      const detail = earlierFailures
        .map((draft) =>
          [
            `${draft.event.label} · ${draft.event.evidenceTimestamp ?? "时间未记录"}`,
            ...(draft.event.artifacts ?? []).map(
              (artifact) => `${artifact.path} · sha256: ${artifact.sha256.slice(0, 8)}…`,
            ),
          ].join("\n"),
        )
        .join("\n\n");
      const retryArtifacts = earlierFailures.flatMap((draft) => draft.event.artifacts ?? []);
      positioned.push({
        id,
        index: 0,
        time: base + 0.9,
        lane: `relay:${step}`,
        actor: `relay-model:${step}`,
        kind: "test",
        fail: true,
        label: `×${earlierFailures.length} 次重试`,
        summary: detail,
        evidenceTimestamp: earlierFailures.at(-1)!.event.evidenceTimestamp,
        emits: true,
        sequence: drafts.length + positioned.length,
      });
      positioned.push({
        id: `${id}:retry`,
        index: 0,
        time: base + 1.7,
        lane: `relay:${step}`,
        actor: `relay-model:${step}`,
        kind: "retry",
        label: `×${earlierFailures.length} 次重试`,
        summary: detail,
        retryTarget: id,
        emits: false,
        sequence: drafts.length + positioned.length,
      });
      (messages[`relay:${step}`] ??= []).push({
        id,
        anchorId: id,
        eventId: id,
        kind: "event",
        time: base + 0.9,
        text: `×${earlierFailures.length} 次重试`,
        steps: retryArtifacts.map((a) => ({
          id: `${id}:${a.gatePath ?? a.runId}:${a.path}`,
          kind: "read",
          label: `${a.path.split("/").at(-1)} · ${a.sha256.slice(0, 8)}`,
          duration: a.errorCode ?? a.statusCode ?? a.status,
          detail: `${a.path}\nsha256: ${a.sha256}\n${a.statusCode ?? a.status}${a.errorCode ? ` · ${a.errorCode}` : ""}`,
        })),
      });
    }
    // One representative same-lane xref summarizes all repeated uses of the
    // canonical artifact; its full provenance remains on the canonical node.
    const reused = drafts.filter(
      (draft) =>
        draft.step === step &&
        draft.event.kind === "xref" &&
        draft.event.reference === latest.event.id,
    );
    if (reused.length) {
      const last = reused.at(-1)!;
      positioned.push({
        ...last.event,
        time: base + 2.9,
        label: `复用 ×${reused.length}`,
        summary: reused.map((draft) => draft.event.summary).join("\n\n"),
        sequence: last.sequence,
      });
    }
  }
  positioned.sort((a, b) => a.time - b.time || a.sequence - b.sequence);
  const events = positioned.map(({ sequence: _sequence, ...event }, index) => ({
    ...event,
    index,
  }));
  // Keep a separate event index for every gate/run in the conversation. Tree
  // geometry, retry aggregation and deduplicated product nodes remain untouched.
  const history = products.map((draft) => {
    const produced = gateGroups.get(draft.group)!;
    const id = draft.event.id;
    const message = messages[draft.event.lane]!.find((item) => item.eventId === id)!;
    const laneMessages = messages[draft.event.lane]!;
    const status = draft.event.fail
      ? "失败"
      : draft.event.running
        ? "运行中"
        : draft.event.unverified
          ? "未验证"
          : "通过";
    laneMessages[laneMessages.indexOf(message)] = {
      ...message,
      steps: artifactSteps(id, produced, status),
    };
    return {
      event: {
        ...draft.event,
        artifacts: produced,
        summary: artifactDetail(produced),
        label: draft.event.label.replace(
          `${draft.event.artifacts!.length} 个产物`,
          `${produced.length} 个产物`,
        ),
      },
      epoch: epoch(draft.event.evidenceTimestamp) ?? draft.epoch,
      sequence: draft.sequence,
      step: draft.step,
    };
  });
  for (const [key, original] of duplicates) {
    const produced = gateGroups.get(key)!;
    const first = produced[0]!;
    const canonicalDraft = products.find((draft) => draft.group === original);
    const at = epoch(first.timestamp) ?? epoch(first.mtime);
    if (!canonicalDraft || at === undefined) continue;
    const source = history.find((item) => item.event.id === canonicalDraft.event.id)!;
    const id = `relay:${input.snapshot.videoId}:${key}`;
    const title = messages[source.event.lane]!.find(
      (message) => message.eventId === source.event.id,
    )!.text;
    const detail = artifactDetail(produced);
    history.push({
      event: {
        ...source.event,
        id,
        artifacts: produced,
        artifactPath: first.path,
        sha256: first.sha256,
        hash: first.sha256.slice(0, 8),
        statusCode: first.statusCode,
        evidenceTimestamp: first.timestamp,
        evidenceModel:
          first.model ??
          (first.gatePath && !first.gatePath.includes(`.${input.snapshot.videoId}.`)
            ? "未记录模型"
            : model(first.step)),
        label: `${labels[first.step]} · 通过 · ${produced.length} 个产物`,
        summary: detail,
      },
      epoch: at,
      sequence: canonicalDraft.sequence,
      step: first.step,
    });
    (messages[source.event.lane] ??= []).push({
      id,
      anchorId: id,
      eventId: id,
      kind: "event",
      time: 0,
      text: title,
      steps: artifactSteps(id, produced, "通过"),
    });
  }
  history.sort((a, b) => a.epoch - b.epoch || a.sequence - b.sequence);
  const conversationEvents = [
    ...history.map(({ event, step }) => ({
      ...event,
      time: 0.5 + order.indexOf(step) * 5 + 2.4,
    })),
    ...events.filter((event) => event.kind === "test" && !event.artifacts && event.emits),
  ].sort((a, b) => a.time - b.time);
  for (const lane of Object.keys(messages))
    messages[lane] = messages[lane]!.map((message) => ({
      ...message,
      time: conversationEvents.find((event) => event.id === message.eventId)?.time ?? message.time,
    }));
  return {
    laneSummary: "单任务接力 · 5 阶段",
    timelineEnd: 26.5,
    clockLabel: drafts.length ? `${new Date(max).toISOString().slice(11, 19)} UTC` : "",
    statusLabel: input.snapshot.busy ? "运行中" : "磁盘门控",
    nodeLabels: false,
    actors: order.map((step) => ({
      id: `relay-model:${step}`,
      name: model(step),
      short: shortRelayModel(model(step)),
      icon: "openai",
    })),
    icons: {},
    lanes: lanes.map((lane) => ({
      ...lane,
      ...(!events.some((event) => event.lane === lane.id && event.artifacts)
        ? { statusLabel: "待开始" }
        : {}),
    })),
    sidebar: [],
    reel: [],
    events,
    conversationEvents,
    messages,
    titles: Object.fromEntries(
      lanes.map((lane, index) => [
        lane.id,
        { title: input.snapshot.videoId, branch: `wt/${order[index]}` },
      ]),
    ),
  };
}
