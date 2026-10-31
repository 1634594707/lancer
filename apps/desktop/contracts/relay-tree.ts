/** Mechanical disk evidence only; never model responses or credentials. */
export type RelayStep = "download" | "media" | "analysis" | "handoff" | "remake";
export interface RelayGate {
  readonly step: RelayStep;
  readonly statusCode: string;
  readonly timestamp: string;
  readonly errorCode?: string;
  readonly artifacts: Readonly<Record<string, string>>;
}
export interface RelayArtifact {
  readonly step: RelayStep;
  readonly path: string;
  readonly sha256: string;
  readonly timestamp: string;
  readonly gatePath?: string;
  readonly mtime?: string;
  readonly startedAt?: string;
  readonly status: "running" | "passed" | "failed" | "unverified";
  readonly statusCode?: string;
  readonly runId?: string;
  readonly errorCode?: string;
  readonly model?: string;
}
export interface RelayTreeEvidence {
  readonly gates: readonly RelayGate[];
  readonly artifacts: readonly RelayArtifact[];
  readonly models: Partial<Readonly<Record<RelayStep, string>>>;
}
