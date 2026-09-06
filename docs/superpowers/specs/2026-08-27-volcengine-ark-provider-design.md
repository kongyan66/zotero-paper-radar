# 火山方舟模型提供商接入设计

## 文档状态

- 日期：2026-08-27
- 状态：设计已逐节确认，等待书面规格复核
- 目标版本：`0.1.0-beta.2`
- 目标环境：Zotero 9，macOS、Windows、Linux

## 1. 背景与结论

Zotero arXiv Daily 当前通过 OpenAI-compatible HTTP 客户端调用必需的 Embedding 服务和可选的 LLM 服务。用户已经可以手工填写第三方 Base URL、API Key 和模型名，但设置页没有提供商概念，普通火山方舟与方舟 Coding Plan 的地址差异、模型 ID、推理接入点 ID 和常见错误都需要用户自行判断。

本设计在现有通用客户端上增加轻量的模型提供商适配层，同时支持：

1. 自定义 OpenAI-compatible 服务。
2. 火山方舟普通 API。
3. 火山方舟 Coding Plan。

Embedding 与 LLM 分别选择提供商、API Key 和模型，可以混合使用。首版只发送论文标题和摘要，使用文本 Embedding；不读取、解析或上传 PDF、图片、笔记和批注，不接入多模态输入。

方舟文本向量化接口使用 `POST /embeddings`，模型参数可为 Model ID 或 `ep-...` 推理接入点 ID；对话接口使用 `POST /chat/completions`。两者都使用 Bearer API Key，响应结构与现有客户端兼容：

