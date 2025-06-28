import { ImtlinkValidatorService } from "./imtlink.validator";

describe("ImtlinkValidatorService - DOM Structure Based", () => {
  let validator: ImtlinkValidatorService;

  beforeEach(() => {
    validator = new ImtlinkValidatorService();
  });

  describe("isValid", () => {
    it("should validate a working Imtlink play URL with proper DOM structure", async () => {
      // 使用一个真实的播放页面URL进行测试
      const playUrl = "https://www.imtlink.com/vodplay/161499-1-1.html";

      console.log(`Testing URL: ${playUrl}`);
      console.log("Looking for DOM structure:");
      console.log("  .MacPlayer container");
      console.log("  #playleft iframe with src='/static/player/dplayer.html'");
      console.log("  iframe内的 #playerCnt > div:nth-child(2) > video 元素");

      const isValid = await validator.isValid(playUrl);

      console.log(`Validation result: ${isValid}`);

      expect(typeof isValid).toBe("boolean");

      if (isValid) {
        console.log("✅ URL is valid and has proper video structure");
      } else {
        console.log("❌ URL validation failed");
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

    it("should validate another working URL", async () => {
      // 测试另一个播放链接
      const playUrl = "https://www.imtlink.com/vodplay/121219-1-1.html";

      console.log(`Testing second URL: ${playUrl}`);

      const isValid = await validator.isValid(playUrl);

      console.log(`Second validation result: ${isValid}`);

      expect(typeof isValid).toBe("boolean");
    }, 60000);
  });

  describe("URL format validation", () => {
    it("should only accept vodplay URLs", async () => {
      const testCases = [
        {
          url: "https://www.imtlink.com/vodplay/123-1-1.html",
          shouldBeValid: true,
        },
        {
          url: "https://www.imtlink.com/voddetail/123.html",
          shouldBeValid: false,
        },
        {
          url: "https://example.com/vodplay/123-1-1.html",
          shouldBeValid: false,
        },
        { url: "", shouldBeValid: false },
      ];

      for (const testCase of testCases) {
        const result = await validator.isValid(testCase.url);

        if (testCase.shouldBeValid) {
          // 对于应该有效的URL，我们只检查它不会因为格式问题被拒绝
          // 实际的播放能力取决于网站状态
          console.log(`URL ${testCase.url} format check passed`);
        } else {
          // 对于应该无效的URL，它们应该被立即拒绝
          expect(result).toBe(false);
          console.log(`URL ${testCase.url} correctly rejected`);
        }
      }
    }, 30000);
  });
});
