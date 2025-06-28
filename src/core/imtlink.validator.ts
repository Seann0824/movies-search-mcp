import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { Page } from "playwright";

// Apply the stealth plugin
chromium.use(stealth());

/**
 * Imtlink网站的视频验证器
 * 专门用于验证 imtlink.com 播放页面的可用性
 */
export class ImtlinkValidatorService {
  /**
   * 验证 Imtlink 播放页面URL
   * @param playPageUrl Imtlink播放页面URL (例如: https://www.imtlink.com/vodplay/161499-1-1.html)
   * @returns 如果页面有效则返回true，否则返回false
   */
  public async isValid(playPageUrl: string): Promise<boolean> {
    if (!playPageUrl || !playPageUrl.includes("imtlink.com/vodplay/")) {
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

      // 设置路由拦截以阻止广告和不必要的资源
      await this.setupRouteInterception(page);

      // 开始监听视频元素
      const videoFoundPromise = this.waitForVideoElement(page);

      await page.goto(playPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // 等待视频验证结果
      return await videoFoundPromise;
    } catch (error) {
      console.error(
        `[ImtlinkValidator] Error validating ${playPageUrl}:`,
        error
      );
      return false;
    } finally {
      await browser.close();
    }
  }

  /**
   * 设置路由拦截以阻止广告和不必要的资源
   */
  private async setupRouteInterception(page: Page): Promise<void> {
    await page.route("**/*", (route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();

      // 阻止广告和追踪
      if (
        url.includes("google-analytics") ||
        url.includes("googletagmanager") ||
        url.includes("doubleclick") ||
        url.includes("googlesyndication") ||
        resourceType === "image" ||
        resourceType === "font"
      ) {
        route.abort();
        return;
      }

      route.continue();
    });
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
        console.log(
          "[ImtlinkValidator] Validation timed out after 15 seconds. Video element not detected."
        );
        resolveOnce(false);
      }, 15000); // 15秒超时

      // 每2秒检查一次视频状态
      const checkInterval = setInterval(async () => {
        // 检查页面是否已关闭
        if (page.isClosed()) {
          console.log("[ImtlinkValidator] Page is closed, stopping validation");
          resolveOnce(false);
          return;
        }

        try {
          const videoStatus = await this.checkVideoStatus(page);
          if (videoStatus) {
            console.log("[ImtlinkValidator] Video validation successful");
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
            console.log(
              "[ImtlinkValidator] Page closed during validation, stopping"
            );
            resolveOnce(false);
            return;
          }
          // 其他错误继续轮询
          console.log(
            `[ImtlinkValidator] Error during video check: ${errorMessage}`
          );
        }
      }, 2000); // 每2秒检查一次
    });
  }

  /**
   * 检查视频状态 - 基于iframe存在性而非内容访问
   */
  private async checkVideoStatus(page: Page): Promise<boolean> {
    try {
      // 1. 首先检查 MacPlayer 容器是否存在
      const macPlayerExists = await page.locator(".MacPlayer").isVisible();
      if (!macPlayerExists) {
        console.log("[ImtlinkValidator] MacPlayer container not found");
        return false;
      }

      // 2. 检查 playleft 区域的 iframe 是否存在
      const playLeftIframe = await page.locator("#playleft iframe").isVisible();
      if (!playLeftIframe) {
        console.log("[ImtlinkValidator] #playleft iframe not found");
        return false;
      }

      // 3. 获取iframe的src属性
      const iframe = await page.locator("#playleft iframe").first();
      const iframeSrc = await iframe.getAttribute("src");
      if (!iframeSrc || iframeSrc.trim() === "") {
        console.log("[ImtlinkValidator] Iframe has no src");
        return false;
      }

      console.log(`[ImtlinkValidator] Found iframe with src: ${iframeSrc}`);

      // 4. 验证iframe src是否为有效的播放器路径
      if (this.isValidPlayerIframeSrc(iframeSrc)) {
        console.log("[ImtlinkValidator] Valid player iframe detected");

        // 5. 等待iframe加载完成（给播放器一些时间初始化）
        await page.waitForTimeout(3000);

        // 6. 检查页面上的JavaScript播放器配置
        const hasPlayerConfig = await this.checkPlayerConfiguration(page);
        if (hasPlayerConfig) {
          console.log("[ImtlinkValidator] Found valid player configuration");
          return true;
        }

        // 7. 即使没有找到JavaScript配置，如果iframe存在且路径正确，也认为是有效的
        console.log(
          "[ImtlinkValidator] Iframe appears valid based on src path"
        );
        return true;
      }

      console.log(
        "[ImtlinkValidator] Iframe src does not appear to be a valid player"
      );
      return false;
    } catch (error) {
      console.error("[ImtlinkValidator] Error in checkVideoStatus:", error);
      return false;
    }
  }

  /**
   * 验证iframe src是否为有效的播放器路径
   */
  private isValidPlayerIframeSrc(src: string): boolean {
    // 检查是否为相对路径的播放器
    if (src.includes("/static/player/dplayer.html")) {
      return true;
    }

    // 检查其他可能的播放器路径
    if (src.includes("/static/player/") && src.includes("player")) {
      return true;
    }

    // 检查是否包含常见的播放器标识
    if (
      src.includes("dplayer") ||
      src.includes("player.html") ||
      src.includes("video.html")
    ) {
      return true;
    }

    return false;
  }

  /**
   * 检查页面上的播放器配置
   */
  private async checkPlayerConfiguration(page: Page): Promise<boolean> {
    try {
      const hasPlayerConfig = await page.evaluate(() => {
        // 检查全局播放器变量
        const win = window as any;

        // 检查 player_aaaa 变量
        if (typeof win.player_aaaa !== "undefined" && win.player_aaaa?.url) {
          console.log("Found video URL in player_aaaa:", win.player_aaaa.url);
          return true;
        }

        // 检查其他可能的播放器配置
        if (typeof win.MacPlayerConfig !== "undefined") {
          console.log("Found MacPlayerConfig");
          return true;
        }

        // 检查是否有播放链接
        const playLink = document.querySelector("#bfurl");
        if (playLink && playLink.getAttribute("href")) {
          console.log("Found play link");
          return true;
        }

        // 检查是否有播放器相关的脚本
        const scripts = Array.from(document.querySelectorAll("script"));
        for (const script of scripts) {
          if (
            script.src &&
            (script.src.includes("player") || script.src.includes("dplayer"))
          ) {
            console.log("Found player script:", script.src);
            return true;
          }

          // 检查内联脚本中的播放器配置
          if (
            script.textContent &&
            (script.textContent.includes("player_aaaa") ||
              script.textContent.includes("MacPlayerConfig") ||
              script.textContent.includes("dplayer"))
          ) {
            console.log("Found player configuration in script");
            return true;
          }
        }

        return false;
      });

      return hasPlayerConfig;
    } catch (error) {
      console.log(
        `[ImtlinkValidator] Error checking player configuration: ${error}`
      );
      return false;
    }
  }
}
