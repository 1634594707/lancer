# 视频学习进程契约

本包定义 Lancer 每项目的文件与验收约定。主成功终点是 **analysis.ok**：

`download.ok（文件和哈希） → media.ok（真实媒体探测与帧） → analysis.ok（视觉模型分析与引用校验）`

每个前置门控必须成立才能启动下一步。下载成功不代表有效视频；媒体探测成功不代表模型已经理解视频。旧 `watch.ok` 和 `MECH_PROBE` 不再算学习成功。模型间交接使用 schema、path、sha256、frame_index 与状态码；人看 GUI。

## 文件

每个项目根下保留：

- `inbox/links/<video_id>.url.json`：来源链接。
- `raw/videos/<video_id>/source.<ext>` 与 `meta.json`：原始文件及身份。
- `learning/<video_id>/frames.json`：已抽取的帧清单；每帧包括 `frame_index`、`pts_ms`、`path`、`sha256`。`learning/frames.json` 是当前帧清单索引；按 video_id 隔离的清单是验收依据，避免并行视频覆盖。
- `learning/<video_id>/spec.json`：视觉模型的结构化学习结果及帧引用。
- `learning/<video_id>/analysis-receipt.json`：实际提交帧、provider/model、响应 ID、可用时的请求 ID、`finish_reason=stop`。analysis 门控以 `learning_spec_sha256` 与 `receipt_sha256` 绑定两个文件，防止事后替换。
- `_gates/download.<video_id>.json`、`media.<video_id>.json`、`analysis.<video_id>.json`：逐级门控。
- `remake/out/<video_id>/`：可选；默认跳过且不算失败。

`PROCESS.json` 是状态机，`schemas/` 是文件结构。字段合法仅是必要条件；哈希、帧文件存在、引用归属、实际模型执行还需运行时验证。

## 六种执行错误

| 代码            | 含义                                      |
| --------------- | ----------------------------------------- |
| E_NOT_VIDEO     | 不是有效视频，或没有可用视频流            |
| E_PROBE_MISSING | 探测/抽帧工具缺失                         |
| E_PROBE_FAIL    | 探测/抽帧失败，禁止用默认时长或帧数凑成功 |
| E_TIMEOUT       | 下载、探测、抽帧或模型执行超时            |
| E_MODEL_FAIL    | 视觉模型失败或响应结构不合法              |
| E_MODEL_BAD_REF | 引用不存在、超出已提供帧集合或时码不一致  |

下载认证等失败可保留下载层的具体原因；上述六种是媒体/分析执行错误。错误发生后不得继续签发下游成功门控。

## 验收入口

使用 Lancer GUI 运行实际流水线后：

```bash
node packages/video-learn-process/scripts/accept_download_watch.mjs <video_id> --project-root /path/to/project
```

文件名为兼容保留，现检查三个新门控，成功输出 `ACCEPT_OK analysis endpoint`。旧 `watch_gate.mjs` 同样仅做只读验证，不再创建 `watch.ok`，也不能凭一份手写 spec 给模型分析背书。独立的 `validate_learning_spec.mjs` 只校验结构，不证明模型调用发生。

旧 `download_gate.sh` 使用默认 probe 数值，现停用并非零退出；真实下载继续由桌面执行路径负责。本包不新增第二条服务或模型调用路径。

## 可选复刻

只有明确启用且 `analysis.ok` 成立，引用与 `allowed_use` 允许时，才可进入 remake。默认 `remake.skipped_by_policy` 不算失败，不能强制生成视频。未验证的历史 `examples/demo_v001` 保留为旧格式资料，不作为新版成功样本。
