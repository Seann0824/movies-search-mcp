import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";

// Apply the stealth plugin
chromium.use(stealth());

/**
 * A specialized validator for Gaze.run, which uses network interception
 * to confirm a video stream is loaded on a play page.
 */
export class GazeValidatorService {
  /**
   * Validates a Gaze play page URL by checking if a valid video stream request is made.
   * @param playPageUrl The URL of the Gaze play page (e.g., https://gaze.run/play/...).
   * @returns A promise that resolves to true if the page is valid, otherwise false.
   */
  public async isValid(playPageUrl: string): Promise<boolean> {
    if (!playPageUrl || !playPageUrl.includes("gaze.run/play")) {
      return false;
    }

    let browser;
    let context;
    let page: Page | undefined;

    try {
      browser = await chromium.launch({
        headless: true,
        channel: "chrome", // Use the system's Chrome browser instead of Chromium
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process", // 使用单进程模式，减少资源竞争
          "--disable-gpu",
          "--autoplay-policy=no-user-gesture-required",
        ],
      });

      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      });

      // --- 注入通用的视频验证脚本 ---
      const videoValidatorScriptPath = path.join(
        __dirname,
        "../sdk-fake/video-validator.js"
      );
      try {
        const videoValidatorScript = fs.readFileSync(
          videoValidatorScriptPath,
          "utf-8"
        );
        await context.addInitScript({ content: videoValidatorScript });
      } catch (fileError) {
        logger.error(
          `[GazeValidator] 无法读取或注入视频验证脚本: ${fileError}`
        );
        return false;
      }
      // --- END ---

      // --- Disable console.clear for all new pages in this context ---
      await context.addInitScript(() => {
        // @ts-ignore
        console.clear = () =>
          logger.log("[GazeValidator] console.clear() was called and blocked.");
      });

      page = await context.newPage();

      // --- Capture Console Errors ---
      page.on("pageerror", (error) => {
        logger.error(`[GazeValidator] Page Error: ${error.message}`);
      });

      const validationPromise = this.waitForValidationMessage(page);

      // Read the local fake detector script
      const fakeDetectorPath = path.join(
        __dirname,
        "../sdk-fake/gaze/devtools-detector.min.js"
      );

      let fakeDetectorScript;
      try {
        fakeDetectorScript = fs.readFileSync(fakeDetectorPath, "utf-8");
      } catch (fileError) {
        logger.error(
          `[GazeValidator] 无法读取检测脚本文件: ${fakeDetectorPath}`
        );
        return false;
      }

      // Intercept the original detector script and serve the local version instead
      await page.route("**/devtools-detector.min.js", (route) => {
        try {
          route.fulfill({
            status: 200,
            contentType: "application/javascript; charset=utf-8",
            body: fakeDetectorScript,
          });
        } catch (error) {
          logger.error(`[GazeValidator] 路由处理错误:`, error);
          route.continue();
        }
      });

      await page.goto(playPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // Wait for the player's big play button to become visible, then click it
      const playButtonLocator = page.locator("button.vjs-big-play-button");
      try {
        await playButtonLocator.waitFor({ state: "visible", timeout: 10000 });
        logger.log(
          "[GazeValidator] Play button is visible. Clicking to start playback."
        );
        await playButtonLocator.click({ timeout: 3000 });
      } catch (error) {
        logger.warn(
          "[GazeValidator] Could not find or click the play button. The video might autoplay or be structured differently."
        );
      }

      // 等待控制台消息的最终结果
      return await validationPromise;
    } catch (error) {
      logger.error(`[GazeValidator] Error validating ${playPageUrl}:`, error);
      return false;
    } finally {
      // 确保资源正确清理
      try {
        if (page && !page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        logger.error(`[GazeValidator] 关闭页面时出错:`, error);
      }

      try {
        if (context) {
          await context.close();
        }
      } catch (error) {
        logger.error(`[GazeValidator] 关闭上下文时出错:`, error);
      }

      try {
        if (browser) {
          await browser.close();
        }
      } catch (error) {
        logger.error(`[GazeValidator] 关闭浏览器时出错:`, error);
      }
    }
  }

  /**
   * Waits for a validation message from the injected script via the console.
   * @param page The Playwright page object.
   * @returns A promise that resolves to true for success, false for failure.
   */
  private waitForValidationMessage(page: Page): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.error(
          "[GazeValidator] Validation timed out after 15 seconds waiting for console message."
        );
        page.removeListener("console", consoleHandler);
        resolve(false);
      }, 15000); // Global timeout

      const consoleHandler = async (
        msg: import("playwright").ConsoleMessage
      ) => {
        const text = msg.text();
        if (text.includes("[validateVideoPlayability] success")) {
          logger.log("[GazeValidator] Success message captured from console.");
          clearTimeout(timeout);
          page.removeListener("console", consoleHandler);
          resolve(true);
        } else if (text.includes("[validateVideoPlayability] failed")) {
          logger.error(
            "[GazeValidator] Failure message captured from console."
          );
          clearTimeout(timeout);
          page.removeListener("console", consoleHandler);
          resolve(false);
        } else if (msg.type() === "error") {
          logger.error(`[GazeValidator] Console Error: ${text}`);
        }
      };

      page.on("console", consoleHandler);
    });
  }
}
