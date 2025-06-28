import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { Page } from "playwright";

// Apply the stealth plugin
chromium.use(stealth());

/**
 * 视频验证器配置接口
 */
export interface ValidatorConfig {
  /** 播放按钮选择器 */
  playButtonSelector?: string;
  /** 视频元素选择器 */
  videoSelector?: string;
  /** 播放器容器选择器 */
  playerContainerSelector?: string;
  /** iframe 选择器 */
  iframeSelector?: string;
  /** 验证超时时间（毫秒） */
  validationTimeout?: number;
  /** 播放测试超时时间（毫秒） */
  playbackTestTimeout?: number;
  /** 是否需要点击播放按钮 */
  requirePlayButtonClick?: boolean;
}

/**
 * 基础视频验证器类
 * 提供通用的视频验证逻辑，可被具体网站的验证器继承
 */
export abstract class BaseValidator {
  protected config: ValidatorConfig;

  constructor(config: ValidatorConfig) {
    this.config = {
      validationTimeout: 10000,
      playbackTestTimeout: 3000,
      requirePlayButtonClick: true,
      ...config,
    };
  }

  /**
   * 验证播放页面URL是否有效
   * @param playPageUrl 播放页面URL
   * @returns 是否有效
   */
  public async isValid(playPageUrl: string): Promise<boolean> {
    if (!this.isValidUrl(playPageUrl)) {
      return false;
    }

    const browser = await chromium.launch({
      headless: true,
      channel: "chrome",
    });

    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      });

      const page = await context.newPage();

      // 设置页面错误监听
      this.setupPageErrorHandling(page);

      // 应用网站特定的路由拦截
      await this.setupRouteInterception(page);

      // 开始监听视频元素
      const videoFoundPromise = this.waitForVideoElement(page);

      await page.goto(playPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // 点击播放按钮（如果需要）
      if (
        this.config.requirePlayButtonClick &&
        this.config.playButtonSelector
      ) {
        await this.clickPlayButton(page);
      }

      // 等待视频验证结果
      return await videoFoundPromise;
    } catch (error) {
      console.error(
        `[${this.constructor.name}] Error validating ${playPageUrl}:`,
        error
      );
      return false;
    } finally {
      await browser.close();
    }
  }

  /**
   * 检查URL是否有效（由子类实现）
   */
  protected abstract isValidUrl(url: string): boolean;

  /**
   * 设置路由拦截（由子类实现，可选）
   */
  protected async setupRouteInterception(page: Page): Promise<void> {
    // 默认不做任何拦截
  }

  /**
   * 设置页面错误处理
   */
  protected setupPageErrorHandling(page: Page): void {
    page.on("pageerror", (error) => {
      console.error(`[${this.constructor.name}] Page Error: ${error.message}`);
    });
    page.on("console", async (msg) => {
      if (msg.type() === "error") {
        console.error(
          `[${this.constructor.name}] Console Error: ${msg.text()}`
        );
      }
    });
  }

  /**
   * 点击播放按钮
   */
  protected async clickPlayButton(page: Page): Promise<void> {
    if (!this.config.playButtonSelector) return;

    try {
      const playButtonLocator = page.locator(this.config.playButtonSelector);
      await playButtonLocator.waitFor({ state: "visible", timeout: 10000 });
      console.log(
        `[${this.constructor.name}] Play button is visible. Clicking to start playback.`
      );
      await playButtonLocator.click({ timeout: 3000 });
    } catch (error) {
      console.warn(
        `[${this.constructor.name}] Could not find or click the play button. The video might autoplay or be structured differently.`
      );
    }
  }

  /**
   * 等待视频元素加载并验证
   */
  protected waitForVideoElement(page: Page): Promise<boolean> {
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
          `[${this.constructor.name}] Validation timed out after ${this.config.validationTimeout}ms. Video element not detected.`
        );
        resolveOnce(false);
      }, this.config.validationTimeout);

      // 每秒检查视频元素状态
      const checkInterval = setInterval(async () => {
        if (page.isClosed()) {
          console.log(
            `[${this.constructor.name}] Page is closed, stopping validation`
          );
          resolveOnce(false);
          return;
        }

        try {
          const isVideoReady = await this.checkVideoStatus(page);
          if (isVideoReady) {
            resolveOnce(true);
          }
        } catch (error) {
          console.error(
            `[${this.constructor.name}] Error checking video status:`,
            error
          );
        }
      }, 1000);
    });
  }

  /**
   * 检查视频状态（由子类实现）
   */
  protected abstract checkVideoStatus(page: Page): Promise<boolean>;

  /**
   * 测试视频播放（通用方法）
   */
  protected async testVideoPlayback(
    page: Page,
    videoSelector: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, this.config.playbackTestTimeout);

      page
        .evaluate(
          ({ selector }) => {
            const video = document.querySelector(selector) as HTMLVideoElement;
            if (!video) return Promise.reject("Video element not found");

            return new Promise((resolve, reject) => {
              const cleanup = () => {
                video.removeEventListener("playing", onPlaying);
                video.removeEventListener("error", onError);
              };

              const onPlaying = () => {
                cleanup();
                resolve(true);
              };

              const onError = () => {
                cleanup();
                reject("Video playback error");
              };

              video.addEventListener("playing", onPlaying);
              video.addEventListener("error", onError);

              video.play().catch(reject);
            });
          },
          { selector: videoSelector }
        )
        .then(() => {
          clearTimeout(timeout);
          resolve(true);
        })
        .catch((error) => {
          clearTimeout(timeout);
          console.log(
            `[${this.constructor.name}] Playback test failed: ${error}`
          );
          resolve(false);
        });
    });
  }
}
