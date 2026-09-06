# MVP 验收证据矩阵

本文对应设计规格第 21 节的 16 项验收标准。命令均在 2026-08-28 的本地分支执行；Zotero 宿主基线为 9.0.6。

|   # | 验收标准                                             | 当前证据                                                                                                                   | 状态     |
| --: | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
|   1 | Zotero 9 可安装、启用、禁用、卸载，关闭后无任务      | macOS Zotero 9.0.6 已真实完成 XPI 安装、启用、禁用、重新启用和卸载；跨版本升级及退出后进程检查未完成；宿主自动化 39 项通过 | 部分通过 |
|   2 | 不依赖 Python、Action、SMTP 或后端                   | 插件构建依赖 Node；安装和模型配置文档明确本地手动流程；方舟普通 API/Coding Plan 均走本地 OpenAI-compatible HTTP 客户端     | 通过     |
|   3 | 推荐数量/画像可控，画像可编辑、锁定、回滚            | `profileEditorView`、画像 overlay/repository、workspace 测试；工作台提供合并、拆分、回滚入口                               | 通过     |
|   4 | 无库变更不重复请求 Zotero 论文 Embedding             | `identical second run makes zero embedding requests`、failure matrix 零请求测试                                            | 通过     |
|   5 | 切换模型不混用旧向量                                 | `modelFingerprint` 将 Provider、Base URL、模型和维数纳入 generation；Embedding generation 和 repository 测试               | 通过     |
|   6 | 推荐可追溯到画像、代表论文、关键词、分数、模型和版本 | `recommendationWorkspace` 六项解释测试、诊断导出测试；方舟 Provider/模型显示在设置和错误诊断中                             | 通过     |
|   7 | LLM 默认关闭；关闭原文，开启中文且可看原文           | `summaryToggle`、OpenAI client 和摘要服务测试                                                                              | 通过     |
|   8 | 连续保存同一论文 10 次只产生一个父条目               | import idempotency、stable intent 单元测试                                                                                 | 通过     |
|   9 | PDF 失败不删除父条目，重试不重复入库                 | PDF policy、attachment service、import task 测试                                                                           | 通过     |
|  10 | 模型、arXiv、PDF、数据库故障不损坏已发布状态         | `test/integration/failureMatrix.test.mts`，5 类故障全部通过                                                                | 通过     |
|  11 | Key 不出现在日志、错误和诊断                         | redactor、HTTP error、诊断导出测试和 XPI 字符串扫描                                                                        | 通过     |
|  12 | 数据库迁移可恢复，反馈和人工覆盖有备份               | migration runner、profile repository、overlay repository 测试                                                              | 通过     |
|  13 | 满足离线质量门槛；样本不足只能 Beta                  | 时间回放固定夹具：5 截点/20 正例可验证门槛；公开样例报告按 5 正例标记证据不足                                              | Beta     |
|  14 | 有缓存时推荐页 1 秒内显示可交互界面                  | Zotero 9.0.6 真实 DOM 测试：20 条缓存推荐首屏约 1ms                                                                        | 通过     |
|  15 | 1000 候选、最多 12 画像本地打分重排不超过 2 秒       | `npm run test:performance`：当前 Mac 约 20.77ms，网络单独计量                                                              | 通过     |
|  16 | 任务中心支持展示、取消、重试、继续，重启不自动联网   | RunCoordinator、task center、startup/lifecycle 和 Zotero 任务测试                                                          | 通过     |

## 发布前人工项

1. macOS 真实 Zotero profile 已完成安装、启用、禁用、重新启用和卸载；跨版本升级、最终重装状态和关闭进程检查仍需补齐。
2. 在 Windows、Linux 的 Zotero 9 最新稳定小版本执行同一清单。
3. 把操作系统、Zotero 版本、插件版本、截图和 XPI SHA256 填入
   [`zotero-9-smoke.md`](../test/manual/zotero-9-smoke.md)。

本轮自动化证据更新于 2026-08-28：`check` 通过 120 个单元测试和 12 个集成测试，`test:zotero` 通过 39 项，TypeScript 类型检查通过，性能门禁通过。新增方舟 Provider 注册表、普通 API/Coding Plan URL 与请求路径、模型指纹隔离、错误提示、Zotero 混合文档 XHTML option 和 Zotero AbortController 兼容回归测试。时间回放命令必须显式提供 `--out`，当前公开夹具因少于 20 个可匹配正例只输出 Beta/证据不足。

当前构建产物：`.scaffold/build/zotero-arxiv-daily.xpi`，版本 `0.1.0-beta.3`；SHA256 为 `d30ab2d21e2d68484f30a78695ef0e053d721703316f3fd7b9652573b55f6f0a`，SHA512 为 `e1e9779156473cbf153f3093144d0cea375d6b681daf58acf2b4f07d91a2278f22f493291c9030109e54bc24c806734cdca832c6afd2ba8ec2c9221e7b29a1b1`。构建包内容守卫通过，未包含 `.env`、SQLite、node_modules、模型目录或旧邮件链路配置。CLI 最后的脚手架更新检查在当前网络环境收到 `ECONNRESET`，不影响已生成并完成 manifest/hash/类型检查的 XPI 产物。

本轮 Beta.2 尚未使用真实方舟 API Key 发起云端请求；普通 API 与 Coding Plan 的请求路径、默认 Base URL、错误分流和模型 ID/Endpoint ID 配置已由自动化测试覆盖。接入时应按 [`model-configuration.md`](model-configuration.md) 手工测试 Embedding，再按需开启 LLM 中文摘要。

在上述人工证据完成前，插件可以作为工程 Beta 验证版使用，但不应宣称已经完成三平台发布验收；第 13 项也不应宣称新版推荐已被真实用户数据证明提升。
