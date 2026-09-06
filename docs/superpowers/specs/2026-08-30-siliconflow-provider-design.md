# 硅基流动模型供应商设计

## 目标

在 Zotero arXiv Daily 插件中新增“硅基流动”模型供应商，同时支持：

- Embedding：用于兴趣画像、候选论文向量化和相似度推荐。
- LLM：用于可选的中文论文摘要处理。
- 常用模型预设与自由编辑模型 ID 并存，适应模型上下线和用户自有模型权限。

本次仅扩展插件端的供应商配置，不改变画像、推荐排序、缓存或 Zotero 数据结构。

## 已确认的接口约定

硅基流动使用 OpenAI-compatible API：

- 基础地址：`https://api.siliconflow.cn/v1`
- Embedding：`POST /embeddings`
- LLM：`POST /chat/completions`
- 鉴权：`Authorization: Bearer <API_KEY>`
- Embedding 的请求字段为 `model` 和 `input`，返回顶层 `model` 与 `data[].embedding`。
- LLM 的请求字段为 `model` 和 `messages`，返回 `choices[0].message.content`。

当前插件客户端已经实现以上 OpenAI-compatible 请求和响应解析，因此不新增专用网络客户端。

## 方案

### 供应商定义

在现有 `ModelProvider` 联合类型中加入 `siliconflow`，并在统一供应商定义表中配置：

- 显示名称：`硅基流动`
- 默认地址：`https://api.siliconflow.cn/v1`
- Embedding 文档链接：用户提供的硅基流动 Embeddings API 文档
- LLM 文档链接：硅基流动 Chat Completions API 文档
- 帮助文本：API Key 使用账户 Key，模型字段填写硅基流动模型 ID

Embedding 和 LLM 供应商配置保持独立。用户可以只使用硅基流动 Embedding，也可以让两者都使用硅基流动。

### 模型预设

预设只用于快速填值，不限制用户输入。模型输入框继续保持可编辑；手动填写的模型 ID 不会被自动覆盖。

Embedding 预设：

1. `BAAI/bge-m3`，作为默认值，适合中英文论文摘要。
2. `Qwen/Qwen3-Embedding-0.6B`
3. `Qwen/Qwen3-Embedding-4B`
4. `BAAI/bge-large-zh-v1.5`

LLM 预设：

1. `Qwen/Qwen3-8B`，作为默认值，用于中文摘要。
2. `Qwen/Qwen2.5-7B-Instruct`
3. `deepseek-ai/DeepSeek-V3.2`

模型列表是建议值而非可用性保证。硅基流动模型可能发生上下线，实际可用模型以账户控制台为准。

### 设置页行为

1. 供应商下拉框同时出现在 Embedding 和 LLM 配置区。
2. 选择“硅基流动”时，若当前地址为空或仍为上一个供应商默认地址，则填充硅基流动地址。
3. 若当前模型为空或仍为上一个供应商的首选模型，则填充硅基流动首选模型。
4. 用户手动编辑过的地址、API Key 和模型 ID 不自动覆盖。
5. “恢复提供商默认值”只重置当前供应商地址和首选模型，不清除 API Key。
6. 测试连接使用当前页面内存中的配置，保存后画像任务使用 Zotero 本地偏好设置中的配置。

### 错误处理

为硅基流动补充针对性提示：

- `401/403`：检查硅基流动 API Key、账户状态和模型权限。
- `404`：检查模型 ID 是否仍可用，确认没有把展示名称误填为模型 ID。
- `429`：提示达到速率或额度限制，建议降低批大小或稍后重试。
- 响应结构错误：提示服务兼容性或模型响应异常。

错误消息只显示脱敏后的 URL、状态码和模型 ID，不显示 API Key 或响应中的敏感字段。

## 测试与验收

### 单元测试

- 供应商定义包含硅基流动，默认地址和两组模型预设正确。
- 硅基流动接受准确的 `https://api.siliconflow.cn/v1` 地址。
- Embedding 客户端发送 `/embeddings`、Bearer 鉴权、`model` 和批量 `input`，并解析向量。
- LLM 客户端发送 `/chat/completions` 并解析中文摘要。
- 供应商切换不会覆盖用户已经编辑的模型 ID。
- 401、403、404、429 能显示对应诊断建议，且不会泄露密钥。

### 构建验收

- 插件 TypeScript 检查和现有测试全部通过。
- 重新生成 XPI，确认设置页中 Embedding 与 LLM 都能选择“硅基流动”。
- 使用模拟响应验证 Embedding 和 LLM 两条路径，不依赖真实 API Key。
- 若本地提供有效硅基流动 Key，再进行一次真实连接测试；Key 不写入仓库、日志或测试输出。

## 不在本次范围内

- 自动调用 `/v1/models` 动态拉取模型列表。
- 自动创建或管理硅基流动 API Key。
- 改造 Embedding 维度、画像版本或推荐算法。
- 在 GitHub Actions 中保存硅基流动密钥。
