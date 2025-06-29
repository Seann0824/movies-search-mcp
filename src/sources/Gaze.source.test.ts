import { GazeSource } from "../sources/Gaze.source";
import { GazeValidatorService } from "../core/gaze.validator";
import { SearchQuery, SearchResult } from "../types";

describe("Gaze End-to-End Test", () => {
  let gazeSource: GazeSource;
  let gazeValidator: GazeValidatorService;

  beforeAll(() => {
    gazeSource = new GazeSource();
    gazeValidator = new GazeValidatorService();
  });

  // it("should find and validate playable movie results for a valid query", async () => {
  //   // 1. 搜索：获取潜在的播放页面
  //   const query: SearchQuery = {
  //     title: "人生切割术",
  //     type: "tv",
  //   };
  //   const initialResults = await gazeSource.find(query);
  //   console.log(
  //     `[Test] Found ${initialResults.length} potential results from source.`
  //   );

  //   // 期望至少找到一个结果
  //   expect(initialResults.length).toBeGreaterThan(0);

  //   // 2. 过滤：并发验证所有找到的链接
  //   const validationPromises = initialResults.map(async (result) => {
  //     const isValid = await gazeValidator.isValid(result.url);
  //     return isValid ? result : null;
  //   });

  //   const validatedResults = (await Promise.all(validationPromises)).filter(
  //     (result): result is SearchResult => result !== null
  //   );

  //   console.log(
  //     `[Test] Found ${validatedResults.length} validated, playable results.`
  //   );

  //   // 3. 断言：确保至少有一个结果通过了验证
  //   expect(validatedResults.length).toBeGreaterThan(0);

  //   // 显示所有验证通过的结果
  //   console.log("✅ All validated results:");
  //   validatedResults.forEach((result, index) => {
  //     console.log(`  [${index + 1}] ${result.url} (${result.quality})`);
  //     expect(result.url).toMatch(/^https:\/\/gaze\.run\/play\//);
  //   });
  // });
  // https://gaze.run/play/0c9466252d461accc7d9fb859f3b6309
  it("should successfully validate the specific video URL 'https://gaze.run/play/0c9466252d461accc7d9fb859f3b6309'", async () => {
    const isValid = await gazeValidator.isValid(
      "https://gaze.run/play/0c9466252d461accc7d9fb859f3b6309"
    );
    expect(isValid).toBe(true);
  }, 30000);
});
