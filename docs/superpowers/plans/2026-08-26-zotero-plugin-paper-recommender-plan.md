# Zotero 9 arXiv 个性化推荐插件实施计划

> 依据规格：`docs/superpowers/specs/2026-08-26-zotero-plugin-paper-recommender-design.md`

## 1. 目标与执行规则

本计划在现有仓库中新增 `zotero-plugin/`，实现 Zotero 9.0+ 原生插件。现有 Python/Action 邮件链路保持可运行，不在插件 MVP 开发中删除或改写。

执行时遵守以下规则：

1. 每项任务先写失败测试，再写最小实现，最后重构。
2. 每项任务独立提交；阶段门禁未通过，不进入下一阶段。
3. Zotero、网络、数据库、时钟和文件系统均通过适配器注入，领域逻辑不得直接调用全局 `Zotero`。
4. 插件启动只注册 UI 和监听器，不主动读取语料或访问网络。
5. 不直接写 `zotero.sqlite`，只使用插件独立数据库。
6. LLM 默认关闭，且任何时候都不参与画像、排序、归类或推荐解释。
7. `.superpowers/` 是本地设计伴随文件，不加入实现提交。
8. Zotero 启动后不得自动恢复网络或计算任务；遗留运行态先转为 `interrupted`，等待用户操作。

统一验证命令从仓库根目录运行：

```bash
npm --prefix zotero-plugin run format:check
npm --prefix zotero-plugin run lint
npm --prefix zotero-plugin run typecheck
npm --prefix zotero-plugin run test:unit
npm --prefix zotero-plugin run test:zotero
npm --prefix zotero-plugin run test:integration
npm --prefix zotero-plugin run build
```

首要本机目标：`/Applications/Zotero 2.app`，版本 9.0.6。机器路径只写入未跟踪的 `zotero-plugin/.env`，仓库只提交 `.env.example`。

## 2. 技术基线

- Node.js 20+，GitHub Actions 使用 Node.js 22
- TypeScript 5.9+
- 本地相邻目录 `../arxiv2zh-已完成/` 作为 Zotero 9 工程底座
- `zotero-plugin-scaffold` 构建、Zotero 集成测试和 XPI 打包
- `zotero-types` 提供类型
- Node 原生测试运行器配合 `--experimental-strip-types` 执行纯领域和本地 HTTP 集成测试
- 默认只使用 Zotero 原生 API；不预装 `zotero-plugin-toolkit`
- `ml-kmeans@7.0.1`：确定性 K-Means
- `minisearch@7.2.0`：候选超限时的 BM25 预筛
- Zotero 9.0.6 自带的 `Zotero.DBConnection`：插件独立 SQLite 文件
- 原生 DOM + Fluent：插件 UI，不额外引入大型前端框架

所有依赖必须进入 `zotero-plugin/package-lock.json`。从本地模板复制结构时必须排除 `.git`、`.env`、`node_modules`、`.scaffold`、会话数据、翻译服务模块和生成产物；清单改为 `strict_min_version=9.0`、`strict_max_version=9.*`，并以实际安装测试为准。只有出现原生 API 无法覆盖且有复现测试的缺口时，才能最小范围引入 Toolkit。

### 2.1 来源与归属

