import {
  RECOMMENDATION_STAGES,
  type RunCoordinator,
  type RunResult,
  type RunStage,
} from "./runCoordinator.ts";

export interface RecommendationPipeline {
  readonly corpusCheck?: RunStage["run"];
  readonly profile?: RunStage["run"];
  readonly arxiv?: RunStage["run"];
  readonly candidateEmbedding?: RunStage["run"];
  readonly scoring?: RunStage["run"];
  readonly rerank?: RunStage["run"];
  readonly summary?: RunStage["run"];
}

export class RecommendationService {
  readonly #coordinator: RunCoordinator;
  readonly #pipeline: RecommendationPipeline;

  constructor(
    coordinator: RunCoordinator,
    pipeline: RecommendationPipeline = {},
  ) {
    this.#coordinator = coordinator;
    this.#pipeline = pipeline;
  }

  run(input: {
    readonly taskID: string;
    readonly relatedRunID?: string;
    readonly checkpoint?: Readonly<Record<string, unknown>>;
  }): Promise<RunResult> {
    return this.#coordinator.start({
      taskID: input.taskID,
      taskType: "recommendation",
      relatedRunID: input.relatedRunID,
      checkpoint: input.checkpoint,
      stages: this.stages(),
      total: RECOMMENDATION_STAGES.length,
    });
  }

  resume(taskID: string): Promise<RunResult> {
    return this.#coordinator.resume(taskID, this.stages());
  }

  private stages(): RunStage[] {
    return RECOMMENDATION_STAGES.map((name) => ({
      name,
      run: this.pipelineFor(name) ?? (async () => ({})),
    }));
  }

  private pipelineFor(name: string): RunStage["run"] | undefined {
    return {
      "corpus-check": this.#pipeline.corpusCheck,
      profile: this.#pipeline.profile,
      arxiv: this.#pipeline.arxiv,
      "candidate-embedding": this.#pipeline.candidateEmbedding,
      scoring: this.#pipeline.scoring,
      rerank: this.#pipeline.rerank,
      summary: this.#pipeline.summary,
    }[name as (typeof RECOMMENDATION_STAGES)[number]];
  }
}
