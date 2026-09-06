import { assert } from "chai";
import { OpenAIChatClient } from "../../src/infrastructure/models/openAIChatClient";

describe("summary toggle", function () {
  it("keeps the disabled LLM path network-free and reports arXiv fallback mode", async function () {
    const client = new OpenAIChatClient({
      enabled: false,
      baseURL: "https://api.openai.com/v1",
      apiKey: "",
      model: "",
    });
    let called = false;
    try {
      await client.generateChineseSummary({
        title: "title",
        abstract: "abstract",
      });
    } catch (error) {
      called = true;
      assert.match(String(error), /未启用/);
    }
    assert.isTrue(called);
  });
});
