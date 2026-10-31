import type { ComposerAttachment, QueuedComposerMessage } from "../../../contracts/desktop-state";
import { FileIcon } from "../../ui/icons";
import { ImageAttachmentThumb } from "./image-attachment-thumb";
import { BranchReturnCard } from "./lancer-process/branch-return-card";
import { t } from "../../../contracts/i18n";

interface QueuedComposerMessagesProps {
  readonly workspacePath?: string;
  readonly onOpenDeliverable?: (path: string) => Promise<void>;
  readonly messages: readonly QueuedComposerMessage[];
  readonly editingQueuedMessageId?: string;
  readonly onEditMessage: (messageId: string) => void;
  readonly onRemoveMessage: (messageId: string) => void;
  readonly onSteerMessage: (messageId: string) => void;
  readonly onCancelEdit: () => void;
}

export function QueuedComposerMessages({
  workspacePath,
  onOpenDeliverable,
  messages,
  editingQueuedMessageId,
  onEditMessage,
  onRemoveMessage,
  onSteerMessage,
  onCancelEdit,
}: QueuedComposerMessagesProps) {
  if (messages.length === 0 && !editingQueuedMessageId) {
    return null;
  }

  return (
    <div className="queued-composer-messages" data-testid="queued-composer-messages">
      {editingQueuedMessageId ? (
        <div className="queued-composer-messages__editing" data-testid="queued-composer-editing">
          <span>{t("composer.queue.editing")}</span>
          <button type="button" onClick={onCancelEdit}>
            {t("composer.queue.cancel")}
          </button>
        </div>
      ) : null}
      {messages.map((message) =>
        /^\[return:/.test(message.text) ? (
          <details
            className="queued-branch-return"
            data-testid="queued-branch-return"
            key={message.id}
          >
            <summary>分支已回传，等待主会话处理</summary>
            <BranchReturnCard
              text={message.text}
              pending
              workspacePath={workspacePath}
              onOpenDeliverable={onOpenDeliverable}
            />
          </details>
        ) : (
          <div
            className={`queued-composer-message ${message.id === editingQueuedMessageId ? "queued-composer-message--editing" : ""}`}
            data-testid="queued-composer-message"
            key={message.id}
          >
            <div className="queued-composer-message__header">
              {message.text ? (
                <div className="queued-composer-message__text">{message.text}</div>
              ) : null}
              <div className="queued-composer-message__actions">
                {message.mode !== "steer" ? (
                  <button type="button" onClick={() => onSteerMessage(message.id)}>
                    {t("composer.queue.steer")}
                  </button>
                ) : null}
                <button type="button" onClick={() => onEditMessage(message.id)}>
                  {t("composer.queue.edit")}
                </button>
                <button
                  aria-label={t("composer.queue.deleteLabel", {
                    label: message.text || message.id,
                  })}
                  type="button"
                  onClick={() => onRemoveMessage(message.id)}
                >
                  {t("composer.queue.delete")}
                </button>
              </div>
            </div>
            {message.attachments.length > 0 ? (
              <div className="queued-composer-message__attachments">
                {message.attachments.map((attachment, index) => (
                  <QueuedAttachmentPreview
                    attachment={attachment}
                    key={`${message.id}:${attachment.name}:${index}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}

function QueuedAttachmentPreview({ attachment }: { readonly attachment: ComposerAttachment }) {
  return (
    <div className={`queued-composer-attachment queued-composer-attachment--${attachment.kind}`}>
      {attachment.kind === "image" ? (
        <ImageAttachmentThumb
          className="queued-composer-attachment__preview"
          name={attachment.name}
          src={`data:${attachment.mimeType};base64,${attachment.data}`}
        />
      ) : (
        <>
          <span className="queued-composer-attachment__icon" aria-hidden="true">
            <FileIcon />
          </span>
          <span className="queued-composer-attachment__name">{attachment.name}</span>
        </>
      )}
    </div>
  );
}
