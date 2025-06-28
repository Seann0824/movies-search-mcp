import { ImtlinkSource } from "./Imtlink.source";
import { SearchQuery } from "../types";
import { ImtlinkValidatorService } from "../core/imtlink.validator";

describe("ImtlinkSource", () => {
  let source: ImtlinkSource;
  let sourceValidator: ImtlinkValidatorService;

  beforeEach(() => {
    source = new ImtlinkSource();
    sourceValidator = new ImtlinkValidatorService();
  });

  describe("find", () => {
    it("should search for movies and return results", async () => {
      const query: SearchQuery = {
        title: "我爱你",
        type: "movie",
      };

      const results = await source.find(query);

      console.log(`Found ${results.length} results for "${query.title}"`);
      results.forEach((result, index) => {
        console.log(
          `${index + 1}. ${result.title} - ${result.url} (${result.quality})`
        );
      });
      console.log(results);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      if (results.length > 0) {
        expect(results[0]).toHaveProperty("title");
        expect(results[0]).toHaveProperty("url");
        expect(results[0]).toHaveProperty("quality");
        expect(results[0]).toHaveProperty("source");
        expect(results[0].source).toBe("Imtlink");
        expect(results[0].url).toContain("/vodplay/");
      }
      // 拿到结果开始验证，识破可播放行，并返回结果, 先测试验证一个吧，如果验证通过，则返回结果
      const validatedResults = await Promise.allSettled(
        results.slice(0, 1).map(async (result) => {
          const isValid = await sourceValidator.isValid(result.url);
          return isValid ? result : null;
        })
      );
    }, 30000000);
  });

  // describe("convertToPlayUrl", () => {
  //   it("should convert detail URL to play URL", () => {
  //     // 使用反射来测试私有方法
  //     const convertToPlayUrl = (source as any).convertToPlayUrl.bind(source);

  //     const detailUrl = "https://www.imtlink.com/voddetail/161499.html";
  //     const expectedPlayUrl = "https://www.imtlink.com/vodplay/161499-1-1.html";

  //     const result = convertToPlayUrl(detailUrl);
  //     expect(result).toBe(expectedPlayUrl);
  //   });

  //   it("should handle relative URLs", () => {
  //     const convertToPlayUrl = (source as any).convertToPlayUrl.bind(source);

  //     const detailUrl = "/voddetail/161499.html";
  //     const expectedPlayUrl = "https://www.imtlink.com/vodplay/161499-1-1.html";

  //     const result = convertToPlayUrl(detailUrl);
  //     expect(result).toBe(expectedPlayUrl);
  //   });

  //   it("should return play URL unchanged if already a play URL", () => {
  //     const convertToPlayUrl = (source as any).convertToPlayUrl.bind(source);

  //     const playUrl = "https://www.imtlink.com/vodplay/161499-1-1.html";

  //     const result = convertToPlayUrl(playUrl);
  //     expect(result).toBe(playUrl);
  //   });

  //   it("should handle invalid URLs gracefully", () => {
  //     const convertToPlayUrl = (source as any).convertToPlayUrl.bind(source);

  //     const invalidUrl = "https://example.com/invalid";

  //     const result = convertToPlayUrl(invalidUrl);
  //     expect(result).toBe(invalidUrl);
  //   });
  // });
});
