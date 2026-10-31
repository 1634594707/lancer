import { useState } from "react";
import type { VideoDeliverable } from "./video-deliverables";
import "./video-delivery-cards.css";

export function VideoDeliveryCards({
  deliveries,
  onOpen,
}: {
  readonly deliveries: readonly VideoDeliverable[];
  readonly onOpen?: (path: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  return (
    <section className="video-delivery-cards" aria-label="视频交付物">
      {deliveries.map((delivery) => (
        <article key={delivery.id}>
          <div>
            <strong>{delivery.title}</strong>
            <span title={delivery.path}>{delivery.path.split("/").at(-1)}</span>
          </div>
          <button
            type="button"
            disabled={!onOpen}
            aria-label={`打开${delivery.title}`}
            onClick={() => {
              if (!onOpen) return;
              setError("");
              void onOpen(delivery.path).catch(() => setError("文件无法打开，请检查保存位置。"));
            }}
          >
            打开 ↗
          </button>
          <details>
            <summary>文件信息</summary>
            <p>{delivery.path}</p>
            <p>SHA-256 · {delivery.sha256}</p>
          </details>
        </article>
      ))}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
