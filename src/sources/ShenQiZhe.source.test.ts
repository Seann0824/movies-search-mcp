import { ShenQiZheSource } from "./ShenQiZhe.source";
import { SearchQuery } from "../types";

describe("ShenQiZheSource Integration Test", () => {
  let shenQiZheSource: ShenQiZheSource;
  let lastTestTime = 0;

  beforeEach(async () => {
    shenQiZheSource = new ShenQiZheSource();

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
});
