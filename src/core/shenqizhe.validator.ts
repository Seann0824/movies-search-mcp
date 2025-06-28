import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { Page, FrameLocator } from "playwright";
import { logger } from "../utils/logger";

// Apply the stealth plugin
chromium.use(stealth());

/**
 * 神奇者网站视频验证器
 * 专门用于验证 shenqizhe.com 网站的视频播放页面
 */
export class ShenQiZheValidatorService {
  /**
   * 验证 ShenQiZhe 播放页面URL
   * @param playPageUrl ShenQiZhe播放页面URL (例如: https://www.shenqizhe.com/vodplay/161499-1-1.html)
   * @returns 如果页面有效则返回true，否则返回false
   */
  public async isValid(playPageUrl: string): Promise<boolean> {
    if (!playPageUrl || !playPageUrl.includes("shenqizhe.com/vodplay/")) {
      return false;
    }

    const browser = await chromium.launch({
      headless: true,
      channel: "chrome", // 使用系统的Chrome浏览器
    });

    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      });

      const page = await context.newPage();

      // 捕获控制台错误
      page.on("pageerror", (error) => {
        logger.error(`[ShenQiZheValidator] Page Error: ${error.message}`);
      });
      page.on("console", async (msg) => {
        if (msg.type() === "error") {
          logger.error(`[ShenQiZheValidator] Console Error: ${msg.text()}`);
        }
      });

      // 开始监听视频元素
      const videoFoundPromise = this.waitForVideoElement(page);

      await page.goto(playPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // 等待视频验证结果
      return await videoFoundPromise;
    } catch (error) {
      logger.error(
        `[ShenQiZheValidator] Error validating ${playPageUrl}:`,
        error
      );
      return false;
    } finally {
      await browser.close();
    }
  }

  /**
   * 监听视频元素，检查是否可以正常播放
   */
  private waitForVideoElement(page: Page): Promise<boolean> {
    return new Promise((resolve) => {
      let isResolved = false;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (checkInterval) clearInterval(checkInterval);
      };

      const resolveOnce = (result: boolean) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve(result);
        }
      };

      const timeout = setTimeout(() => {
        logger.log(
          "[ShenQiZheValidator] Validation timed out after 15 seconds. Video element not detected."
        );
        resolveOnce(false);
      }, 15000); // 15秒超时

      // 每秒检查一次视频状态
      const checkInterval = setInterval(async () => {
        // 检查页面是否已关闭
        if (page.isClosed()) {
          logger.log(
            "[ShenQiZheValidator] Page is closed, stopping validation"
          );
          resolveOnce(false);
          return;
        }

        try {
          const videoStatus = await this.checkVideoStatus(page);
          if (videoStatus) {
            logger.log("[ShenQiZheValidator] Video validation successful");
            resolveOnce(true);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes(
              "Target page, context or browser has been closed"
            )
          ) {
            logger.log(
              "[ShenQiZheValidator] Page closed during validation, stopping"
            );
            resolveOnce(false);
            return;
          }
          // 其他错误继续轮询
          logger.log(
            `[ShenQiZheValidator] Error during video check: ${errorMessage}`
          );
        }
      }, 1000); // 每秒检查一次
    });
  }

  /**
   * 检查视频状态
   * 神奇者网站使用iframe播放器，需要特殊处理
   */
  private async checkVideoStatus(page: Page): Promise<boolean> {
    try {
      // 首先检查播放器容器是否存在
      const playerExists = await page.locator(".MacPlayer").isVisible();
      if (!playerExists) {
        return false;
      }

      // 检查iframe是否存在并已加载
      const iframeExists = await page.locator("#playleft iframe").isVisible();
      if (!iframeExists) {
        return false;
      }

      // 获取iframe元素
      const iframe = await page.locator("#playleft iframe").first();

      // 检查iframe的src属性是否有效
      const iframeSrc = await iframe.getAttribute("src");
      if (!iframeSrc || iframeSrc.trim() === "") {
        return false;
      }

      logger.log(`[ShenQiZheValidator] Found iframe with src: ${iframeSrc}`);

      // 尝试访问iframe内容来验证视频
      try {
        // 使用 frameLocator 来访问 iframe 内容
        const frameLocator = page.frameLocator("#playleft iframe");

        // 在iframe内查找视频元素
        const videoElementExists = await this.checkVideoInFrame(frameLocator);
        if (videoElementExists) {
          logger.log("[ShenQiZheValidator] Video element found in iframe");
          return true;
        }
      } catch (iframeError) {
        logger.log(`[ShenQiZheValidator] Iframe access failed: ${iframeError}`);
        // 如果无法访问iframe内容（可能是跨域），我们认为iframe存在且有src就是有效的
        if (
          iframeSrc.includes("/static/player/") ||
          iframeSrc.includes("player")
        ) {
          logger.log(
            "[ShenQiZheValidator] Iframe appears to be a valid player based on src"
          );
          return true;
        }
      }

      // 最后的备用检查：确认页面上有播放相关的元素
      return await this.checkPlayerIndicators(page);
    } catch (error) {
      logger.error("[ShenQiZheValidator] Error in checkVideoStatus:", error);
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
            logger.log(
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
      logger.log(
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
        logger.log("[ShenQiZheValidator] Found player indicators on page");
        return true;
      }

      return false;
    } catch (error) {
      logger.log(
        `[ShenQiZheValidator] Error checking player indicators: ${error}`
      );
      return false;
    }
  }
}
