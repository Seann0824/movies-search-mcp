import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { Page } from "playwright";
import path from "path";
import fs from "fs";
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

    let browser;
    let context;
    let page;

    try {
      browser = await chromium.launch({
        headless: true,
        channel: "chrome", // 使用系统的Chrome浏览器
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process", // 使用单进程模式，减少资源竞争
          "--disable-gpu",
        ],
      });

      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      });

      page = await context.newPage();

      // 读取两种播放器的检测脚本
      const videojsDetectorPath = path.join(
        __dirname,
        "../sdk-fake/shenqizhan/videojs.html"
      );
      const dplayerDetectorPath = path.join(
        __dirname,
        "../sdk-fake/imlink/dplayer.html"
      );

      let videojsDetectorScript, dplayerDetectorScript;
      try {
        videojsDetectorScript = fs.readFileSync(videojsDetectorPath, "utf-8");
        dplayerDetectorScript = fs.readFileSync(dplayerDetectorPath, "utf-8");
      } catch (fileError) {
        logger.error(`[ShenQiZheValidator] 无法读取检测脚本文件:`, fileError);
        return false;
      }

      // 调试信息
      logger.debug("本地 videojs.html 文件路径:", videojsDetectorPath);
      logger.debug("本地 dplayer.html 文件路径:", dplayerDetectorPath);
      logger.debug("VideoJS脚本长度:", videojsDetectorScript.length);
      logger.debug("DPlayer脚本长度:", dplayerDetectorScript.length);

      // 拦截Video.js播放器脚本
      await page.route("**/videojs.html", (route) => {
        try {
          route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: videojsDetectorScript,
          });
        } catch (error) {
          logger.error(`[ShenQiZheValidator] 路由处理错误:`, error);
          route.continue();
        }
      });

      // 拦截DPlayer播放器脚本
      await page.route("**/dplayer.html", (route) => {
        try {
          route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: dplayerDetectorScript,
          });
        } catch (error) {
          logger.error(`[ShenQiZheValidator] 路由处理错误:`, error);
          route.continue();
        }
      });

      // 拦截通用播放器路径
      await page.route("**/static/player/**", (route) => {
        try {
          const url = route.request().url();
          if (url.includes("videojs.html") || url.includes("video.js")) {
            route.fulfill({
              status: 200,
              contentType: "text/html; charset=utf-8",
              body: videojsDetectorScript,
            });
          } else if (url.includes("dplayer.html") || url.includes("dplayer")) {
            route.fulfill({
              status: 200,
              contentType: "text/html; charset=utf-8",
              body: dplayerDetectorScript,
            });
          } else if (url.includes("player.html")) {
            // 默认使用VideoJS脚本
            route.fulfill({
              status: 200,
              contentType: "text/html; charset=utf-8",
              body: videojsDetectorScript,
            });
          } else {
            route.continue();
          }
        } catch (error) {
          logger.error(`[ShenQiZheValidator] 路由处理错误:`, error);
          route.continue();
        }
      });

      // 捕获控制台错误
      page.on("pageerror", (error) => {
        logger.error(`[ShenQiZheValidator] Page Error: ${error.message}`);
      });
      page.on("console", async (msg) => {
        if (msg.type() === "error") {
          logger.error(`[ShenQiZheValidator] Console Error: ${msg.text()}`);
        }
      });

      // 设置 VIDEO_STATUS 消息监听器
      const videoFoundPromise = this.waitForVideoStatusMessage(page);

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
      // 确保资源正确清理
      try {
        if (page && !page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        logger.error(`[ShenQiZheValidator] 关闭页面时出错:`, error);
      }

      try {
        if (context) {
          await context.close();
        }
      } catch (error) {
        logger.error(`[ShenQiZheValidator] 关闭上下文时出错:`, error);
      }

      try {
        if (browser) {
          await browser.close();
        }
      } catch (error) {
        logger.error(`[ShenQiZheValidator] 关闭浏览器时出错:`, error);
      }
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
      let timeout: NodeJS.Timeout;

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

      // 15秒超时
      timeout = setTimeout(() => {
        logger.log(
          "[ShenQiZheValidator] 15秒内未收到可播放的视频状态消息，验证失败"
        );
        resolveOnce(false);
      }, 15000);

      // 监听控制台消息，捕获iframe内的视频状态
      consoleListener = (msg: any) => {
        // 检查页面是否已关闭
        if (page.isClosed()) {
          logger.log("[ShenQiZheValidator] 页面已关闭，停止监听");
          resolveOnce(false);
          return;
        }

        try {
          const text = msg.text();

          // 监听VideoJS播放器的视频可播放性日志
          if (text.includes("[VideoJS] 视频可播放性: true")) {
            logger.log(
              "[ShenQiZheValidator] 检测到VideoJS视频可播放，验证成功"
            );
            resolveOnce(true);
            return;
          }

          // 监听DPlayer播放器的视频可播放性日志
          if (text.includes("[DPlayer] 视频可播放性: true")) {
            logger.log(
              "[ShenQiZheValidator] 检测到DPlayer视频可播放，验证成功"
            );
            resolveOnce(true);
            return;
          }

          // 监听VideoJS发送的消息日志（备用方案）
          if (text.includes("[VideoJS] 已发送消息给父页面:")) {
            try {
              const messageMatch = text.match(/\{.*\}/);
              if (messageMatch) {
                const messageData = JSON.parse(messageMatch[0]);
                if (messageData.isPlayable) {
                  logger.log(
                    "[ShenQiZheValidator] 从VideoJS postMessage检测到视频可播放"
                  );
                  resolveOnce(true);
                  return;
                }
              }
            } catch (error) {
              // 忽略解析错误
            }
          }

          // 监听DPlayer发送的消息日志（备用方案）
          if (text.includes("[DPlayer] 已发送消息给父页面:")) {
            try {
              const messageMatch = text.match(/\{.*\}/);
              if (messageMatch) {
                const messageData = JSON.parse(messageMatch[0]);
                if (messageData.isPlayable) {
                  logger.log(
                    "[ShenQiZheValidator] 从DPlayer postMessage检测到视频可播放"
                  );
                  resolveOnce(true);
                  return;
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
                  "[ShenQiZheValidator] 从VIDEO_STATUS消息检测到视频可播放"
                );
                resolveOnce(true);
                return;
              }
            } catch (error) {
              // 忽略解析错误
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes(
              "Target page, context or browser has been closed"
            ) ||
            errorMessage.includes("Page closed") ||
            errorMessage.includes("cdpSession.send")
          ) {
            logger.log("[ShenQiZheValidator] 页面已关闭，停止监听");
            resolveOnce(false);
            return;
          }
          logger.error("[ShenQiZheValidator] 处理控制台消息时出错:", error);
        }
      };

      page.on("console", consoleListener);

      // 注入消息监听器到页面（作为备用）
      page
        .addInitScript(() => {
          console.log("[ShenQiZheValidator] 初始化消息监听器");

          window.addEventListener("message", (event) => {
            console.log("[ShenQiZheValidator] 收到postMessage:", event.data);

            if (event.data && event.data.type === "VIDEO_STATUS") {
              console.log("[ShenQiZheValidator] 收到视频状态消息:", event.data);
              // 将消息发送到控制台，这样我们可以在Node.js端捕获
              console.log("VIDEO_STATUS_RESULT:" + JSON.stringify(event.data));
            }
          });

          // 定期检查是否有iframe并尝试通信
          const checkInterval = setInterval(() => {
            try {
              const iframe = document.querySelector(
                "#playleft iframe"
              ) as HTMLIFrameElement;
              if (iframe && iframe.contentWindow) {
                console.log("[ShenQiZheValidator] 检测到iframe，尝试通信");
              }
            } catch (error) {
              console.log("[ShenQiZheValidator] 检查iframe时出错:", error);
              clearInterval(checkInterval);
            }
          }, 2000);

          // 15秒后清理定时器
          setTimeout(() => {
            clearInterval(checkInterval);
          }, 15000);
        })
        .catch((error) => {
          logger.error("[ShenQiZheValidator] 注入脚本时出错:", error);
          resolveOnce(false);
        });
    });
  }
}
