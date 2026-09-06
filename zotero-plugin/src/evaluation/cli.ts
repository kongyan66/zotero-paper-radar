import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateDataset, renderMarkdownReport } from "./report.ts";
import type { ReplayDataset } from "./types.ts";

interface CliOptions {
  readonly fixtures: string;
  readonly output: string;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const fixturePath = resolve(options.fixtures, "dataset.json");
  const outputDirectory = resolve(options.output);
  const dataset = JSON.parse(
    await readFile(fixturePath, "utf8"),
  ) as ReplayDataset;
  validateDataset(dataset);

  const report = evaluateDataset(dataset);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "report.md"),
      `${renderMarkdownReport(report)}\n`,
      "utf8",
    ),
  ]);
  console.log(`Evaluation report: ${outputDirectory}`);
  console.log(`${report.pass ? "PASS" : "BETA"}: ${report.gateReason}`);
}

function parseArguments(arguments_: readonly string[]): CliOptions {
  let fixtures = "";
  let output = "";
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--fixtures") fixtures = arguments_[++index] ?? "";
    else if (argument === "--out") output = arguments_[++index] ?? "";
    else throw new Error(`Unknown evaluation argument: ${argument}`);
  }
  if (!fixtures || !output) {
    throw new Error(
      "Usage: npm run evaluate -- --fixtures <directory> --out <directory>",
    );
  }
  return { fixtures, output };
}

function validateDataset(value: ReplayDataset): void {
  if (
    !value ||
    !Array.isArray(value.papers) ||
    !Array.isArray(value.feedback) ||
    !Array.isArray(value.cutoffs)
  ) {
    throw new Error(
      "Replay fixture must contain papers, feedback, and cutoffs arrays",
    );
  }
}

await main();
