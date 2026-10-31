import { memo, useMemo } from "react";
import { ChevronRightIcon } from "../../../ui/icons";
import { MessageMarkdown } from "../message-markdown";
import { nativeReplyRecords, replyLead } from "./doubao-message-presentation";

function FullReply({ text, label }: { readonly text: string; readonly label: string }) {
  return (
    <details className="doubao-message-full">
      <summary>
        <ChevronRightIcon />
        <span>{label}</span>
      </summary>
      <div className="doubao-message-original">
        <MessageMarkdown text={text} />
      </div>
    </details>
  );
}

export const DoubaoMessageBody = memo(function DoubaoMessageBody({
  text,
  role,
}: {
  readonly text: string;
  readonly role: "user" | "assistant";
}) {
  const reply = useMemo(
    () => (role === "assistant" ? nativeReplyRecords(text) : null),
    [role, text],
  );
  if (reply) {
    const resultLead = replyLead(reply.result);
    return (
      <div className="doubao-message-body doubao-message-body--structured">
        {reply.introduction ? <MessageMarkdown text={reply.introduction} /> : null}
        <details className="doubao-message-process" open>
          <summary className="process-stage__head">
            <ChevronRightIcon />
            <span className="doubao-message-record-mark" aria-hidden="true" />
            <span>处理过程</span>
            <small>{reply.records.length} 条记录</small>
          </summary>
          <div className="doubao-message-records">
            <p className="doubao-message-provenance">豆包回复记录</p>
            {reply.records.map((record, index) =>
              record.text ? (
                <details className="doubao-message-record" key={index}>
                  <summary>
                    <ChevronRightIcon />
                    <span>{record.title}</span>
                  </summary>
                  <MessageMarkdown text={record.text} />
                </details>
              ) : (
                <p className="doubao-message-record-caption" key={index}>
                  {record.title}
                </p>
              ),
            )}
            <FullReply text={text} label="原始回复" />
          </div>
        </details>
        {resultLead ? (
          <div className="doubao-message-result">
            <MessageMarkdown text={resultLead} />
          </div>
        ) : null}
        {reply.result && reply.result !== resultLead ? (
          <FullReply text={reply.result} label="结果说明" />
        ) : null}
      </div>
    );
  }
  if (text.length <= 240 && text.split("\n").length <= 8) return <MessageMarkdown text={text} />;
  const lead = replyLead(text);
  return (
    <div className="doubao-message-body">
      {lead ? (
        <div className="doubao-message-lead">
          <MessageMarkdown text={lead} />
        </div>
      ) : null}
      <FullReply text={text} label={role === "user" ? "完整要求" : "回复详情"} />
    </div>
  );
});
