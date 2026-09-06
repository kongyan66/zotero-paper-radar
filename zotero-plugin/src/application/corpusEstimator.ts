export interface EligiblePaperCounter {
  countEligiblePapers(): Promise<number>;
}

export interface CorpusEstimate {
  readonly eligiblePaperCount: number;
  readonly fieldsSent: readonly ["title", "abstract"];
  readonly estimatedEmbeddingBatches: number;
  readonly estimatedTokens: number;
}

export class CorpusEstimator {
  private readonly counter: EligiblePaperCounter;
  private readonly averageTokensPerPaper: number;

  constructor(counter: EligiblePaperCounter, averageTokensPerPaper = 320) {
    this.counter = counter;
    this.averageTokensPerPaper = averageTokensPerPaper;
  }

  async estimate(batchSize: number): Promise<CorpusEstimate> {
    const eligiblePaperCount = Math.max(
      0,
      Math.round(await this.counter.countEligiblePapers()),
    );
    const normalizedBatchSize = Math.max(1, Math.round(batchSize));
    return {
      eligiblePaperCount,
      fieldsSent: ["title", "abstract"],
      estimatedEmbeddingBatches: Math.ceil(
        eligiblePaperCount / normalizedBatchSize,
      ),
      estimatedTokens: eligiblePaperCount * this.averageTokensPerPaper,
    };
  }
}

export class ZoteroEligiblePaperCounter implements EligiblePaperCounter {
  async countEligiblePapers(): Promise<number> {
    const itemIDs = new Set<number>();
    for (const itemType of ["journalArticle", "conferencePaper", "preprint"]) {
      const search = new Zotero.Search({
        libraryID: Zotero.Libraries.userLibraryID,
      });
      search.addCondition("itemType", "is", itemType);
      search.addCondition("deleted", "false");
      for (const itemID of await search.search()) itemIDs.add(itemID);
    }
    return itemIDs.size;
  }
}
