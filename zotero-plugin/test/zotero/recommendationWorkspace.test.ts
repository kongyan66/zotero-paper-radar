import { assert } from "chai";
import type { ArxivCandidate, ScoreBreakdown } from "../../src/domain/model";
import { RecommendationToolbarView } from "../../src/ui/recommendations/toolbar";
import { RecommendationWorkspaceView } from "../../src/ui/recommendations/recommendationWorkspace";
import type { RecommendationHistoryDay } from "../../src/domain/recommendations/recommendationHistory";

describe("recommendation workspace content", function () {
  it("renders opaque filter overlays and aligned controls in the Zotero window", async function () {
    const win = Zotero.getMainWindow()!;
    const doc = win.document;
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    host.className = "zad-workspace";
    host.style.cssText =
      "position:fixed;left:0;top:100px;width:1150px;height:180px;z-index:2000;";
    doc.documentElement!.appendChild(host);
    const toolbar = new RecommendationToolbarView(doc, {
      onRefresh: () => undefined,
    });
    try {
      const header = toolbar.mount(host);
      await Zotero.Promise.delay(50);
      assert.match(
        doc
          .querySelector("link[href*='recommendationWorkspace.css']")
          ?.getAttribute("href") ?? "",
        /\?v=[0-9a-f]{16}$/,
        "stylesheet URL must include its content fingerprint",
      );
      const controls = [
        ...host.querySelectorAll<HTMLElement>(
          ".zad-field > button, .zad-field > select, .zad-field > input, .zad-primary-command",
        ),
      ];
      const bounds = controls.map((element) => element.getBoundingClientRect());
      assert.lengthOf(bounds, 6);
      for (const [index, rect] of bounds.entries()) {
        assert.closeTo(rect.height, 32, 1, `control ${index} height`);
        assert.closeTo(
          rect.bottom,
          bounds[0].bottom,
          1,
          `control ${index} baseline`,
        );
      }
      for (const role of ["profile", "category"]) {
        const button = host.querySelector<HTMLButtonElement>(
          `[data-role='${role}-filter']`,
        )!;
        const menu = host.querySelector<HTMLElement>(
          `[data-role='${role}-filter-menu']`,
        )!;
        const heightBefore = header.getBoundingClientRect().height;
        button.click();
        const style = win.getComputedStyle(menu);
        assert.match(
          style.backgroundColor,
          /^rgb\(/,
          `${role} background: ${style.backgroundColor}`,
        );
        assert.equal(style.position, "fixed");
        assert.equal(style.borderTopStyle, "solid");
        assert.isAbove(menu.getBoundingClientRect().height, 0);
        assert.closeTo(header.getBoundingClientRect().height, heightBefore, 1);
        button.click();
        assert.equal(menu.getBoundingClientRect().height, 0);
      }
      for (const width of [700, 480]) {
        host.style.width = `${width}px`;
        await Zotero.Promise.delay(20);
        assert.isAtMost(host.scrollWidth, width, `overflow at ${width}px`);
        const rectangles = controls.map((element) =>
          element.getBoundingClientRect(),
        );
        for (const [index, rect] of rectangles.entries()) {
          assert.closeTo(rect.height, 32, 1);
          for (const other of rectangles.slice(index + 1)) {
            const overlapWidth =
              Math.min(rect.right, other.right) -
              Math.max(rect.left, other.left);
            const overlapHeight =
              Math.min(rect.bottom, other.bottom) -
              Math.max(rect.top, other.top);
            assert.isTrue(
              overlapWidth <= 1 || overlapHeight <= 1,
              `controls overlap at ${width}px`,
            );
          }
        }
      }
    } finally {
      toolbar.destroy();
      host.remove();
    }
  });

  it("clamps recommendation count and supports all or selected profiles", function () {
    const doc =
      Zotero.getMainWindow()!.document.implementation.createHTMLDocument(
        "recommendation-toolbar",
      );
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    doc.body.appendChild(host);
    let requested = "";
    const toolbar = new RecommendationToolbarView(doc, {
      profiles: [
        { id: "p1", name: "Document AI" },
        { id: "p2", name: "3D Vision" },
      ],
      onRefresh: (state) => {
        requested = `${state.count}:${state.profileIDs.join(",")}:${state.categories.join(",")}`;
      },
    });
    toolbar.mount(host);
    const count = host.querySelector<HTMLInputElement>(
      "[data-role='recommendation-count']",
    )!;
    count.value = "99";
    count.dispatchEvent(new Event("change"));
    const profileButton = host.querySelector<HTMLButtonElement>(
      "[data-role='profile-filter']",
    )!;
    profileButton.click();
    const profileMenu = host.querySelector<HTMLElement>(
      "[data-role='profile-filter-menu']",
    )!;
    assert.isFalse(profileMenu.hasAttribute("hidden"));
    const documentAI =
      profileMenu.querySelector<HTMLInputElement>("input[value='p1']")!;
    documentAI.click();
    assert.equal(profileButton.textContent, "Document AI");
    host
      .querySelector<HTMLButtonElement>(
        "[data-role='refresh-recommendations']",
      )!
      .click();
    assert.equal(requested, "30:p1:cs.CV,cs.CL");
    const refresh = host.querySelector<HTMLButtonElement>(
      "[data-role='refresh-recommendations']",
    )!;
    toolbar.setStatus("正在生成推荐", "working");
    assert.isTrue(refresh.disabled);
    toolbar.setStatus("推荐已更新", "ready");
    assert.isFalse(refresh.disabled);
    profileButton.click();
    assert.isFalse(profileMenu.hasAttribute("hidden"));
    const outside = doc.createElement("div");
    doc.body.appendChild(outside);
    outside.dispatchEvent(new Event("click", { bubbles: true }));
    assert.isTrue(profileMenu.hasAttribute("hidden"));
    toolbar.destroy();
    outside.remove();
    host.remove();
  });

  it("aligns toolbar fields and submits configurable arXiv categories", function () {
    const doc =
      Zotero.getMainWindow()!.document.implementation.createHTMLDocument(
        "recommendation-categories",
      );
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    doc.body.appendChild(host);
    let selected: readonly string[] = [];
    const toolbar = new RecommendationToolbarView(doc, {
      categories: ["cs.CV", "cs.CL", "stat.ML"],
      onRefresh: (state) => {
        selected = state.categories;
      },
    });
    toolbar.mount(host);

    const labels = [
      ...host.querySelectorAll<HTMLElement>(
        ".zad-workspace-controls > .zad-field",
      ),
    ].map((field) => field.firstElementChild?.textContent);
    assert.deepEqual(labels, ["画像", "推荐日", "数量", "时间", "分类"]);

    const button = host.querySelector<HTMLButtonElement>(
      "[data-role='category-filter']",
    )!;
    button.click();
    const menu = host.querySelector<HTMLElement>(
      "[data-role='category-filter-menu']",
    )!;
    assert.equal(menu.parentElement, host);
    assert.notEqual(menu.parentElement, button.parentElement);
    assert.isFalse(menu.hasAttribute("hidden"));
    assert.match(menu.style.left, /^\d+px$/);
    assert.match(menu.style.top, /^\d+px$/);
    assert.equal(menu.style.width, "250px");
    assert.include(menu.textContent, "stat.ML · 自定义分类");

    menu.querySelector<HTMLInputElement>("input[value='cs.CL']")!.click();
    assert.equal(button.textContent, "cs.CV + stat.ML");
    host
      .querySelector<HTMLButtonElement>(
        "[data-role='refresh-recommendations']",
      )!
      .click();
    assert.deepEqual(selected, ["cs.CV", "stat.ML"]);

    button.click();
    menu.querySelector<HTMLInputElement>("input[value='stat.ML']")!.click();
    button.click();
    const last = menu.querySelector<HTMLInputElement>("input[value='cs.CV']")!;
    last.click();
    assert.isTrue(
      menu.querySelector<HTMLInputElement>("input[value='cs.CV']")!.checked,
    );
    assert.equal(toolbar.readState().categories.length, 1);
    toolbar.destroy();
    host.remove();
  });

  it("shows available recommendation days and loads the selected day", function () {
    const doc =
      Zotero.getMainWindow()!.document.implementation.createHTMLDocument(
        "recommendation-history",
      );
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    let selected = "";
    const history: readonly RecommendationHistoryDay[] = [
      {
        dayKey: "2026-09-04",
        label: "今天 · 2026-09-04",
        candidateCount: 5,
        runID: "run-today",
        createdAt: "2026-09-04T04:00:00.000Z",
      },
      {
        dayKey: "2026-09-03",
        label: "昨天 · 2026-09-03",
        candidateCount: 4,
        runID: "run-yesterday",
        createdAt: "2026-09-03T04:00:00.000Z",
      },
    ];
    const toolbar = new RecommendationToolbarView(doc, {
      historyDays: history,
      onHistoryDayChange: (dayKey) => {
        selected = dayKey;
      },
    });
    toolbar.mount(host);
    const historySelect = host.querySelector<HTMLSelectElement>(
      "[data-role='history-day']",
    )!;
    assert.equal(historySelect.value, "2026-09-04");
    assert.include(historySelect.options[0].textContent, "今天");
    historySelect.value = "2026-09-03";
    historySelect.dispatchEvent(new Event("change"));
    assert.equal(selected, "2026-09-03");
    toolbar.destroy();
  });

  it("labels the displayed recommendation day", function () {
    const doc = Zotero.getMainWindow()!.document;
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    const view = new RecommendationWorkspaceView(doc);
    view.mount(host);
    view.setHistoryDays(
      [
        {
          dayKey: "2026-09-04",
          label: "今天 · 2026-09-04",
          candidateCount: 1,
          runID: "run-today",
          createdAt: "2026-09-04T04:00:00.000Z",
        },
      ],
      "2026-09-04",
    );
    assert.equal(
      host.querySelector("[data-role='recommendation-day']")?.textContent,
      "推荐日：2026-09-04",
    );
    view.destroy();
  });

  it("renders a long-title recommendation with all six explanations", function () {
    const doc = Zotero.getMainWindow()!.document;
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    const view = new RecommendationWorkspaceView(doc);
    view.mount(host);
    assert.equal(
      host.querySelector("[data-role='recommendation-empty'] strong")
        ?.textContent,
      "暂无推荐记录",
    );
    assert.include(host.textContent, "刷新后将根据当前兴趣画像检索 arXiv");
    let reason = "";
    const candidate: ArxivCandidate = {
      arxivId: "2608.24845",
      version: 2,
      title:
        "A very long paper title that must remain readable in a narrow recommendation workspace",
      abstract: "Original arXiv abstract.",
      authors: ["Author One", "Author Two"],
      categories: ["cs.CV"],
      submittedAt: "2026-08-26T00:00:00Z",
      abstractUrl: "https://arxiv.org/abs/2608.24845",
      pdfUrl: "https://arxiv.org/pdf/2608.24845v2.pdf",
    };
    const score: ScoreBreakdown = {
      recentSimilarity: 0.9,
      longTermSimilarity: 0.8,
      representativeSimilarity: 0.7,
      keywordMatch: 0.6,
      manualPriority: 0.1,
      negativeSimilarity: 0,
      rawScore: 0.7,
      diversityAdjustment: -0.02,
      rerankedScore: 0.68,
      displayScore: 92,
    };
    view.setRecommendations([
      {
        candidate,
        score,
        profileName: "Vision-Language Models",
        profileVersionID: "profile-version-1",
        keywords: ["vision-language models", "OCR"],
        representatives: [
          { title: "Qwen-VL Technical Report", similarity: 0.88 },
        ],
        summary: {
          text: candidate.abstract,
          source: "arxiv",
          fallbackReason: "尚无中文摘要缓存，刷新推荐后将尝试生成",
        },
        onReject: (action) => {
          reason = action;
        },
      },
    ]);
    assert.exists(host.querySelector("[data-role='recommendation-list']"));
    assert.exists(host.querySelector("[data-arxiv-id='2608.24845']"));
    assert.equal(
      host.querySelector(".zad-card-score")?.textContent,
      "相关度 92/100",
    );
    assert.include(host.textContent, "原始分 0.700");
    assert.include(host.textContent, "近期兴趣");
    assert.include(host.textContent, "长期兴趣");
    assert.include(host.textContent, "代表论文");
    assert.include(host.textContent, "主题负反馈");
    assert.include(host.textContent, "中文摘要未生成");
    assert.include(host.textContent, "刷新推荐后将尝试生成");
    assert.notInclude(host.textContent, "查看 arXiv 原始摘要");
    const reasonSelect = host.querySelector<HTMLSelectElement>(
      ".zad-reject-control select",
    )!;
    reasonSelect.value = "duplicate";
    reasonSelect.dispatchEvent(new Event("change"));
    host
      .querySelector<HTMLButtonElement>(".zad-reject-control button")!
      .click();
    assert.equal(reason, "duplicate");
    view.destroy();
  });

  it("renders a cached first screen under one second", function () {
    const doc = Zotero.getMainWindow()!.document;
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    const models = Array.from({ length: 20 }, (_, index) => ({
      candidate: {
        arxivId: `2608.${String(index + 1).padStart(5, "0")}`,
        version: 1,
        title: `Cached recommendation ${index}`,
        abstract: "Cached arXiv abstract.",
        authors: ["Author"],
        categories: ["cs.CV"],
        submittedAt: "2026-08-26T00:00:00Z",
        abstractUrl: "https://arxiv.org/abs/2608.00001",
        pdfUrl: "https://arxiv.org/pdf/2608.00001.pdf",
      },
      score: {
        recentSimilarity: 0.9,
        longTermSimilarity: 0.8,
        representativeSimilarity: 0.7,
        keywordMatch: 0.6,
        manualPriority: 0.1,
        negativeSimilarity: 0,
        rawScore: 0.7,
        diversityAdjustment: 0,
        rerankedScore: 0.7,
        displayScore: 90,
      },
      profileName: "Vision",
      profileVersionID: "profile-version-1",
      keywords: ["vision"],
      representatives: [],
    }));
    const view = new RecommendationWorkspaceView(doc);
    const started = performance.now();
    view.mount(host);
    view.setRecommendations(models);
    const elapsed = performance.now() - started;

    assert.equal(host.querySelectorAll("[data-arxiv-id]").length, 20);
    assert.isBelow(elapsed, 1_000);
    view.destroy();
  });
});
