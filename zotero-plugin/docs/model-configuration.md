# 模型配置

## 必需与可选

Embedding 是画像和推荐的必需模型；插件不内置模型，也不会在后台下载模型。LLM 是可选的，只负责把候选论文摘要处理成中文，不参与必需的画像构建。

插件使用 OpenAI-compatible HTTP 接口：

| 设置                      | 请求路径                      | 作用                             |
| ------------------------- | ----------------------------- | -------------------------------- |
| Embedding Base URL / 模型 | `<Base URL>/embeddings`       | 发送标题和摘要，返回等维向量     |
| LLM Base URL / 模型       | `<Base URL>/chat/completions` | 发送候选标题和摘要，返回中文摘要 |

Base URL 通常填写到 `/v1`，不要重复填写具体请求路径。服务端必须返回标准 `data[].embedding` 或
`choices[0].message.content` 结构。

## 火山方舟

设置页中的 Embedding 和 LLM 提供商可以分别选择“火山方舟普通 API”或“火山方舟
Coding Plan”。插件当前只发送论文标题和摘要文本，使用文本 Embedding；不会调用方舟
多模态 Embedding，也不会上传 PDF、图片或笔记。

| 用途            | Provider             | Base URL                                          | 模型填写方式                       |
| --------------- | -------------------- | ------------------------------------------------- | ---------------------------------- |
| Embedding / LLM | 火山方舟普通 API     | `https://ark.cn-beijing.volces.com/api/v3`        | Model ID 或 `ep-...` 推理接入点 ID |
| Embedding / LLM | 火山方舟 Coding Plan | `https://ark.cn-beijing.volces.com/api/coding/v3` | 填写套餐支持的模型名或 Endpoint ID |

配置步骤：

1. 在[火山方舟控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/apikey)
   创建或复制 API Key。不要把 Key 写入代码、截图、诊断导出或 Git。
2. 在 Zotero 设置中分别选择 Embedding 和 LLM 的 Provider。LLM 可以保持关闭。
3. 填写控制台显示的实际 Model ID；当前实例示例为 `doubao-embedding-text-240715`，该模型的
   向量维度为 2560。普通方舟也可以填写控制台创建的 `ep-...` 推理接入点 ID，优先使用控制台
   可复制的精确值，不要只填写模型的展示名称。
4. 点击“测试连接”。Embedding 测试会显示实际模型、向量维数和耗时；LLM 开启时会额外
   测试 Chat Completions。
5. 首次确认或切换 Embedding Provider 后，插件会创建新的向量 generation，并按缓存状态
   增量计算画像。旧 generation 不会与新模型混用。

普通方舟的文本向量化请求使用 `/embeddings`，对话请求使用 `/chat/completions`。官方参数和
返回结构参见[Embeddings API](https://api.volcengine.com/api-docs/view?action=Embeddings&serviceCode=ark&version=2024-01-01)
和[ChatCompletions API](https://api.volcengine.com/api-docs/view?action=ChatCompletions&serviceCode=ark&version=2024-01-01)。
Coding Plan 的 Embedding 配置可参考[方舟 Coding Plan Embedding 指南](https://developer.volcengine.com/articles/7628812787703087110)。

### 方舟常见问题

- `401` 或 `403`：检查 API Key、模型权限、Endpoint 状态和 Coding Plan 是否已开通。
- `404`：先检查是否把普通 API 地址和 Coding Plan 地址混用了；再确认模型已在当前方舟账号和区域开通。
  普通方舟如果要求推理接入点，请使用控制台创建的 `ep-...` Endpoint ID，并确保 API Key
  属于同一账号。测试提示会同时显示当前 Provider、模型和请求地址，便于核对。
- `429`：服务限流。插件会保留检查点，稍后可以在任务中心重试或继续。
- 向量维数错误：确认当前模型是文本 Embedding，并重新测试连接；切换维数会创建新的
  generation。
- 自建代理或其他兼容服务：请选择“自定义 OpenAI-compatible”，不要把代理地址填在方舟
  Provider 下。

## 硅基流动

硅基流动的 Embedding 和 LLM 可以分别配置，也可以同时使用。设置页选择“硅基流动”后，
默认地址为 `https://api.siliconflow.cn/v1`，插件会自动调用：

| 用途      | 请求地址                                         | 认证方式                        |
| --------- | ------------------------------------------------ | ------------------------------- |
| Embedding | `https://api.siliconflow.cn/v1/embeddings`       | `Authorization: Bearer API_KEY` |
| LLM       | `https://api.siliconflow.cn/v1/chat/completions` | `Authorization: Bearer API_KEY` |

推荐先使用 `BAAI/bge-m3` 作为 Embedding，使用 `Qwen/Qwen3-8B` 作为中文摘要 LLM。两者都只是
预设值，右侧模型 ID 输入框可以改为硅基流动控制台中实际可用的模型，例如
`Qwen/Qwen3-Embedding-0.6B`。不要填写模型展示名称；应复制控制台模型列表中的精确 ID。

配置步骤：

1. 在[硅基流动 API Key 页面](https://cloud.siliconflow.cn/account/ak)创建或复制账户 API Key。
2. 在 Zotero 设置中分别选择 Embedding 和 LLM 的“硅基流动”供应商。
3. 填写同一账户 API Key，并从模型列表复制实际可用的模型 ID；LLM 关闭时不会调用 LLM。
4. 点击“测试连接”。Embedding 测试会显示向量维度，LLM 开启时会额外测试中文摘要。

接口细节参见[硅基流动 Embeddings 文档](https://api-docs.siliconflow.cn/docs/api/embeddings-post)
和[Chat Completions 文档](https://api-docs.siliconflow.cn/docs/api/chat-completions-post)。

## 云端模型

使用云端服务时填写 HTTPS Base URL、模型名和 API Key，点击“测试连接”确认 Embedding 维数；如果启用了 LLM，还会额外测试中文摘要。API Key 只保存在本机 Zotero 偏好设置中，不要写入仓库、截图、诊断导出或 issue。

## 本地模型

可使用本机提供 OpenAI-compatible API 的服务，例如将 Embedding Base URL 指向
`http://127.0.0.1:11434/v1`，再填写服务中实际存在的 Embedding 模型。出于安全原因，HTTP 只允许回环地址，并且必须在设置中明确勾选“允许本机 HTTP”；远程 HTTP 会被拒绝。

本地模型的模型大小、内存和速度由用户选择的服务决定。插件只校验返回向量，不假设 GPU，也不负责启动或停止本地服务。模型更换、向量维数变化或输入内容变化会使缓存失效并创建新的 Embedding generation。

## 失败排查

1. 先确认 Base URL 能从本机访问，再确认模型名和 API Key 权限。
2. 确认 Embedding 返回的向量数量等于输入数量，且每个向量维数一致、数值有限。
3. 若只需要原文摘要，关闭 LLM；关闭后不会调用 LLM 网络接口。
4. 设置页显示稳定错误码和脱敏 URL；不要把原始请求头或 Key 发给维护者。
