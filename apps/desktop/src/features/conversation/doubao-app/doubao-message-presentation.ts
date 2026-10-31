/** Display-only projection of native replies. Never create tool events or change saved text. */
export interface DoubaoReplyRecord {
  readonly title: string;
  readonly text: string;
}

// Native Doubao includes standalone action captions between its spoken paragraphs.
// Require multiple captions; ordinary prose, lists and code must remain ordinary replies.
const actionCaption =
  /^(?:处理|打开|查看|确定|排查|编写|交付|读取|搜索|检查|分析|下载|保存|运行|先处理)[^。！？，：；.!?,:;`#[\]<>\n]{2,28}$/u;
const resultStart =
  /^(?:全部完成[。！.!]|以下是结果汇总|(?:成片|视频|文件|任务)已完成(?:并交付)?[。！.!])/mu;

export function nativeReplyRecords(text: string) {
  if (/^\s*(?:```|~~~)/m.test(text)) return null;
  const resultIndex = text.search(resultStart);
  const process = resultIndex < 0 ? text : text.slice(0, resultIndex);
  const lines = process.split("\n");
  const captions = lines.flatMap((line, index) =>
    index > 0 && actionCaption.test(line.trim()) ? [{ index, title: line.trim() }] : [],
  );
  if (captions.length < 2) return null;
  return {
    introduction: lines.slice(0, captions[0]?.index).join("\n").trim(),
    records: captions.map(({ index, title }, i): DoubaoReplyRecord => ({
      title,
      text: lines
        .slice(index + 1, captions[i + 1]?.index)
        .join("\n")
        .trim(),
    })),
    result: resultIndex < 0 ? "" : text.slice(resultIndex).trim(),
  };
}

/** A complete source sentence/line, never an ellipsis or a sliced Markdown link. */
export function replyLead(text: string): string | null {
  const firstLine = text.trim().split("\n")[0] ?? "";
  if (!firstLine || /^\s*(?:```|[>|#]|\d+[.)]\s)/u.test(firstLine)) return null;
  if (firstLine.length <= 160) return firstLine;
  const sentence = firstLine.match(/^.{1,160}?(?:[。！？](?:[”」』])?|[.!?](?=\s|$))/u)?.[0];
  return sentence && !/[`*_[\]<>]|https?:\/\//u.test(sentence) ? sentence : null;
}