- `arxiv2zh-已完成` 是工程与已验证 Zotero API 模式的来源，可选择性移植 lifecycle、Fluent、偏好设置、原生菜单、arXiv 解析、元数据建项、附件导入、测试和 CI。
- [zotero-AI-Butler](https://github.com/steven-jianhao-li/zotero-AI-Butler) 是设置向导、连接测试和任务中心的交互参考，不复制其自动扫描、全文 AI、聊天和多 Provider 产品范围。
- Stage 1 创建 `THIRD_PARTY_NOTICES.md`，逐项记录实际复用文件。若没有复制 AI Butler 源码，必须明确标记为“产品交互参考，未打包其代码”。

## 3. Stage 1：插件底座与 Zotero 9 兼容

### Task 1：创建最小可构建插件

**新增文件**

- `zotero-plugin/package.json`
- `zotero-plugin/package-lock.json`
- `zotero-plugin/tsconfig.json`
- `zotero-plugin/eslint.config.mjs`
- `zotero-plugin/.prettierrc.json`
- `zotero-plugin/.env.example`
- `zotero-plugin/zotero-plugin.config.ts`
- `zotero-plugin/addon/manifest.json`
- `zotero-plugin/addon/prefs.js`
- `zotero-plugin/addon/locale/en-US/addon.ftl`
- `zotero-plugin/addon/locale/zh-CN/addon.ftl`
- `zotero-plugin/src/index.ts`
- `zotero-plugin/src/hooks.ts`
- `zotero-plugin/src/types/globals.d.ts`
- `zotero-plugin/THIRD_PARTY_NOTICES.md`

**修改文件**

- `.gitignore`

**步骤**

1. 从本地 `arxiv2zh-已完成` 选择性复制 scaffold、配置、lifecycle、Fluent、偏好设置、测试和 CI 基础结构，不复制其翻译业务模块及本地状态。
2. 设置 addon ID 为 `zotero-arxiv-daily@kongyan66`，实例名为 `ZoteroArxivDaily`。
3. 将清单兼容范围设为 Zotero `9.0` 到 `9.*`。
4. 以模板的 Node 原生测试方式增加 `format:check`、`lint`、`typecheck`、`test:unit`、`test:integration`、`test:zotero`、`build` 脚本。
5. 将 `node_modules/`、`.scaffold/`、构建产物、`.env` 和仓库根 `.superpowers/` 加入 `.gitignore`。
6. 删除或改名所有模板 addon ID、产品名、服务地址、图标和翻译专用偏好键，防止两个插件冲突。
7. 写入来源与 AGPL 归属，只列出实际复制的文件和参考关系。
8. 安装并锁定依赖，不预装 Toolkit 或 `tsx`。

**验证**

```bash
npm --prefix zotero-plugin run typecheck
npm --prefix zotero-plugin run test:unit
npm --prefix zotero-plugin run build
unzip -p zotero-plugin/.scaffold/build/*.xpi manifest.json
```

断言 XPI 清单中的 addon ID、`strict_min_version=9.0` 和 `strict_max_version=9.*` 正确；`rg` 确认产物没有模板的 addon ID、会话键和翻译服务地址。

**提交**

```text
Scaffold Zotero 9 plugin
```

### Task 2：建立纯领域测试和共享类型

**新增文件**

- `zotero-plugin/src/domain/model.ts`
- `zotero-plugin/src/shared/result.ts`
- `zotero-plugin/src/shared/errors.ts`
- `zotero-plugin/src/shared/clock.ts`
- `zotero-plugin/test/unit/shared/result.test.ts`
- `zotero-plugin/test/fixtures/papers.ts`
- `zotero-plugin/test/fixtures/vectors.ts`

**测试先行**

1. 测试 `Result` 区分成功、可重试错误、配置错误和永久错误。
2. 测试固定时钟生成可重复的运行 ID 和时间窗口。
3. 测试 `ZoteroPaper`、`ArxivCandidate`、`InterestProfile`、`ScoreBreakdown` 和 `FeedbackEvent` 的必填字段。

**实现**

1. 建立不引用 Zotero 全局的领域类型。
2. 错误对象包含稳定错误码、用户消息、调试上下文和 `retryable`。
3. 固定夹具覆盖 Document AI、3D Vision、Long-tail Recognition 三个主题。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- test/unit/shared
```

**提交**

```text
Add domain types and test harness
```

### Task 3：验证 Zotero 9 生命周期和版本门禁

**新增文件**

- `zotero-plugin/src/bootstrap/addonLifecycle.ts`
- `zotero-plugin/src/infrastructure/zotero/zoteroVersion.ts`
- `zotero-plugin/test/zotero/lifecycle.test.ts`
- `zotero-plugin/test/zotero/version.test.ts`

**测试先行**

1. Zotero 9.0.6 通过版本检查，8.x 和缺失版本产生明确不兼容错误。
2. `startup` 等待 Zotero 初始化后只注册资源，不启动网络任务。
3. `shutdown` 注销全部注册项，并可重复调用。

**实现**

1. 将全局 `Zotero` 包装为最小 `ZoteroRuntime` 接口。
2. 生命周期持有 disposer 列表，按逆序清理。
3. 生产日志不得输出首选项值或论文内容。

**验证**

```bash
npm --prefix zotero-plugin run test:zotero -- lifecycle version
```

**提交**

```text
Verify Zotero 9 plugin lifecycle
```

### Task 4：创建“今日推荐”独立页签与任务中心外壳

**新增文件**

- `zotero-plugin/src/infrastructure/zotero/workspaceTab.ts`
- `zotero-plugin/src/ui/recommendations/recommendationWorkspace.ts`
- `zotero-plugin/src/ui/recommendations/recommendationWorkspace.css`
- `zotero-plugin/src/ui/tasks/taskCenter.ts`
- `zotero-plugin/test/zotero/workspaceTab.test.ts`
- `zotero-plugin/test/zotero/taskCenterShell.test.ts`

**修改文件**

- `zotero-plugin/src/bootstrap/addonLifecycle.ts`
- 两个 Fluent 语言文件

**测试先行**

1. 使用固定 ID 打开两次只产生一个页签，并选择已有页签。
2. 页签标题为“今日推荐”，关闭后清理 DOM 和事件监听器。
3. 插件启动不自动打开页签，只有用户命令触发。
4. 页面初始渲染不访问 Zotero 语料和网络。
5. 任务中心空态和进行中、失败、完成筛选可渲染，按钮尺寸和列表高度稳定。

**实现**

1. 封装 `Zotero_Tabs.add()`，页签类型使用插件专属名称。
2. 在返回的 `container` 内挂载原生 DOM 根节点。
3. 参考本地模板的 `MenuManager` 与 legacy fallback，在 Zotero 工具菜单和工具栏注册打开命令并完整注销。
4. 初始页面只显示设置状态、缓存摘要、空的推荐区和任务中心外壳。
5. 任务中心只绑定只读 view model；持久任务控制在 Task 18 接入。

**验证**

```bash
npm --prefix zotero-plugin run test:zotero -- workspaceTab taskCenterShell
npm --prefix zotero-plugin run start
```

人工确认打开、重复打开、关闭、禁用插件和重新启用均无残留。

**提交**

```text
Add recommendation workspace and task shell
```

### Task 5：建立插件独立数据库和迁移

**新增文件**

- `zotero-plugin/src/infrastructure/storage/pluginDatabase.ts`
- `zotero-plugin/src/infrastructure/storage/schema.ts`
- `zotero-plugin/src/infrastructure/storage/migrations/001Initial.ts`
- `zotero-plugin/src/infrastructure/storage/migrationRunner.ts`
- `zotero-plugin/test/zotero/pluginDatabase.test.ts`
- `zotero-plugin/test/unit/storage/migrationRunner.test.ts`

**测试先行**

1. 数据库名固定为 `zotero-arxiv-daily`，路径不等于 Zotero 主数据库。
2. 首次打开创建规格中的全部表和索引。
3. 重复执行迁移不改变数据。
4. 迁移前创建备份；模拟失败后恢复旧 schema 和反馈数据。
5. `shutdown` 关闭连接。

**实现**

1. 通过 `new Zotero.DBConnection("zotero-arxiv-daily")` 打开独立文件。
2. 使用事务运行版本化迁移。
3. 向量使用 Float32 BLOB；JSON 字段统一经过 schema 解码。
4. 为 feedback 幂等键、模型世代、profile lineage、arXiv ID、`operation_tasks` 和 `import_tasks` 状态建立索引。
5. `operation_tasks` 保存通用状态、阶段、进度、检查点、重试、脱敏错误和关联领域任务；不得用它代替 `import_tasks` 的入库事实。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- migrationRunner
npm --prefix zotero-plugin run test:zotero -- pluginDatabase
```

**提交**

```text
Add isolated plugin database
```

### Task 6：首次设置向导、连接测试和网络传输层

**新增文件**

- `zotero-plugin/addon/content/preferences.xhtml`
- `zotero-plugin/src/ui/settings/settingsController.ts`
- `zotero-plugin/src/ui/settings/setupWizard.ts`
- `zotero-plugin/src/infrastructure/settings/preferences.ts`
- `zotero-plugin/src/infrastructure/network/httpTransport.ts`
- `zotero-plugin/src/infrastructure/models/openAIEmbeddingClient.ts`
- `zotero-plugin/src/infrastructure/models/openAIChatClient.ts`
- `zotero-plugin/src/application/modelConnectionTester.ts`
- `zotero-plugin/src/application/corpusEstimator.ts`
- `zotero-plugin/test/unit/models/openAIClients.test.ts`
- `zotero-plugin/test/unit/models/modelConnectionTester.test.ts`
- `zotero-plugin/test/zotero/preferences.test.ts`
- `zotero-plugin/test/zotero/setupWizard.test.ts`

**测试先行**

1. 远端 HTTP Base URL 被拒绝，HTTPS 和用户确认后的 localhost HTTP 被接受。
2. Embedding 连接测试使用固定样例，验证鉴权、响应数组、有限数值、向量维数和耗时。
3. LLM 关闭时 Chat Client 不可被调用。
4. 429、5xx 和超时按可取消的指数退避重试。
5. 日志、异常和诊断序列化后不包含 API Key。
6. LLM 可跳过；启用时连接测试验证非空文本响应，不保存测试正文。
7. 向导在用户确认前只统计本地有效论文，不发送标题摘要；明确点击后才创建首次画像任务。

**实现**

1. Embedding 与 LLM 使用独立设置；LLM 默认关闭。
2. Key 保存到本地 Zotero preferences，UI 使用密码输入框，不宣称静态加密。
3. `HttpTransport` 统一超时、取消、重试、状态码和响应大小上限。
4. 模型客户端只接受经过领域层构造的标题摘要输入。
5. 成功测试显示模型、维数和耗时；失败显示脱敏 URL、稳定错误码和排查建议。
6. 向导展示有效论文数、发送字段、预计批次和 Token，LLM 默认关闭并允许跳过。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- openAIClients
npm --prefix zotero-plugin run test:unit -- modelConnectionTester
npm --prefix zotero-plugin run test:zotero -- preferences setupWizard
```

**提交**

```text
Add model setup wizard and secure transport
```

**Stage 1 门禁**

- 六个统一验证命令全部通过。
- 在 Zotero 9.0.6 安装 XPI，页签和设置正常。
- 插件启动无网络请求。
- 数据库明确独立于 `zotero.sqlite`。
- 来源清单准确，XPI 不包含模板服务代码、密钥或本地状态。
- 任务中心外壳可用，启动时不会自动恢复任务。

## 4. Stage 2：增量索引与画像

### Task 7：读取 Zotero 论文语料和收藏夹排除

**新增文件**

- `zotero-plugin/src/infrastructure/zotero/corpusReader.ts`
- `zotero-plugin/src/infrastructure/zotero/collectionTree.ts`
- `zotero-plugin/src/domain/profiles/corpusPolicy.ts`
- `zotero-plugin/test/unit/profiles/corpusPolicy.test.ts`
- `zotero-plugin/test/zotero/corpusReader.test.ts`

**测试先行**

1. 只接受 `journalArticle`、`conferencePaper`、`preprint` 且标题摘要非空的个人库条目。
2. 排除收藏夹包含其子收藏夹；同一条目同时在保留和排除收藏夹时按“被排除”处理。
3. 输出只含规格允许字段。
4. 100 个夹具条目排序和指纹稳定。

**实现**

1. 通过 Zotero Item/Collection API 读取，不读取数据库表。
2. 建立 collection key 到完整路径的映射。
3. 生成 item snapshot 和 corpus fingerprint。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- corpusPolicy
npm --prefix zotero-plugin run test:zotero -- corpusReader
```

**提交**

```text
Read eligible Zotero corpus
```

### Task 8：变更监听和增量脏标记

**新增文件**

- `zotero-plugin/src/infrastructure/zotero/corpusNotifier.ts`
- `zotero-plugin/src/infrastructure/storage/itemSnapshotRepository.ts`
- `zotero-plugin/test/zotero/corpusNotifier.test.ts`

**测试先行**

1. 新增、修改、删除条目和收藏夹变更只写脏标记，不请求模型。
2. 无关 item type 不触发重建。
3. 插件关闭后通知不再写状态。
4. 多次通知同一 item key 合并为一个待处理项。

**实现**

1. 注册最小 Zotero Notifier observer。
2. 将事件批量写入 snapshot repository。
3. 提供“下次运行待处理数量”查询给 UI。

**验证**

```bash
npm --prefix zotero-plugin run test:zotero -- corpusNotifier
```

**提交**

```text
Track Zotero corpus changes incrementally
```

### Task 9：Embedding 世代、批处理和缓存

**新增文件**

- `zotero-plugin/src/domain/embeddings/modelFingerprint.ts`
- `zotero-plugin/src/domain/embeddings/embeddingBatcher.ts`
- `zotero-plugin/src/infrastructure/storage/embeddingRepository.ts`
- `zotero-plugin/test/unit/embeddings/modelFingerprint.test.ts`
- `zotero-plugin/test/unit/embeddings/embeddingBatcher.test.ts`

**测试先行**

1. item version、内容哈希或规范化 Base URL/模型/维数变化会缓存失效。
2. 完全相同的第二次运行请求数为 0。
3. 第 3 批失败后，重试从第 3 批继续。
4. 向量维数变化创建新世代，不覆盖旧世代。
5. 向量写入前 L2 归一化，零向量被拒绝。

**实现**

1. 批量请求只发送标题和摘要。
2. 每批事务提交并保存检查点。
3. 新世代完成前不切换 published generation。
4. UI 接收总数、命中、请求、失败和取消进度。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- embeddings
```

**提交**

```text
Cache embeddings by model generation
```

### Task 10：确定性聚类和 K 选择

**新增文件**

- `zotero-plugin/src/domain/profiles/vectorMath.ts`
- `zotero-plugin/src/domain/profiles/profileClustering.ts`
- `zotero-plugin/src/domain/profiles/clusterCount.ts`
- `zotero-plugin/test/unit/profiles/profileClustering.test.ts`
- `zotero-plugin/test/unit/profiles/clusterCount.test.ts`

**测试先行**

1. 固定种子对同一向量得到相同分组和质心。
2. 少于 15 篇为 1 个画像，15 到 29 篇最多 2 个，30 篇以上为 3 到 12 个。
3. 三主题夹具能分离 Document AI、3D Vision 和 Long-tail Recognition。
4. 不构造 `N × N` 相似度矩阵；性能夹具验证调用次数为 `O(N × K)` 量级。
5. 单成员孤立簇折叠到“其他”。

**实现**

1. 使用 `ml-kmeans` 和显式 seed。
2. 最多抽样 1000 篇，从最小允许 K 开始增加 K；当相对 WCSS 改善首次低于 8% 时选择前一个 K，否则选择上限。所用阈值、seed 和结果进入 profile version。
3. 提供最近质心分配函数供增量更新。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- profileClustering clusterCount
```

**提交**

```text
Build deterministic interest clusters
```

### Task 11：画像命名、质量和稳定 lineage

**新增文件**

- `zotero-plugin/src/domain/profiles/profileNaming.ts`
- `zotero-plugin/src/domain/profiles/profileMetrics.ts`
- `zotero-plugin/src/domain/profiles/profileLineage.ts`
- `zotero-plugin/test/unit/profiles/profileNaming.test.ts`
- `zotero-plugin/test/unit/profiles/profileMetrics.test.ts`
- `zotero-plugin/test/unit/profiles/profileLineage.test.ts`

**测试先行**

1. 通用词 `performance`、`collections` 不得主导名称。
2. 固定夹具生成可读领域名和代表论文。
3. lineage 匹配严格使用 `0.7 × Jaccard + 0.3 × cosine`，阈值 0.60。
4. 人工锁定名称跨版本保留。
5. 成员数、组内相似度、版本重合率和主要收藏夹占比可重算。

**实现**

1. 确定性短语提取、停用词和领域规范词映射。
2. 同类型画像做按分数降序的一对一 lineage 匹配。
3. 系统结果和人工 overlay 分开输出。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- profileNaming profileMetrics profileLineage
```

**提交**

```text
Stabilize profile names and lineage
```

### Task 12：近期/长期画像编排和原子版本

**新增文件**

- `zotero-plugin/src/domain/profiles/profileBuilder.ts`
- `zotero-plugin/src/domain/profiles/recentInterest.ts`
- `zotero-plugin/src/infrastructure/storage/profileRepository.ts`
- `zotero-plugin/test/unit/profiles/profileBuilder.test.ts`
- `zotero-plugin/test/zotero/profileRepository.test.ts`

**测试先行**

1. 近期窗口为 90 天，半衰期 30 天；长期画像使用全部有效语料。
2. 保存反馈进入近期兴趣，无操作和稍后不进入。
3. 变化超过 10%、完整重建超过 30 天、成员变化超过 20% 或质心距离超过 0.15 时完整重建。
4. 构建失败只留下 draft，published 版本不变。
5. 只保留最近 20 个版本，受回滚保护的版本不删除。

**实现**

1. `ProfileBuilder` 编排语料、Embedding、聚类、命名、lineage 和指标。
2. 完整成功后在单事务中发布 profile version。
3. 记录构建原因、配置、模型世代、语料指纹和耗时。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- profileBuilder recentInterest
npm --prefix zotero-plugin run test:zotero -- profileRepository
```

**提交**

```text
Build versioned recent and long-term profiles
```

### Task 13：画像查看、编辑、合并、拆分和回滚

**新增文件**

- `zotero-plugin/src/domain/profiles/profileEditor.ts`
- `zotero-plugin/src/infrastructure/storage/profileOverlayRepository.ts`
- `zotero-plugin/src/ui/profiles/profileEditorView.ts`
- `zotero-plugin/src/ui/profiles/profileEditor.css`
- `zotero-plugin/src/infrastructure/zotero/profileItemMenu.ts`
- `zotero-plugin/test/unit/profiles/profileEditor.test.ts`
- `zotero-plugin/test/zotero/profileEditorView.test.ts`
- `zotero-plugin/test/zotero/profileItemMenu.test.ts`

**测试先行**

1. 改名、关键词、权重、置顶、停用和锁定写入 overlay，不改系统版本。
2. 合并和拆分先生成预览，确认后才创建新 overlay 版本。
3. 回滚恢复旧系统版本，同时保留用户选择是否恢复 overlay。
4. 画像选择器不显示停用画像。
5. 符合语料条件的 Zotero 条目右键菜单可加入或排除画像；不符合条件时命令隐藏或禁用。
6. 右键操作只写 overlay，缺失向量标记待处理，不立即访问模型。

**实现**

1. UI 展示成员、质量、稳定度、主要收藏夹和代表论文。
2. 合并、拆分和回滚都记录审计原因。
3. 人工画像至少需要名称以及关键词或代表论文之一。
4. 参考本地模板的原生 item menu 注册与清理模式，提供“加入兴趣画像”和“从兴趣画像排除”。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- profileEditor
npm --prefix zotero-plugin run test:zotero -- profileEditorView profileItemMenu
```

**提交**

```text
Add editable versioned profiles
```

**Stage 2 门禁**

- 真实 Zotero 库首次画像可显示进度、取消和继续。
- 无变更再次构建时 Zotero 论文 Embedding 请求数为 0。
- 更换模型产生新世代，旧画像可回滚。
- 当前截图中的重复 Document AI 主题经固定夹具不再无依据重复。

## 5. Stage 3：arXiv 推荐工作台

### Task 14：arXiv 查询、规范化和限流

**新增文件**

- `zotero-plugin/src/infrastructure/arxiv/arxivClient.ts`
- `zotero-plugin/src/infrastructure/arxiv/atomParser.ts`
- `zotero-plugin/src/domain/candidates/dateWindow.ts`
- `zotero-plugin/test/unit/arxiv/atomParser.test.ts`
- `zotero-plugin/test/unit/candidates/dateWindow.test.ts`
- `zotero-plugin/test/integration/arxivClient.test.ts`
- `zotero-plugin/test/support/mockHttpServer.ts`

**修改文件**

- `zotero-plugin/package.json`，首次增加 `test:integration` 脚本

**测试先行**

1. 解析正常、空、缺字段和多版本 Atom 响应。
2. 首次回看 3 天；以后从上次成功时间继续，自动回看最多 7 天；手动可选 14 天。
3. 429、5xx 和超时遵守退避与取消。
4. 部分批次失败不更新 last-success 时间。

**实现**

1. 默认分类 `cs.CV`、`cs.CL`，设置可修改。
2. 选择性移植本地模板 `src/modules/arxiv.ts` 的现代/legacy arXiv ID、版本、DOI 和 URL 解析，并用本插件命名空间改写；规范化标题、作者、摘要和日期。
3. 记录请求批次、节流、状态码和服务耗时。
4. `test:integration` 使用 Node 原生测试运行器；测试进程内启动随机本机端口的 mock server，结束时强制关闭。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- atomParser dateWindow
npm --prefix zotero-plugin run test:integration -- arxivClient
```

**提交**

```text
Fetch arXiv candidates reliably
```

### Task 15：候选去重、抑制和 BM25 预筛

**新增文件**

- `zotero-plugin/src/domain/candidates/normalization.ts`
- `zotero-plugin/src/domain/candidates/duplicateFilter.ts`
- `zotero-plugin/src/domain/candidates/candidatePrefilter.ts`
- `zotero-plugin/src/infrastructure/storage/candidateRepository.ts`
- `zotero-plugin/test/unit/candidates/duplicateFilter.test.ts`
- `zotero-plugin/test/unit/candidates/candidatePrefilter.test.ts`

**测试先行**

1. arXiv ID、DOI、URL、标题年份四层去重顺序正确。
2. 已保存和明确拒绝永久抑制；“稍后”只抑制 7 天；无操作不抑制。
3. 不超过 1000 篇时不做词法裁剪。
4. 超过 1000 篇时保留 BM25 前 800 和固定种子的 200 探索样本。
5. 候选向量按 14 天/256 MiB 做 LRU 清理。

**实现**

1. 使用 MiniSearch 对标题和摘要建立一次性 BM25 索引。
2. 用户关键词权重大于系统关键词，保留筛选解释。
3. 存储候选规范化键和抑制原因。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- candidates
```

**提交**

```text
Filter and cache arXiv candidates
```

### Task 16：六特征打分

**新增文件**

- `zotero-plugin/src/domain/ranking/features.ts`
- `zotero-plugin/src/domain/ranking/defaultWeights.ts`
- `zotero-plugin/src/domain/ranking/relevanceScorer.ts`
- `zotero-plugin/test/unit/ranking/features.test.ts`
- `zotero-plugin/test/unit/ranking/relevanceScorer.test.ts`

**测试先行**

1. 默认权重为 0.35、0.25、0.20、0.10、0.10、-0.25。
2. 全部画像取最佳匹配；指定画像只在选中集合计算。
3. 代表论文只取命中画像前三篇。
4. 只有“主题不相关”进入负相似度，且按反馈时间衰减。
5. 每个特征和最终 raw score 可单独重算。

**实现**

1. 领域层输出完整 `ScoreBreakdown`，不生成自然语言猜测。
2. 人工权重和置顶增益有上限，不能直接绕过语义相关度。
3. 冻结一个 TypeScript 当前算法实现，用夹具验证与提交 `7d54812` 的 Python 排名一致，供影子评估使用。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- ranking/features ranking/relevanceScorer
```

**提交**

```text
Score candidates with explainable features
```

### Task 17：多样性重排和相对分

**新增文件**

- `zotero-plugin/src/domain/ranking/diversityReranker.ts`
- `zotero-plugin/src/domain/ranking/displayScore.ts`
- `zotero-plugin/test/unit/ranking/diversityReranker.test.ts`
- `zotero-plugin/test/unit/ranking/displayScore.test.ts`

**测试先行**

1. 重排使用 `raw - 0.12 × maxSelectedSimilarity`。
2. `N >= 5` 时单画像默认不超过 60%。
3. 其他画像最佳候选低于不受限候选 85% 时允许突破配额。
4. 5%/95% 分位裁剪映射到 0 到 100，单候选和同分候选有稳定结果。
5. 保留 raw、MMR 扣分、配额调整和最终排序。

**实现**

1. 重排函数保持纯函数和确定性 tie-breaker。
2. tie-breaker 依次使用 raw score、提交时间、arXiv ID。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- diversityReranker displayScore
```

**提交**

```text
Diversify and normalize recommendation scores
```

### Task 18：持久运行协调器、检查点和任务中心

**新增文件**

- `zotero-plugin/src/application/runCoordinator.ts`
- `zotero-plugin/src/application/recommendationService.ts`
- `zotero-plugin/src/application/operationTaskService.ts`
- `zotero-plugin/src/infrastructure/storage/recommendationRepository.ts`
- `zotero-plugin/src/infrastructure/storage/operationTaskRepository.ts`
- `zotero-plugin/src/ui/tasks/taskCenterController.ts`
- `zotero-plugin/test/unit/application/runCoordinator.test.ts`
- `zotero-plugin/test/unit/application/recommendationService.test.ts`
- `zotero-plugin/test/unit/application/operationTaskService.test.ts`
- `zotero-plugin/test/zotero/taskCenter.test.ts`

**测试先行**

1. 同时只运行一个画像/推荐任务。
2. 阶段顺序为语料检查、画像、arXiv、候选 Embedding、打分、重排、可选摘要。
3. 任一阶段取消后保留已提交检查点。
4. 新候选 Embedding 不完整时不发布半成品排名。
5. arXiv 失败保留上次结果和时间。
6. Zotero 启动时把遗留 `running` 任务转为 `interrupted`，不会自动调用 arXiv、Embedding 或 LLM。
7. 只有用户点击继续才从最后检查点恢复；失败可重试，取消不删除已提交数据。
8. 推荐、画像、摘要、入库和附件使用统一任务投影，筛选和状态按钮符合各自状态。

**实现**

1. 所有阶段上报状态、完成量、缓存命中和耗时。
2. recommendation run 完整成功后原子发布。
3. 每个运行记录目标画像、数量、日期、分类、模型和画像版本。
4. 任务中心订阅 task repository，显示用户事件和脱敏错误；不轮询网络。
5. 复用本地模板任务订阅、清理和操作按钮的模式，但不复用其 JSON TaskStore 和自动恢复行为。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- runCoordinator recommendationService operationTaskService
npm --prefix zotero-plugin run test:zotero -- taskCenter
```

**提交**

```text
Coordinate user-resumable tasks and runs
```

### Task 19：推荐工作台交互和解释

**新增文件**

- `zotero-plugin/src/ui/recommendations/toolbar.ts`
- `zotero-plugin/src/ui/recommendations/recommendationList.ts`
- `zotero-plugin/src/ui/recommendations/recommendationCard.ts`
- `zotero-plugin/src/ui/recommendations/scoreDetails.ts`
- `zotero-plugin/test/zotero/recommendationWorkspace.test.ts`

**测试先行**

1. 数量限制 1 到 30，默认 5。
2. 画像选择支持全部、单个和多个，不包含停用画像。
3. 每张卡显示原文摘要、命中画像、代表论文、关键词、六项分数和版本。
4. 缓存存在时页签 1 秒内可交互，网络状态异步更新。
5. 长标题、长作者和窄窗口不遮挡操作按钮。

**实现**

1. 使用紧凑列表，不嵌套卡片，不使用装饰性渐变。
2. 刷新、取消、设置和诊断优先使用 Zotero 原生图标及 tooltip；缺少图标时使用项目自有静态资源。
3. 解释从 `ScoreBreakdown` 确定性渲染。

**验证**

```bash
npm --prefix zotero-plugin run test:zotero -- recommendationWorkspace
```

在 1280×800 和 1920×1080 进行截图检查。

**提交**

```text
Render explainable recommendation workspace
```

### Task 20：可选 LLM 中文摘要

**新增文件**

- `zotero-plugin/src/application/summaryService.ts`
- `zotero-plugin/src/domain/summaries/summaryPrompt.ts`
- `zotero-plugin/src/infrastructure/storage/summaryRepository.ts`
- `zotero-plugin/test/unit/summaries/summaryService.test.ts`
- `zotero-plugin/test/zotero/summaryToggle.test.ts`

**测试先行**

1. LLM 关闭时调用次数为 0，UI 显示 arXiv 原文摘要。
2. 开启时只发送最终 Top N 的标题和摘要。
3. 输出固定为研究问题、主要方法、摘要报告结果三个中文部分。
4. 超时、空内容和错误响应回退原文，不改变排序。
5. 缓存键包含 arXiv version、模型、Prompt 版本和语言。

**实现**

1. 设置页开关默认关闭。
2. 卡片标记“AI 中文摘要”，始终提供原文切换。
3. 摘要任务可独立重试，不重新运行推荐。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- summaries
npm --prefix zotero-plugin run test:zotero -- summaryToggle
```

**提交**

```text
Add optional Chinese LLM summaries
```

**Stage 3 门禁**

- 用固定候选池重跑得到相同排序和解释。
- 对 1000 个缓存向量候选、12 个画像的本地打分和重排在当前 Mac 不超过 2 秒。
- LLM 关闭时无 Chat 请求；开启后只请求 Top N。
- arXiv、Embedding、LLM 故障降级符合规格。

## 6. Stage 4：入库、归类与反馈闭环

### Task 21：反馈事件和三类操作

**新增文件**

- `zotero-plugin/src/domain/feedback/feedbackPolicy.ts`
- `zotero-plugin/src/infrastructure/storage/feedbackRepository.ts`
- `zotero-plugin/src/ui/recommendations/feedbackActions.ts`
- `zotero-plugin/test/unit/feedback/feedbackPolicy.test.ts`
- `zotero-plugin/test/zotero/feedbackActions.test.ts`

**测试先行**

1. 保存为强正反馈，稍后为中性，无操作不写事件。
2. 只有“主题不相关”生成语义负反馈。
3. “已读过”和“重复”只抑制论文。
4. 同一运行/论文/动作的幂等键阻止重复训练样本。
5. “稍后”7 天后重新符合候选资格。

**实现**

1. 不感兴趣弹出三个明确原因，默认不预选。
2. 事件记录 run、paper、profile、score、model、time 和最终 collection。
3. UI 操作立即更新本地状态，失败时可恢复。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- feedback
npm --prefix zotero-plugin run test:zotero -- feedbackActions
```

**提交**

```text
Capture explicit recommendation feedback
```

### Task 22：收藏夹建议和用户修正

**新增文件**

- `zotero-plugin/src/domain/importing/collectionClassifier.ts`
- `zotero-plugin/src/infrastructure/zotero/collectionWriter.ts`
- `zotero-plugin/test/unit/importing/collectionClassifier.test.ts`
- `zotero-plugin/test/zotero/collectionWriter.test.ts`

**测试先行**

1. 对最相似 20 个成员加权投票，代表论文权重乘 2。
2. 用户修正按 180 天半衰期参与投票。
3. 第一名至少 55% 且领先 15 个百分点才给出具体收藏夹。
4. 低置信度返回“待分类”；只创建一次该收藏夹。
5. 对已有条目只增加收藏夹，不删除原收藏夹。

**实现**

1. 返回建议、第一名占比、领先值和投票依据。
2. 保存对话框允许用户覆盖建议。
3. 最终选择写入反馈事件供后续分类。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- collectionClassifier
npm --prefix zotero-plugin run test:zotero -- collectionWriter
```

**提交**

```text
Suggest and learn Zotero collections
```

### Task 23：四级重复检测

**新增文件**

- `zotero-plugin/src/domain/importing/bibliographicNormalization.ts`
- `zotero-plugin/src/infrastructure/zotero/duplicateDetector.ts`
- `zotero-plugin/test/unit/importing/bibliographicNormalization.test.ts`
- `zotero-plugin/test/zotero/duplicateDetector.test.ts`

**测试先行**

1. arXiv ID、DOI、URL、标题年份按固定优先级匹配。
2. 大小写、标点、`v2` 版本后缀和 DOI URL 形式规范化正确。
3. 同标题不同年份不误合并。
4. 多个弱匹配时不自动选择，返回冲突让用户确认。

**实现**

1. 先查结构化标识，再做标题年份。
2. 返回 match kind、item key 和解释。
3. 保存预览和真正写入前各执行一次。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- bibliographicNormalization
npm --prefix zotero-plugin run test:zotero -- duplicateDetector
```

**提交**

```text
Detect duplicate Zotero papers
```

### Task 24：幂等元数据入库状态机

**新增文件**

- `zotero-plugin/src/domain/importing/importStateMachine.ts`
- `zotero-plugin/src/application/importService.ts`
- `zotero-plugin/src/infrastructure/zotero/itemWriter.ts`
- `zotero-plugin/src/infrastructure/storage/importTaskRepository.ts`
- `zotero-plugin/test/unit/importing/importStateMachine.test.ts`
- `zotero-plugin/test/zotero/itemWriter.test.ts`

**测试先行**

1. 核心状态严格经过查重、元数据、归类、反馈、完成。
2. 已存在条目被复用并补收藏夹，不新建。
3. 使用已校验 arXiv 元数据直接创建 `preprint`，字段映射稳定且不调用网页 Translator。
4. 任何阶段中断后从最后检查点继续。
5. 同一论文连续执行 10 次只产生一个父条目和一个训练正样本。
6. 已有符合 arXiv ID 或规范文件名的 PDF 子附件时识别并复用，不再下载第二份。

**实现**

1. 稳定任务 ID 由 paper identity 和用户意图生成。
2. 核心状态和附件状态分开持久化。
3. 只有核心元数据成功后才记录保存反馈。
4. 选择性移植本地模板 `metadata.ts` 的作者、日期和 `preprint` 字段映射，通过 Zotero Item API 直接建项，并补齐 archive/repository/arXiv ID 规则。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- importStateMachine
npm --prefix zotero-plugin run test:zotero -- itemWriter
```

**提交**

```text
Import Zotero metadata idempotently
```

### Task 25：PDF 子附件下载和独立重试

**新增文件**

- `zotero-plugin/src/domain/importing/pdfPolicy.ts`
- `zotero-plugin/src/infrastructure/zotero/pdfAttacher.ts`
- `zotero-plugin/src/ui/importing/importProgress.ts`
- `zotero-plugin/test/unit/importing/pdfPolicy.test.ts`
- `zotero-plugin/test/integration/pdfDownload.test.ts`
- `zotero-plugin/test/zotero/pdfAttacher.test.ts`

**测试先行**

1. 只接受 HTTPS，localhost 例外不适用于远端 PDF。
2. 验证状态码、Content-Type、`%PDF-` 文件头和 100 MiB 默认上限。
3. 错误类型、重定向、超限和取消不创建损坏附件。
4. PDF 失败后父条目、收藏夹和正反馈仍存在。
5. 仅重试附件不会再次创建父条目或反馈。

**实现**

1. 使用流式下载和进度回调。
2. 选择性移植本地模板 `pdf.ts` 和 `resultImporter.ts` 的文件签名、临时写入、附件导入、重复附件检查和清理模式。
3. 在模板校验之上增加 HTTPS、状态码、Content-Type、重定向目标和大小上限检查，验证成功后通过 Zotero attachment API 导入。
4. 失败和取消时清理临时文件。
5. UI 展示 `completed_with_attachment_error` 和重试命令。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- pdfPolicy
npm --prefix zotero-plugin run test:integration -- pdfDownload
npm --prefix zotero-plugin run test:zotero -- pdfAttacher
```

**提交**

```text
Attach PDFs with independent retries
```

### Task 26：受约束反馈权重学习

**新增文件**

- `zotero-plugin/src/domain/feedback/logisticWeightLearner.ts`
- `zotero-plugin/src/domain/feedback/weightConstraints.ts`
- `zotero-plugin/src/domain/feedback/feedbackReplayEvaluator.ts`
- `zotero-plugin/src/infrastructure/storage/weightRepository.ts`
- `zotero-plugin/src/ui/diagnostics/weightHistory.ts`
- `zotero-plugin/test/unit/feedback/logisticWeightLearner.test.ts`
- `zotero-plugin/test/unit/feedback/weightConstraints.test.ts`
- `zotero-plugin/test/unit/feedback/feedbackReplayEvaluator.test.ts`

**测试先行**

1. 少于 20 个事件或任一类别少于 5 个时不训练。
2. 稍后、无操作、已读和重复不进入训练集。
3. 正向权重非负、总和 1；负权重在 -0.40 到 -0.10。
4. 单次发布每项最多变化 0.03，长期不超过默认值上下 0.10。
5. 按事件时间切分的反馈回放指标变差时不发布；发布后可回滚。

**实现**

1. 对六个已展示特征训练带 L2 的逻辑回归。
2. 每新增 10 个有效事件最多创建一个候选版本。
3. 用历史事件的时间顺序回放比较当前和候选权重；Stage 5 再用完整 arXiv 时间回放做最终验证。
4. 保存样本计数、系数变化、离线指标和发布原因。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- logisticWeightLearner weightConstraints feedbackReplayEvaluator
```

**提交**

```text
Learn bounded ranking weights from feedback
```

**Stage 4 门禁**

- 10 次重复保存测试只产生 1 个父条目和 1 个训练正样本。
- 收藏夹低置信度进入“待分类”，修正能影响后续建议。
- PDF 失败和重试不破坏核心入库。
- 不同拒绝原因严格执行不同学习语义。

## 7. Stage 5：诊断、评估与发布

### Task 27：诊断、隐私审计和脱敏导出

**新增文件**

- `zotero-plugin/src/infrastructure/diagnostics/runLogger.ts`
- `zotero-plugin/src/infrastructure/diagnostics/redactor.ts`
- `zotero-plugin/src/ui/diagnostics/diagnosticsView.ts`
- `zotero-plugin/test/unit/diagnostics/redactor.test.ts`
- `zotero-plugin/test/zotero/diagnosticsView.test.ts`

**测试先行**

1. 导出包含阶段耗时、批次、缓存、模型指纹、画像版本和错误码。
2. Key、Authorization、标题、摘要、笔记、路径和收藏夹名称默认被移除。
3. 用户勾选样例内容前必须二次确认。
4. 推荐分数可从导出记录重算。
5. 任务状态迁移、检查点和用户触发的继续/重试可追踪，启动自动续跑次数必须为 0。

**实现**

1. 用户事件和调试详情分级展示。
2. 所有错误在写日志前统一通过 redactor。
3. 提供清理缓存、重建可推导数据和恢复备份入口。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- redactor
npm --prefix zotero-plugin run test:zotero -- diagnosticsView
```

**提交**

```text
Add sanitized recommendation diagnostics
```

### Task 28：历史时间回放和基线比较

**新增文件**

- `zotero-plugin/src/evaluation/timeReplay.ts`
- `zotero-plugin/src/evaluation/metrics.ts`
- `zotero-plugin/src/evaluation/baselines.ts`
- `zotero-plugin/src/evaluation/report.ts`
- `zotero-plugin/src/evaluation/cli.ts`
- `zotero-plugin/test/unit/evaluation/metrics.test.ts`
- `zotero-plugin/test/unit/evaluation/timeReplay.test.ts`

**修改文件**

- `zotero-plugin/package.json`，增加 `evaluate` 脚本

**测试先行**

1. 未来 Zotero 条目和反馈不能进入过去截点画像。
2. Recall、MRR、nDCG、画像覆盖和列表内相似度与手算夹具一致。
3. 至少 5 个截点；少于 20 个正例时报告证据不足。
4. 比较单质心弱基线、提交 `7d54812` 等价基线和新版。
5. 只有新版相对更强基线满足规格门槛时报告通过。

**实现**

1. 通过 arXiv ID、DOI 和标题年份匹配历史正例。
2. 输出 JSON 和 Markdown 报告，记录数据范围和排除原因。
3. 不把评估工具打进生产插件入口。
4. `evaluate` 脚本只调用 `src/evaluation/cli.ts`，要求显式输出目录，不写插件数据库。

**验证**

```bash
npm --prefix zotero-plugin run test:unit -- evaluation
npm --prefix zotero-plugin run evaluate -- --fixtures test/fixtures/replay
```

**提交**

```text
Evaluate recommendations with time replay
```

### Task 29：故障注入和性能门禁

**新增文件**

- `zotero-plugin/test/integration/failureMatrix.test.ts`
- `zotero-plugin/test/performance/ranking.bench.ts`
- `zotero-plugin/test/performance/cachedWorkspace.bench.ts`
- `zotero-plugin/test/performance/run.ts`
- `zotero-plugin/test/fixtures/failures/`

**修改文件**

- `zotero-plugin/package.json`，增加 `test:performance` 脚本

**测试先行**

1. 注入 arXiv、Embedding、LLM、PDF、数据库每类故障。
2. 检查已发布画像、已保存条目、反馈和检查点未损坏。
3. 1000 候选/12 画像本地排序在当前 Mac 小于 2 秒。
4. 已缓存工作台首屏小于 1 秒。
5. 无变更全库运行的 Zotero 论文 Embedding 请求数为 0。

**实现**

1. 增加独立 benchmark 脚本，网络耗时不计入本地指标。
2. 在报告中保存设备、Zotero、Node、模型维数和样本规模。
3. `test:performance` 调用 `test/performance/run.ts`，任一门槛失败时返回非零退出码。

**验证**

```bash
npm --prefix zotero-plugin run test:integration -- failureMatrix
npm --prefix zotero-plugin run test:performance
```

**提交**

```text
Enforce failure and performance gates
```

### Task 30：Zotero 9 跨平台冒烟和发布文档

**新增文件**

- `zotero-plugin/docs/installation.md`
- `zotero-plugin/docs/model-configuration.md`
- `zotero-plugin/docs/privacy.md`
- `zotero-plugin/docs/troubleshooting.md`
- `zotero-plugin/THIRD_PARTY_NOTICES.md`
- `zotero-plugin/test/manual/zotero-9-smoke.md`
- `.github/workflows/plugin-build.yml`

**修改文件**

- `README.md`

**步骤**

1. 在 macOS Zotero 9.0.6 完成安装、启用、禁用、升级、卸载和完整闭环。
2. 在 Windows 和 Linux 的 Zotero 9 最新稳定小版本执行相同清单。
3. 验证关闭 Zotero 后无插件任务运行。
4. 文档明确 Embedding 必需、LLM 可选、发送字段、Key 风险和本地模型配置方式。
5. GitHub Actions 只给维护者构建、测试和产出 XPI；用户不配置 Action。
6. 参考本地模板的 Node 22 CI、XPI artifact 和 tag release 流程，替换 addon ID、产物名和发布清单后再启用。
7. 核对第三方声明与实际复用文件；确认构建产物不包含 `.env`、会话数据、翻译服务代码或参考项目生成文件。
8. 产出 Beta XPI、`update-beta.json` 和校验和。

**验证**

```bash
npm --prefix zotero-plugin run format:check
npm --prefix zotero-plugin run lint
npm --prefix zotero-plugin run typecheck
npm --prefix zotero-plugin run test:unit
npm --prefix zotero-plugin run test:zotero
npm --prefix zotero-plugin run test:integration
npm --prefix zotero-plugin run test:performance
npm --prefix zotero-plugin run build
```

**提交**

```text
Document and package Zotero plugin beta
```

**Stage 5 门禁**

- 规格第 21 节 16 项验收标准逐项留有测试或人工证据。
- 历史正例足够时达到质量门槛；不足时明确标记 Beta 和“证据不足”。
- XPI 在 Zotero 9 三平台完成冒烟。
- 终端用户安装和运行不依赖 Python、SMTP 或 GitHub Actions。

## 8. 里程碑与分支策略

建议每个阶段使用独立分支并合并回插件主开发分支：

```text
codex/zotero-plugin-stage1-foundation
codex/zotero-plugin-stage2-profiles
codex/zotero-plugin-stage3-recommendations
codex/zotero-plugin-stage4-feedback-import
codex/zotero-plugin-stage5-release
```

每个阶段的最后一个提交只处理门禁修复，不混入下一阶段功能。阶段 PR 必须附：

- 自动测试结果。
- Zotero 版本和平台。
- 截图或录屏。
- 数据库迁移版本。
- 隐私字段检查结果。
- 已知限制，不能使用模糊的“后续优化”掩盖未通过门禁。

## 9. 第一执行点

规格和本计划确认后，从 Task 1 开始。Stage 1 完成前不实现聚类、推荐或入库业务；先证明 Zotero 9.0.6 的插件生命周期、独立页签、独立数据库、设置和测试链路全部可靠。
