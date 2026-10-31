# 每项目目录

- inbox/links/<video_id>.url.json
- raw/videos/<video_id>/source.<ext>
- raw/videos/<video_id>/meta.json
- learning/<video_id>/frames.json（frame_index、pts_ms、path、sha256）
- learning/<video_id>/spec.json（真实视觉模型分析与帧引用）
- learning/<video_id>/analysis-receipt.json（实际提交帧、响应 ID、结束原因）
- _gates/download.<video_id>.json
- _gates/media.<video_id>.json
- _gates/analysis.<video_id>.json
- remake/out/<video_id>/（可选；默认跳过）

这是骨架约定，不是运行根。旧 watch.ok 不能作为新流水线成功依据。
