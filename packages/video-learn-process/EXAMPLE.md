# 历史样例说明

`examples/demo_v001/` 为 0.1.x 的静态旧格式，包含 `watch.ok`，没有新版 media/analysis 证据。保留用于历史对照，**不再作为可验收成功样本**。

当前成功样本必须由真实流水线产生：download.ok → media.ok → analysis.ok，配套真实原片、帧文件/哈希清单和视觉模型结果。不得把样例中的假哈希、固定镜头或历史 gate 复制成实际成功。

remake 仍为可选，默认跳过不算失败。
