import { Page, Frame, FrameLocator } from "playwright";
import { BaseValidator, ValidatorConfig } from "./base.validator";

/**
 * 神奇者网站视频验证器
 * 专门用于验证 shenqizhe.com 网站的视频播放页面
 */
export class ShenQiZheValidatorService extends BaseValidator {
  constructor() {
    const config: ValidatorConfig = {
      playerContainerSelector: ".MacPlayer",
      iframeSelector: "#playleft iframe",
      validationTimeout: 15000, // 神奇者网站可能需要更长时间加载
      playbackTestTimeout: 5000,
      requirePlayButtonClick: false, // 神奇者网站通常自动播放
    };
    super(config);
  }

  /**
   * 检查URL是否为有效的神奇者播放页面
   */
  protected isValidUrl(url: string): boolean {
    return url.includes("shenqizhe.com/vodplay/");
  }

  /**
   * 检查视频状态
   * 神奇者网站使用iframe播放器，需要特殊处理
   */
  protected async checkVideoStatus(page: Page): Promise<boolean> {
    try {
      // 首先检查播放器容器是否存在
      const playerExists = await page
        .locator(this.config.playerContainerSelector!)
        .isVisible();
      if (!playerExists) {
        return false;
      }

      // 检查iframe是否存在并已加载
      const iframeExists = await page
        .locator(this.config.iframeSelector!)
        .isVisible();
      if (!iframeExists) {
        return false;
      }

      // 获取iframe元素
      const iframe = await page.locator(this.config.iframeSelector!).first();

      // 检查iframe的src属性是否有效
      const iframeSrc = await iframe.getAttribute("src");
      if (!iframeSrc || iframeSrc.trim() === "") {
        return false;
      }

      console.log(`[ShenQiZheValidator] Found iframe with src: ${iframeSrc}`);

      // 尝试访问iframe内容来验证视频
      try {
        // 使用 frameLocator 来访问 iframe 内容
        const frameLocator = page.frameLocator(this.config.iframeSelector!);

        // 在iframe内查找视频元素
        const videoElementExists = await this.checkVideoInFrame(frameLocator);
        if (videoElementExists) {
          console.log("[ShenQiZheValidator] Video element found in iframe");
          return true;
        }
      } catch (iframeError) {
        console.log(
          `[ShenQiZheValidator] Iframe access failed: ${iframeError}`
        );
        // 如果无法访问iframe内容（可能是跨域），我们认为iframe存在且有src就是有效的
        if (
          iframeSrc.includes("/static/player/") ||
          iframeSrc.includes("player")
        ) {
          console.log(
            "[ShenQiZheValidator] Iframe appears to be a valid player based on src"
          );
          return true;
        }
      }

      // 最后的备用检查：确认页面上有播放相关的元素
      return await this.checkPlayerIndicators(page);
    } catch (error) {
      console.error(`[ShenQiZheValidator] Error in checkVideoStatus: ${error}`);
      return false;
    }
  }

  /**
   * 在iframe内查找视频元素
   */
  private async checkVideoInFrame(
    frameLocator: FrameLocator
  ): Promise<boolean> {
    try {
      // 常见的视频元素选择器
      const videoSelectors = [
        "video",
        ".dplayer-video video",
        ".video-js video",
        "[id*='video']",
        "[class*='video']",
      ];

      for (const selector of videoSelectors) {
        try {
          const videoLocator = frameLocator.locator(selector).first();
          const videoExists = await videoLocator.isVisible({ timeout: 2000 });
          if (videoExists) {
            console.log(
              `[ShenQiZheValidator] Found video element with selector: ${selector}`
            );
            return true;
          }
        } catch (selectorError) {
          // 继续尝试下一个选择器
          continue;
        }
      }

      return false;
    } catch (error) {
      console.log(
        `[ShenQiZheValidator] Error checking video in iframe: ${error}`
      );
      return false;
    }
  }

  /**
   * 检查页面上的播放器指示器
   */
  private async checkPlayerIndicators(page: Page): Promise<boolean> {
    try {
      // 检查是否有播放相关的JavaScript变量或元素
      const hasPlayerIndicators = await page.evaluate(() => {
        // 检查全局变量
        if (typeof (window as any).player_aaaa !== "undefined") {
          return true;
        }

        // 检查是否有播放链接
        const playLink = document.querySelector("#bfurl");
        if (playLink && playLink.getAttribute("href")) {
          return true;
        }

        // 检查是否有播放器相关的脚本
        const scripts = Array.from(document.querySelectorAll("script"));
        for (const script of scripts) {
          if (
            script.src &&
            (script.src.includes("player") || script.src.includes("dplayer"))
          ) {
            return true;
          }
        }

        return false;
      });

      if (hasPlayerIndicators) {
        console.log("[ShenQiZheValidator] Found player indicators on page");
        return true;
      }

      return false;
    } catch (error) {
      console.log(
        `[ShenQiZheValidator] Error checking player indicators: ${error}`
      );
      return false;
    }
  }
}
