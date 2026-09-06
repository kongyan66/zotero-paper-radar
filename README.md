# Zotero Paper Radar

**论文雷达：基于你的 Zotero 文献库和兴趣画像，发现值得阅读的新论文。**

An explainable paper recommendation plugin for Zotero, with editable interest
profiles, AI summaries, and one-click imports.

Zotero Paper Radar 在 Zotero 内检索 arXiv 论文、按兴趣排序并展示推荐理由。
你可以选择感兴趣的论文保存到文献库、确认归类，并通过反馈调整后续推荐。
任务由用户手动启动，日常使用无需配置 GitHub Actions、Python 或邮箱。

## 功能

- **兴趣画像**：根据文献库构建近期与长期兴趣，支持编辑、锁定、停用及结构调整。
- **可控检索**：选择画像、推荐数量、时间范围和 arXiv 分类；支持常用分类多选及自定义分类。
- **推荐解释**：查看匹配画像、关键词、代表论文、相关度及评分组成。
- **可选中文摘要**：开启 LLM 后生成中文摘要；关闭或调用失败时显示原始摘要。
- **保存与反馈**：将论文和 PDF 保存到 Zotero，支持归类、稍后处理及不感兴趣反馈。
- **七天历史**：按推荐日期浏览最近七天的有结果批次，过滤窗口内已推荐的论文。
- **任务诊断**：查看执行时间、检索数量、有效候选、推荐数量及向量缓存复用情况。

## 安装与配置

当前插件支持 **Zotero 9.x**，正在 Beta 阶段。

1. 从 [Releases](https://github.com/kongyan66/zotero-paper-radar/releases)
   下载 `zotero-paper-radar.xpi`。
2. 在 Zotero 的 `工具 > 插件` 中选择“从文件安装插件”，安装后重启。
3. 在 Zotero 设置中的 **Zotero Paper Radar** 页面配置 Embedding 模型并测试连接。
4. 按需要启用 LLM 中文摘要，确认后创建兴趣画像。
5. 打开“今日推荐”，选择检索条件，点击“刷新推荐”。

Embedding 为必需项；LLM 为可选项。支持 OpenAI-compatible 服务、火山方舟、
硅基流动，以及符合接口要求的本机服务。模型调用费用、额度及可用性取决于所选服务。

详细说明：[安装与首次运行](./zotero-plugin/docs/installation.md)。

## 数据与升级

画像、推荐历史和缓存保存在本机。模型处理所需的论文标题、摘要会发送至你配置的
模型服务；API 密钥保存在本机 Zotero 偏好设置中。默认诊断导出不包含 API 密钥和论文正文。

本插件原展示名为 **Zotero arXiv Daily**。本次更名保留原插件 ID、设置键和数据库名称，
新 XPI 将作为同一插件升级，继续使用既有配置、画像和历史数据。

## 已知边界

- 目前论文来源为 arXiv；没有后台自动定时任务。
- 检索无新候选时可能显示上一次有结果的推荐；推荐日列表目前不显示零结果批次。
- “相关度”是排序展示分数，不是论文适合你的概率。
- 模型或 arXiv 服务失败时可在任务中心查看错误并重试。

## 开发

```bash
cd zotero-plugin
npm ci
npm run check
npm run build
```

插件产物位于 `zotero-plugin/.scaffold/build/zotero-paper-radar.xpi`。
Zotero 宿主测试使用独立配置目录：`npm run test:zotero`。
构建与发布工作流为 [plugin-build.yml](./.github/workflows/plugin-build.yml)。

## 项目来源与致谢

本仓库起源于 [TideDra/zotero-arxiv-daily](https://github.com/TideDra/zotero-arxiv-daily)
的 fork，感谢原作者关于“基于 Zotero 文献库发现新论文”的实现与贡献。
Zotero Paper Radar 将这一路径扩展为 Zotero 内可操作的插件工作台。

原邮件工作流及文档保留在仓库中，参见 [邮件版使用说明](./README.legacy.md)。
插件工程基础与其他参考项目列于
[THIRD_PARTY_NOTICES.md](./zotero-plugin/THIRD_PARTY_NOTICES.md)。

本项目为独立社区项目，与 Zotero、arXiv 及模型供应商不存在官方隶属关系。
项目遵循 [AGPLv3 许可证](./LICENSE)，保留原项目许可与署名信息。
