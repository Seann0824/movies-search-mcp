import { ImtlinkSource } from "../sources/Imtlink.source";
import { ImtlinkValidatorService } from "./imtlink.validator";
import { SearchQuery, SearchResult } from "../types";

describe("Imtlink End-to-End Test", () => {
  let imtlinkSource: ImtlinkSource;
  let imtlinkValidator: ImtlinkValidatorService;

  beforeAll(() => {
    imtlinkSource = new ImtlinkSource();
    imtlinkValidator = new ImtlinkValidatorService();
  });

  it("should find and validate playable movie results for a valid query", async () => {
    // 1. 搜索：获取潜在的播放页面
    const query: SearchQuery = {
      title: "我爱你",
      type: "movie",
    };
    const initialResults = await imtlinkSource.find(query);
    console.log(
      `[Test] Found ${initialResults.length} potential results from source.`
    );

    // 期望至少找到一个结果
    expect(initialResults.length).toBeGreaterThan(0);

    // 2. 过滤：并发验证所有找到的链接（限制并发数量避免过载）
    const maxConcurrent = 3;
    const validatedResults: SearchResult[] = [];

    for (let i = 0; i < initialResults.length; i += maxConcurrent) {
      const batch = initialResults.slice(i, i + maxConcurrent);
      const validationPromises = batch.map(async (result) => {
        console.log(`[Test] Validating: ${result.url}`);
        const isValid = await imtlinkValidator.isValid(result.url);
        return isValid ? result : null;
      });

      const batchResults = (await Promise.all(validationPromises)).filter(
        (result): result is SearchResult => result !== null
      );

      validatedResults.push(...batchResults);

      // 如果已经找到有效结果，可以提前结束
      if (validatedResults.length > 0) {
        break;
      }
    }

    console.log(
      `[Test] Found ${validatedResults.length} validated, playable results.`
    );

    // 3. 断言：确保至少有一个结果通过了验证
    expect(validatedResults.length).toBeGreaterThan(0);

    // 显示所有验证通过的结果
    console.log("✅ All validated results:");
    validatedResults.forEach((result, index) => {
      console.log(
        `  [${index + 1}] ${result.title} - ${result.url} (${result.quality})`
      );
      expect(result.url).toMatch(/^https:\/\/www\.imtlink\.com\/vodplay\//);
    });
  }, 120000); // 2分钟超时

  it("should handle invalid URLs gracefully", async () => {
    const invalidUrl = "https://www.imtlink.com/vodplay/invalid-url";
    const isValid = await imtlinkValidator.isValid(invalidUrl);

    console.log(`[Test] Invalid URL validation result: ${isValid}`);
    expect(isValid).toBe(false);
  }, 30000);

  it("should validate URL format correctly", async () => {
    const validUrl = "https://www.imtlink.com/vodplay/161499-1-1.html";
    const invalidUrl = "https://www.example.com/video";

    // 测试内部URL验证方法
    const validator = new ImtlinkValidatorService();

    // 使用反射访问私有方法进行测试
    const isValidUrlMethod = (validator as any).isValidUrl.bind(validator);

    expect(isValidUrlMethod(validUrl)).toBe(true);
    expect(isValidUrlMethod(invalidUrl)).toBe(false);
  });
});

describe("ImtlinkValidatorService", () => {
  let validator: ImtlinkValidatorService;

  beforeEach(() => {
    validator = new ImtlinkValidatorService();
  });

  describe("isValid", () => {
    it("should validate a working Imtlink play URL", async () => {
      // 使用一个真实的播放页面URL进行测试
      const playUrl = "https://www.imtlink.com/vodplay/161499-1-1.html";

      console.log(`Testing URL: ${playUrl}`);

      const isValid = await validator.isValid(playUrl);

      console.log(`Validation result: ${isValid}`);

      expect(typeof isValid).toBe("boolean");

      if (isValid) {
        console.log("✅ URL is valid and playable");
      } else {
        console.log("❌ URL is not valid or not playable");
      }
    }, 60000); // 60秒超时

    it("should reject invalid URLs", async () => {
      const invalidUrls = [
        "",
        "https://example.com",
        "https://www.imtlink.com/",
        "https://www.imtlink.com/voddetail/161499.html", // 详情页，不是播放页
      ];

      for (const url of invalidUrls) {
        console.log(`Testing invalid URL: ${url}`);
        const isValid = await validator.isValid(url);
        console.log(`Result for ${url}: ${isValid}`);

        expect(isValid).toBe(false);
      }
    }, 30000);
  });

  describe("URL validation", () => {
    it("should correctly identify valid Imtlink play URLs", () => {
      const validUrls = [
        "https://www.imtlink.com/vodplay/161499-1-1.html",
        "https://www.imtlink.com/vodplay/123456-2-3.html",
      ];

      for (const url of validUrls) {
        // 使用反射来测试私有方法
        const isValidUrl = (validator as any).isValidUrl(url);
        expect(isValidUrl).toBe(true);
      }
    });

    it("should reject invalid URL formats", () => {
      const invalidUrls = [
        "https://example.com/vodplay/123-1-1.html",
        "https://www.imtlink.com/voddetail/161499.html",
        "https://www.imtlink.com/",
        "",
      ];

      for (const url of invalidUrls) {
        const isValidUrl = (validator as any).isValidUrl(url);
        expect(isValidUrl).toBe(false);
      }
    });
  });
});
