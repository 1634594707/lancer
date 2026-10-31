import type { ThreadListEntry } from "./thread-groups";
import { stripLancerZonePrefix } from "../../../contracts/lancer-zones";
import { ModelBrandIcon } from "../../ui/model-brand-icon";

export function LancerRecentThreads({
  threads,
  onSelect,
}: {
  readonly threads: readonly ThreadListEntry[];
  readonly onSelect: (target: { workspaceId: string; sessionId: string }) => void;
}) {
  return (
    <footer className="lancer-recent-threads" aria-label="Recently here">
      <span>RECENTLY HERE</span>
      <div className="lancer-recent-threads__items">
        {threads.slice(0, 8).map((thread) => (
          <button
            key={`${thread.workspaceId}:${thread.session.id}`}
            type="button"
            title={stripLancerZonePrefix(thread.session.title)}
            aria-label={stripLancerZonePrefix(thread.session.title)}
            onClick={() =>
              onSelect({ workspaceId: thread.workspaceId, sessionId: thread.session.id })
            }
          >
            <ModelBrandIcon
              provider={thread.session.config?.provider}
              modelId={thread.session.config?.modelId}
            />
            <i data-status={thread.session.status} />
          </button>
        ))}
      </div>
      <small>
        {threads.filter((thread) => thread.session.status === "running").length} 运行中 ·{" "}
        {threads.length} 个会话
      </small>
    </footer>
  );
}
