import type { ComponentProps } from "react";
import type { RuntimeSnapshot } from "@lancer/session-driver/runtime-types";
import type { SessionRecord } from "../../contracts/desktop-state";
import { t } from "../../contracts/i18n";
import { LANCER_PROTOTYPE_UI } from "../../contracts/lancer-ui";
import { ModelSelector } from "../features/conversation/model-selector";
import { ThreadActionsMenu } from "../features/threads/thread-actions";
import type { ThreadMenuState } from "../features/threads/hooks/use-thread-actions";
import type { deriveModelOnboardingState } from "../features/settings/model-onboarding";
import { formatRelativeTime } from "../lib/string-utils";

export function ThreadHeaderControls(props: {
  readonly onSelectDoubaoApp?: () => void;
  readonly session: SessionRecord;
  readonly runtime?: RuntimeSnapshot;
  readonly provider?: string;
  readonly modelId?: string;
  readonly thinkingLevel?: string;
  readonly onboarding: ReturnType<typeof deriveModelOnboardingState>;
  readonly runningLabel: string;
  readonly threadMenu: ThreadMenuState;
  readonly actions?: ComponentProps<typeof ThreadActionsMenu>["actions"];
  readonly onSetModel: (provider: string, modelId: string) => void;
  readonly onSetThinking: (level: string) => void;
}) {
  const { session, threadMenu } = props;
  return (
    <>
      {!LANCER_PROTOTYPE_UI ? (
        <span className="thread-model-switcher" data-testid="thread-model-switcher">
          <ModelSelector
            onSelectDoubaoApp={props.onSelectDoubaoApp}
            variant="prominent"
            dropdownPlacement="below"
            runtime={props.runtime}
            provider={props.provider}
            modelId={props.modelId}
            thinkingLevel={props.thinkingLevel}
            disabled={session.status === "running"}
            disabledReason={t("models.runningDisabled")}
            unselectedModelLabel={props.onboarding.unselectedModelLabel}
            emptyModelTitle={props.onboarding.emptyModelTitle}
            onSetModel={props.onSetModel}
            onSetThinking={props.onSetThinking}
          />
        </span>
      ) : null}
      {!LANCER_PROTOTYPE_UI ? (
        <div className="chat-header__status">
          {session.status === "running"
            ? props.runningLabel
            : formatRelativeTime(session.updatedAt)}
        </div>
      ) : null}
      <div
        className="chat-header__menu-wrap"
        ref={threadMenu.openMenu?.surface === "header" ? threadMenu.menuWrapRef : undefined}
      >
        <button
          aria-haspopup="menu"
          aria-expanded={threadMenu.openMenu?.surface === "header"}
          aria-label={t("app.threadActions")}
          className="icon-button"
          data-testid="thread-header-menu"
          type="button"
          onClick={threadMenu.toggleHeaderMenu}
        >
          …
        </button>
        {threadMenu.openMenu?.surface === "header" && props.actions ? (
          <ThreadActionsMenu actions={props.actions} className="chat-header__menu" />
        ) : null}
      </div>
    </>
  );
}
