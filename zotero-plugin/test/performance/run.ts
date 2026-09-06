import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { benchmarkCachedWorkspace } from "./cachedWorkspace.bench.ts";
import {
  benchmarkRanking,
  type PerformanceMeasurement,
} from "./ranking.bench.ts";

const output = parseOutput(process.argv.slice(2));
const measurements: PerformanceMeasurement[] = [
  benchmarkRanking(),
  benchmarkCachedWorkspace(),
];
const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    zotero: process.env.ZOTERO_VERSION ?? "not available in Node benchmark",
    embeddingDimensions: 32,
  },
  measurements,
  passed: measurements.every((measurement) => measurement.passed),
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
for (const measurement of measurements) {
  console.log(
    `${measurement.passed ? "PASS" : "FAIL"} ${measurement.name}: ${measurement.elapsedMs.toFixed(2)}ms (threshold ${measurement.thresholdMs}ms)`,
  );
}
console.log(`Performance report: ${output}`);
if (!report.passed) process.exitCode = 1;

function parseOutput(arguments_: readonly string[]): string {
  const index = arguments_.indexOf("--out");
  if (index < 0) return "/tmp/zotero-arxiv-daily-performance.json";
  const value = arguments_[index + 1];
  if (!value) throw new Error("--out requires a file path");
  return resolve(value);
}
