import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { Page } from "playwright";
import path from "path";
import fs from "fs";
import { logger } from "../utils/logger";

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
      headless: true, // 启用有头模式以便调试
      channel: "chrome", // 使用系统的Chrome浏览器
    });

    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      });

      const page = await context.newPage();

      // Read the local fake detector script
      const fakeDetectorPath = path.join(
        __dirname,
        "../../src/sdk-fake/imlink/dplayer.html"
      );

      const fakeDetectorScript = fs.readFileSync(fakeDetectorPath, "utf-8");

      // 调试断点：检查本地文件内容
      logger.debug("本地 dplayer.html 文件路径:", fakeDetectorPath);
      logger.debug("文件内容长度:", fakeDetectorScript.length);
      logger.debug(
        "文件内容预览:",
        fakeDetectorScript.substring(0, 200) + "..."
      );

      // 您可以在这里设置断点进行调试

      // Intercept the original detector script and serve the local version instead
      await page.route("**/dplayer.html", (route) => {
        route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: fakeDetectorScript,
        });
      });

      // 设置 VIDEO_STATUS 消息监听器
      const videoStatusPromise = this.waitForVideoStatusMessage(page);

      await page.goto(playPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // 等待视频验证结果（10秒内）
      return await videoStatusPromise;
    } catch (error) {
      logger.error(
        `[ImtlinkValidator] Error validating ${playPageUrl}:`,
        error
      );
      return false;
    } finally {
      await browser.close();
    }
  }

  /**
   * 等待来自iframe的VIDEO_STATUS消息
   */
  private waitForVideoStatusMessage(page: Page): Promise<boolean> {
    return new Promise((resolve) => {
      let isResolved = false;
      let messageListener: any;
      let consoleListener: any;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (messageListener) {
          page.removeListener("console", messageListener);
        }
        if (consoleListener) {
          page.removeListener("console", consoleListener);
        }
      };

      const resolveOnce = (result: boolean) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve(result);
        }
      };

      // 10秒超时
      const timeout = setTimeout(() => {
        logger.log(
          "[ImtlinkValidator] 10秒内未收到可播放的视频状态消息，验证失败"
        );
        resolveOnce(false);
      }, 10000);

      // 监听控制台消息，捕获iframe内的视频状态
      consoleListener = (msg: any) => {
        const text = msg.text();

        // 监听视频可播放性的直接日志
        if (text.includes("[dplayer] 视频可播放性: true")) {
          logger.log("[ImtlinkValidator] 检测到视频可播放，验证成功");
          resolveOnce(true);
        }

        // 监听dplayer发送的消息日志（备用方案）
        if (text.includes("[dplayer] 已发送消息给父页面:")) {
          try {
            const messageMatch = text.match(/\{.*\}/);
            if (messageMatch) {
              const messageData = JSON.parse(messageMatch[0]);
              if (messageData.isPlayable) {
                logger.log("[ImtlinkValidator] 从postMessage检测到视频可播放");
                resolveOnce(true);
              }
            }
          } catch (error) {
            // 忽略解析错误
          }
        }

        // 监听VIDEO_STATUS_RESULT格式的消息（备用方案）
        if (text.startsWith("VIDEO_STATUS_RESULT:")) {
          try {
            const data = JSON.parse(text.replace("VIDEO_STATUS_RESULT:", ""));
            if (data.isPlayable) {
              logger.log(
                "[ImtlinkValidator] 从VIDEO_STATUS消息检测到视频可播放"
              );
              resolveOnce(true);
            }
          } catch (error) {
            // 忽略解析错误
          }
        }
      };

      page.on("console", consoleListener);

      // 方法2：注入消息监听器到页面（作为备用）
      page.addInitScript(() => {
        logger.log("[ImtlinkValidator] 初始化消息监听器");

        window.addEventListener("message", (event) => {
          logger.log("[ImtlinkValidator] 收到postMessage:", event.data);

          if (event.data && event.data.type === "VIDEO_STATUS") {
            logger.log("[ImtlinkValidator] 收到视频状态消息:", event.data);
            // 将消息发送到控制台，这样我们可以在Node.js端捕获
            logger.log("VIDEO_STATUS_RESULT:" + JSON.stringify(event.data));
          }
        });

        // 定期检查是否有iframe并尝试通信
        setInterval(() => {
          const iframe = document.querySelector(
            "#playleft iframe"
          ) as HTMLIFrameElement;
          if (iframe && iframe.contentWindow) {
            logger.log("[ImtlinkValidator] 检测到iframe，尝试通信");
          }
        }, 2000);
      });
    });
  }
}
