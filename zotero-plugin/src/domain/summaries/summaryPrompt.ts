export const SUMMARY_PROMPT_VERSION = "zh-research-summary-v2";
export const SUMMARY_LANGUAGE = "zh-CN";

const SECTION_HEADING =
  /(?:^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:[-*][ \t]*)?(?:\d+[.)、][ \t]*)?(?:\*\*)?[ \t]*(研究问题|主要方法|研究方法|摘要报告结果|主要结果|实验结果|研究结果)[ \t]*(?:\*\*)?[ \t]*(?:[：:][ \t]*(?:\*\*)?[ \t]*|\n+)/g;

const CANONICAL_LABELS = {
  研究问题: "研究问题",
  主要方法: "主要方法",
  研究方法: "主要方法",
  摘要报告结果: "摘要报告结果",
  主要结果: "摘要报告结果",
  实验结果: "摘要报告结果",
  研究结果: "摘要报告结果",
} as const;

export function buildChineseSummaryPrompt(
  title: string,
  abstract: string,
): string {
  return [
    "请严格基于给定论文标题和摘要，用简洁、准确的中文输出三段，不能补充原文没有的信息。",
    "每段必须使用下面的中文标签和全角冒号，不要使用 Markdown 标题或思考过程：",
    "研究问题：……",
    "主要方法：……",
    "摘要报告结果：……",
    `论文标题：${title.trim()}`,
    `论文摘要：${abstract.trim()}`,
  ].join("\n");
}

export function hasRequiredSummarySections(value: string): boolean {
  return normalizeChineseSummary(value) !== undefined;
}

export function normalizeChineseSummary(value: string): string | undefined {
  const source = value
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!source) return undefined;

  const matches = [...source.matchAll(SECTION_HEADING)];
  if (matches.length < 3) return undefined;
  const sections = new Map<string, string>();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const rawLabel = match[1] as keyof typeof CANONICAL_LABELS;
    const label = CANONICAL_LABELS[rawLabel];
    if (sections.has(label)) continue;
    const content = source
      .slice(
        (match.index ?? 0) + match[0].length,
        matches[index + 1]?.index ?? source.length,
      )
      .replace(/^[-*]+[ \t]*/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!content || !/[\u3400-\u9fff]/u.test(content)) return undefined;
    sections.set(label, content);
  }

  const problem = sections.get("研究问题");
  const method = sections.get("主要方法");
  const result = sections.get("摘要报告结果");
  if (!problem || !method || !result) return undefined;
  return [
    `研究问题：${problem}`,
    `主要方法：${method}`,
    `摘要报告结果：${result}`,
  ].join("\n");
}
