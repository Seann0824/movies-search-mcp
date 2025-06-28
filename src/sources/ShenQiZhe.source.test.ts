import { ShenQiZheSource } from "./ShenQiZhe.source";
import { ShenQiZheValidatorService } from "../core/shenqizhe.validator";
import { SearchQuery, SearchResult } from "../types";

describe("ShenQiZheSource Integration Test", () => {
  let shenQiZheSource: ShenQiZheSource;
  let shenQiZheValidator: ShenQiZheValidatorService;
  let lastTestTime = 0;

  beforeEach(async () => {
    shenQiZheSource = new ShenQiZheSource();
    shenQiZheValidator = new ShenQiZheValidatorService();

    // 确保测试间隔至少10秒，避免频繁请求
    const now = Date.now();
    const timeSinceLastTest = now - lastTestTime;
    const minInterval = 10000; // 10秒

    if (timeSinceLastTest < minInterval) {
      const waitTime = minInterval - timeSinceLastTest;
      console.log(`[Test] 等待 ${waitTime}ms 以遵守频率限制...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    lastTestTime = Date.now();
  });

  it("should search and parse movie results correctly", async () => {
    const query: SearchQuery = {
      title: "小黄人",
      type: "movie",
    };

    console.log(`[Test] 开始搜索: ${query.title}`);
    const results = await shenQiZheSource.find(query);

    console.log(`[Test] 找到 ${results.length} 个结果`);

    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);

    // 验证结果结构
    const firstResult = results[0];
    expect(firstResult).toHaveProperty("title");
    expect(firstResult).toHaveProperty("url");
    expect(firstResult).toHaveProperty("quality");
    expect(firstResult).toHaveProperty("source");

    expect(firstResult.source).toBe("ShenQiZhe");
    expect(firstResult.url).toContain("shenqizhe.com");
    expect(typeof firstResult.title).toBe("string");
    expect(typeof firstResult.quality).toBe("string");

    console.log(
      `[Test] 第一个结果: ${firstResult.title} - ${firstResult.quality}`
    );
  }, 30000); // 30秒超时

  it("should handle search with no results gracefully", async () => {
    const query: SearchQuery = {
      title: "一个不存在的电影名称12345",
      type: "movie",
    };

    console.log(`[Test] 搜索不存在的电影: ${query.title}`);
    const results = await shenQiZheSource.find(query);

    console.log(`[Test] 结果数量: ${results.length}`);

    expect(results).toBeInstanceOf(Array);
    // 可能返回空数组或者少量结果
    expect(results.length).toBeGreaterThanOrEqual(0);
  }, 30000); // 30秒超时

  it("should find and validate playable video results", async () => {
    const query: SearchQuery = {
      title: "小黄人",
      type: "movie",
    };

    console.log(`[Test] 开始搜索并验证视频: ${query.title}`);
    const searchResults = await shenQiZheSource.find(query);

    console.log(`[Test] 搜索到 ${searchResults.length} 个结果，开始验证...`);
    expect(searchResults.length).toBeGreaterThan(0);

    // 取前3个结果进行验证，避免测试时间过长
    const resultsToValidate = searchResults.slice(0, 3);
    console.log(`[Test] 选择前 ${resultsToValidate.length} 个结果进行验证`);

    // 并发验证所有选中的链接
    const validationPromises = resultsToValidate.map(async (result, index) => {
      console.log(
        `[Test] 验证 [${index + 1}/${resultsToValidate.length}]: ${result.title} - ${result.url}`
      );

      try {
        const isValid = await shenQiZheValidator.isValid(result.url);
        console.log(
          `[Test] 验证结果 [${index + 1}]: ${isValid ? "✅ 可播放" : "❌ 不可播放"}`
        );
        return isValid ? result : null;
      } catch (error) {
        console.log(
          `[Test] 验证失败 [${index + 1}]: ${error instanceof Error ? error.message : String(error)}`
        );
        return null;
      }
    });

    const validatedResults = (await Promise.all(validationPromises)).filter(
      (result): result is SearchResult => result !== null
    );

    console.log(
      `[Test] 验证完成: ${validatedResults.length}/${resultsToValidate.length} 个视频可播放`
    );

    // 验证结果结构
    validatedResults.forEach((result, index) => {
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("quality");
      expect(result).toHaveProperty("source");
      expect(result.source).toBe("ShenQiZhe");
      expect(result.url).toContain("shenqizhe.com/vodplay/");
      console.log(
        `[Test] 可播放视频 [${index + 1}]: ${result.title} - ${result.quality}`
      );
    });

    // 期望至少有一个视频通过验证
    expect(validatedResults.length).toBeGreaterThan(0);

    console.log(
      `[Test] 🎉 视频验证测试通过！找到 ${validatedResults.length} 个可播放的视频资源`
    );
  }, 120000); // 120秒超时，因为需要验证多个视频
});
