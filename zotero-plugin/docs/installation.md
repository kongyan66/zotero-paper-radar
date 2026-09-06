# Zotero Paper Radar 安装与首次运行

## 用户安装

插件版面向 Zotero 9，当前最低版本为 9.0。发行页提供
`zotero-paper-radar.xpi` 和 `update-beta.json`；下载 XPI 后，在 Zotero 中打开
`工具 > 插件`，点击齿轮按钮，选择“从文件安装插件”，重启 Zotero。

在 Zotero 设置中打开 `Zotero Paper Radar`，完成配置后进入 `今日推荐`：

1. 填写 Embedding 服务并点击“测试连接”。Embedding 是必需项，测试结果必须包含模型名和向量维数。
2. 选择要排除的收藏夹，确认有效论文数和预计批次。
3. 按需要启用 LLM；关闭时推荐卡片显示 arXiv 原始摘要，开启后显示处理后的中文摘要。
4. 点击“完成设置/重新构建画像”。这一步才会创建首个画像任务。
5. 在“今日推荐”工具栏选择画像、数量、时间范围和 `cs.CV + cs.CL` 分类，然后手动点击“刷新推荐”。

插件只在 Zotero 内由用户点击启动，不要求 Python、SMTP、GitHub Actions 或常驻后台服务。关闭 Zotero 后不会有插件任务继续运行；未完成任务会保留检查点，下一次打开后需在任务中心手动继续或重试。

## 开发构建

```bash
cd zotero-plugin
npm ci
npm run check
npm run build
```

构建产物位于 `.scaffold/build/`，包括 XPI、更新清单和校验和（发布流水线会生成）。开发测试使用独立 Zotero profile，避免污染日常库：

```bash
npm run test:zotero
```

## 升级、禁用和卸载

插件已从 `Zotero arXiv Daily` 更名为 `Zotero Paper Radar`（论文雷达）。
原插件 ID `zotero-arxiv-daily@kongyan66`、设置前缀和数据库名均保留，升级后可继续使用原数据。
新仓库与发行地址为 `kongyan66/zotero-paper-radar`；更名前版本的用户可通过安装新 XPI
切换到新发布地址。

升级前建议在 Zotero 中备份数据目录。通过新 XPI 安装同一 addon ID 会执行插件自己的 SQLite 迁移；迁移失败时保留备份并恢复数据。插件数据库不等同于 Zotero 主数据库。

在 `工具 > 插件` 中可以禁用插件，禁用后重启 Zotero；卸载前先等待任务中心没有运行中的任务。卸载不会删除 Zotero 条目，但建议保留或备份插件专属数据库，以便排查问题。

## 跨平台冒烟

Zotero 9 的 XPI 安装方式在 macOS、Windows、Linux 相同。模型服务地址、文件权限和防火墙行为可能不同，发布前请按
[`test/manual/zotero-9-smoke.md`](../test/manual/zotero-9-smoke.md) 完成一遍清单。
