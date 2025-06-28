import { ShenQiZheValidatorService } from "./shenqizhe.validator";

describe("ShenQiZheValidatorService", () => {
  let validator: ShenQiZheValidatorService;

  beforeEach(() => {
    validator = new ShenQiZheValidatorService();
  });

  describe("URL validation", () => {
    it("should validate correct ShenQiZhe URLs", () => {
      const validUrls = [
        "https://www.shenqizhe.com/vodplay/69958-1-1.html",
        "https://www.shenqizhe.com/vodplay/138178-1-1.html",
        "http://www.shenqizhe.com/vodplay/137236-1-1.html",
      ];

      validUrls.forEach((url) => {
        expect((validator as any).isValidUrl(url)).toBe(true);
      });
    });

    it("should reject invalid URLs", () => {
      const invalidUrls = [
        "https://gaze.run/play/123456",
        "https://other-site.com/vodplay/123-1-1.html",
        "https://www.shenqizhe.com/voddetail/123.html", // 详情页，不是播放页
        "",
        "not-a-url",
      ];

      invalidUrls.forEach((url) => {
        expect((validator as any).isValidUrl(url)).toBe(false);
      });
    });
  });

  describe("configuration", () => {
    it("should have correct default configuration", () => {
      const config = (validator as any).config;

      expect(config.playerContainerSelector).toBe(".MacPlayer");
      expect(config.iframeSelector).toBe("#playleft iframe");
      expect(config.validationTimeout).toBe(15000);
      expect(config.playbackTestTimeout).toBe(5000);
      expect(config.requirePlayButtonClick).toBe(false);
    });
  });
});