- [火山方舟 Embeddings API](https://api.volcengine.com/api-docs/view?action=Embeddings&serviceCode=ark&version=2024-01-01)
- [火山方舟 ChatCompletions API](https://api.volcengine.com/api-docs/view?action=ChatCompletions&serviceCode=ark&version=2024-01-01)
- [火山方舟兼容 OpenAI SDK](https://www.volcengine.com/docs/82379/1330626?lang=zh)

## 2. 目标与非目标

### 2.1 目标

- 用户无需记忆方舟 Base URL 即可完成配置。
- 普通方舟和 Coding Plan 明确分开，避免地址混用。
- Embedding 与 LLM 可使用不同提供商和密钥。
- 提供推荐模型值，同时允许任意模型 ID 或 Endpoint ID。
- 保留现有 OpenAI-compatible 和本地模型配置能力。
- 旧配置升级后不丢失、不被自动改写、不触发网络请求。
- 提供方舟专属连接错误说明，但不泄露 API Key 或论文内容。
- Provider 变化进入模型指纹，防止跨服务复用不兼容向量。

### 2.2 非目标

- 不从方舟账号动态拉取模型或 Endpoint 列表。
- 不引入火山方舟 SDK。
- 不接入方舟知识库、Bot、Responses 或批量 API。
- 不接入 `/embeddings/multimodal`，不上传论文图片或 PDF。
- 不替用户创建方舟账号、开通模型、创建 Endpoint 或购买套餐。
- 不改变画像聚类、推荐排序、反馈学习和 Zotero 入库算法。

## 3. 方案选择

采用“通用模型接口 + Provider 适配层”，不把方舟逻辑散落到设置控制器或推荐流水线中。

未采用的方案：

1. 只增加文档。虽然零代码，但不能降低设置错误率。
2. 只增加 Base URL 预设。改动更小，但无法表达 Provider 身份、专属校验和模型指纹。
3. 引入方舟 SDK。当前只需要两个 OpenAI-compatible HTTP 端点，引入 SDK 会增加插件体积、依赖和升级风险。

## 4. 提供商模型

### 4.1 Provider 标识

定义稳定标识：

```ts
type ModelProvider =
  | "openai-compatible"
  | "volcengine-ark"
  | "volcengine-ark-coding";
```

Provider 只负责配置解释，不改变上层 Embedding 和 Chat 接口。

### 4.2 Provider 元数据

注册表为每个 Provider 提供：

- 用户可见名称。
- 默认 Base URL。
- 支持的能力：Embedding、LLM。
- Embedding 推荐模型值。
- LLM 推荐模型值。
- 模型字段帮助文本。
- 文档链接。
- Provider 专属配置校验和错误提示映射。

首版 Base URL：

| Provider                 | Base URL                                          |
| ------------------------ | ------------------------------------------------- |
| 自定义 OpenAI-compatible | 保留用户当前配置                                  |
| 火山方舟普通 API         | `https://ark.cn-beijing.volces.com/api/v3`        |
| 火山方舟 Coding Plan     | `https://ark.cn-beijing.volces.com/api/coding/v3` |

普通方舟的模型字段允许官方 Model ID 或 `ep-...` Endpoint ID。Coding Plan 允许套餐支持的公开模型名。推荐模型值是可覆盖的输入建议，不是硬编码白名单；模型上下线不会迫使插件发版。

### 4.3 独立配置

`ModelSettings` 增加：

```ts
readonly embeddingProvider: ModelProvider;
readonly llmProvider: ModelProvider;
```

现有 Embedding 和 LLM 的 Base URL、API Key、模型名继续独立保存。Provider 不共享密钥，也不隐式复制密钥。

## 5. 设置页设计

### 5.1 Embedding 区域

按顺序展示：

1. 提供商下拉框。
2. Base URL。
3. API Key。
4. 模型 ID / Endpoint ID。
5. 批大小。
6. “恢复该提供商默认地址”按钮。

选择方舟 Provider 时自动填写其默认地址和推荐模型，但仅在以下任一条件成立时替换当前字段：

- 当前字段为空。
- 当前字段仍等于上一个 Provider 的默认值。
- 用户主动点击“恢复该提供商默认地址”。

不得覆盖用户手工填写的自定义 URL 或模型。

### 5.2 LLM 区域

LLM 继续默认关闭。开启后显示与 Embedding 独立的 Provider、Base URL、API Key 和模型字段。关闭时不构造有效网络任务、不测试 LLM，并显示“推荐页将使用 arXiv 原始摘要”。

### 5.3 帮助与状态

- 方舟 Provider 下显示“模型字段可填写模型 ID 或推理接入点 `ep-...`”。
- Coding Plan 下显示其专属地址提示，避免与普通方舟混用。
- 连接成功显示 Provider、实际模型名、向量维数和耗时。
- 设置页不显示完整 API Key，也不把 Key 拼入状态文本。

## 6. 配置迁移

### 6.1 默认值

新增偏好默认值：

```text
embeddingProvider = openai-compatible
llmProvider = openai-compatible
```

### 6.2 旧用户升级

旧版本没有 Provider 字段。升级后：

- 所有已有 Base URL、API Key、模型名和批大小原样保留。
- Provider 默认为 `openai-compatible`。
- 不根据 URL 猜测并改写 Provider。
- 不清空 `embeddingDimensions`，不触发画像重建或网络请求。

用户主动切换 Provider 并保存后，新的 Provider 才参与模型指纹和后续 generation。

### 6.3 模型指纹

模型指纹输入增加 Provider 标识。相同 Base URL 和模型名但 Provider 不同，也创建不同 generation。API Key 不进入指纹。

## 7. 请求与响应处理

### 7.1 URL 解析

Provider 解析器先规范化 Base URL，再由客户端追加固定路径：

- Embedding：`embeddings`
- LLM：`chat/completions`

继续使用 URL API，不用字符串拼接。Base URL 有无末尾 `/` 的结果必须一致。远程地址必须使用 HTTPS；HTTP 仍只允许用户明确启用的 localhost、`127.0.0.1` 或 `::1`。

### 7.2 Embedding

请求体保持：

```json
{
  "model": "用户配置的模型或 Endpoint ID",
  "input": ["Title: ...\nAbstract: ..."]
}
```

校验：

- 输入非空且批数量不超过插件配置上限 256。
- `data.length` 与输入数量一致。
- 按 `index` 恢复输入顺序。
- 每个向量非空、维度一致且所有数值有限。
- 维数变化沿用现有 generation 隔离逻辑。

### 7.3 LLM

请求继续使用非流式 `chat/completions`，由现有固定提示生成中文摘要。排序不依赖 LLM；空响应、格式错误、超时或权限错误时回退 arXiv 原始摘要。

### 7.4 错误映射

通用网络错误代码保持稳定，UI 根据 Provider 和 HTTP 状态补充建议：

- `401/403`：检查 API Key、模型权限、套餐或 Endpoint 状态。
- `404`：检查普通 API/Coding Plan 地址和模型或 Endpoint ID。
- `429`：请求受限，保留检查点并按现有退避策略重试。
- `400` 且模型相关：检查 Model ID 与 `ep-...` Endpoint ID。
- 返回结构不合法：提示当前模型可能不兼容文本 Embedding 或 Chat Completions。

错误正文继续经过现有脱敏器，API Key、Authorization 头和论文内容不进入日志或诊断导出。

## 8. 数据流

```text
Settings UI
  -> PreferencesRepository
  -> ModelProviderRegistry.resolve(provider, saved fields)
  -> OpenAIEmbeddingClient / OpenAIChatClient
  -> ModelConnectionTester
  -> Profile or Recommendation task
  -> Existing cache, checkpoint, generation and published workspace
```

Provider 逻辑只存在于设置解析和客户端构造边界。画像、排序、反馈和导入模块只依赖既有模型接口，不感知火山方舟。

## 9. 隐私与安全

- API Key 仅保存在本机 Zotero 偏好设置，不写入仓库。
- 不在日志、错误、诊断、推荐解释和模型指纹中保存 API Key。
- 默认只向用户选定的服务发送标题和摘要。
- 不发送 PDF、附件、笔记、批注、文件路径、收藏夹名称和私有标签。
- 用户手动点击连接测试、创建画像或刷新推荐时才发起请求。
- Zotero 启动、设置页打开和 Provider 切换本身不发起网络请求。

## 10. 测试与验收

### 10.1 单元测试

- 三个 Provider 的名称、能力和默认地址。
- Embedding 与 LLM 独立 Provider 解析。
- 用户自定义字段不被 Provider 切换覆盖。
- “恢复默认地址”只修改目标 Provider 的地址。
- Base URL 末尾斜杠的端点解析一致。
- 普通方舟与 Coding Plan 分别调用正确路径。
- Model ID 与 `ep-...` Endpoint ID 都可发送。
- 方舟标准 Embedding 和 Chat 响应可解析。
- 错误映射不包含 API Key、Authorization 或论文输入。
- Provider 参与模型指纹，API Key 不参与。
- LLM 关闭时零请求。

### 10.2 集成测试

- 模拟普通方舟 Embedding + Coding Plan LLM 的混合配置。
- 模拟 Coding Plan Embedding + 自定义 LLM 的混合配置。
- 401、403、404、429、5xx 和非法模型响应不覆盖已发布推荐。
- 切换 Provider 后创建新 generation，旧缓存仍可回滚但不会误命中。

### 10.3 Zotero 宿主测试

- 新 Provider 偏好设置存在且默认兼容旧用户。
- 设置页切换 Provider 后字段和帮助文本正确。
- 保存、重开设置页后配置保持。
- 连接测试显示 Provider、模型、维数和耗时。
- API Key 输入保持密码类型，诊断导出不包含测试密钥。

### 10.4 人工验收

- 在 Zotero 9 使用用户自己的方舟普通 API Key 完成一次 Embedding 连接测试。
- 使用 Coding Plan 完成一次 Embedding 连接测试。
- 在 LLM 开启和关闭状态各完成一次推荐。
- 核对方舟控制台请求量只来自用户主动操作。
- 不把真实 API Key 写入截图、提交、测试夹具或验收文档。

## 11. 文档交付

更新模型配置文档，增加火山方舟教程：

1. 在方舟控制台获取 API Key。
2. 区分普通 API 与 Coding Plan。
3. 选择或创建模型/推理接入点。
4. 在 Zotero 设置页选择对应 Provider。
5. 填写 Key 和模型/Endpoint ID。
6. 点击“测试连接”确认模型、维数和耗时。
7. 说明切换 Provider 会创建新的向量 generation，首次需要重算。
8. 列出 401、403、404、429 和 Base URL 配错的排查方式。

文档只使用占位 Key，不展示任何真实凭据。

## 12. 完成标准

以下条件全部满足后才算实现完成：

1. 三个 Provider 可分别用于 Embedding 和 LLM。
2. 旧设置无损升级，默认行为不变。
3. 普通方舟和 Coding Plan 地址可一键配置且保持可编辑。
4. 模型 ID 和 Endpoint ID 均可通过连接测试。
5. Provider 进入模型指纹，API Key 不进入。
6. 自动化测试、Zotero 宿主测试、性能测试和构建全部通过。
7. 火山方舟接入文档完成并通过脱敏检查。
8. 未配置真实方舟 Key 时不得声称真实云端连接已通过；必须明确记录为待人工验收。
