import { GazeSource } from "./Gaze.source";
import { SearchQuery } from "../types";

describe("GazeSource Integration Test", () => {
  let gazeSource: GazeSource;

  beforeAll(() => {
    gazeSource = new GazeSource();
  });

  it("should find and return play page URLs for a valid query", async () => {
    const query: SearchQuery = {
      title: "人生切割术",
      type: "tv",
    };

    const results = await gazeSource.find(query);

    // 根据之前的 API 调用日志，我们期望得到 2 个结果
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);

    // 验证第一条结果（第二季）的结构和 URL
    const season2Result = results[0];
    expect(season2Result).toHaveProperty("url");
    expect(season2Result.url).toMatch(/^https:\/\/gaze\.run\/play\//);
    // 验证 mid 是否被正确用于构建 URL
    expect(season2Result.url).toContain("3707985a810eb936d216b2ffa6405416");
    expect(season2Result.quality).toBe("720P");
    expect(season2Result.source).toBe("Gaze");

    // 验证第二条结果（第一季）的结构和 URL
    const season1Result = results[1];
    expect(season1Result).toHaveProperty("url");
    expect(season1Result.url).toMatch(/^https:\/\/gaze\.run\/play\//);
    expect(season1Result.url).toContain("57fac3ff0917fa8ad2088a4372465ffd");
    expect(season1Result.quality).toBe("1080P");
  });

  it("should return an empty array for a query that finds no results", async () => {
    const query: SearchQuery = {
      title: "一部不存在的电影asdfghjkl",
      type: "movie",
    };

    const results = await gazeSource.find(query);

    // 断言结果是一个空数组
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});
