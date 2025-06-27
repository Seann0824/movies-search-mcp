import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { Page, Response } from "playwright";
import * as fs from "fs";
import * as path from "path";

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

    const browser = await chromium.launch({
      headless: false,
      channel: "chrome", // Use the system's Chrome browser instead of Chromium
    });
    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      });

      // --- Disable console.clear for all new pages in this context ---
      await context.addInitScript(() => {
        // @ts-ignore
        console.clear = () =>
          console.log(
            "[GazeValidator] console.clear() was called and blocked."
          );
      });

      const page = await context.newPage();

      // --- Capture Console Errors ---
      page.on("pageerror", (error) => {
        console.error(`[GazeValidator] Page Error: ${error.message}`);
      });
      page.on("console", async (msg) => {
        if (msg.type() === "error") {
          console.error(`[GazeValidator] Console Error: ${msg.text()}`);
        }
      });
      // --- END ---

      // Read the local fake detector script
      const fakeDetectorPath = path.join(
        __dirname,
        "../../src/sdk-fake/gaze/devtools-detector.min.js"
      );
      const fakeDetectorScript = fs.readFileSync(fakeDetectorPath, "utf-8");
      // Intercept the original detector script and serve the local version instead
      await page.route("**/devtools-detector.min.js", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/javascript; charset=utf-8",
          body: fakeDetectorScript,
        });
      });

      // Start listening for the target network response in the background
      const videoFoundPromise = this.waitForVideoElement(page);

      await page.goto(playPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // Wait for the player's big play button to become visible, then click it
      const playButtonLocator = page.locator("button.vjs-big-play-button");
      try {
        await playButtonLocator.waitFor({ state: "visible", timeout: 10000 });
        console.log(
          "[GazeValidator] Play button is visible. Clicking to start playback."
        );
        await playButtonLocator.click({ timeout: 3000 });
      } catch (error) {
        console.warn(
          "[GazeValidator] Could not find or click the play button. The video might autoplay or be structured differently."
        );
      }

      // Wait for the video element to have a valid blob src
      return await videoFoundPromise;
    } catch (error) {
      console.error(`[GazeValidator] Error validating ${playPageUrl}:`, error);
      return false;
    } finally {
      await browser.close();
    }
  }

  /**
   * Monitors the video element for a valid blob src URL, which indicates successful video loading.
   * This method returns a promise that resolves to true if a blob URL is found, otherwise false.
   */
  private waitForVideoElement(page: Page): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log(
          "[GazeValidator] Validation timed out. Video element with blob src not detected."
        );
        resolve(false);
      }, 30000); // 30-second overall timeout

      // Poll the video element every 500ms to check for blob src and playability
      const checkInterval = setInterval(async () => {
        try {
          const videoStatus: {
            src: string | null;
            readyState: number;
            duration: number;
            error: string | null;
          } = await page.evaluate(`
            (() => {
              const video = document.querySelector('video#gaze_video_html5_api');
              if (!video) return { src: null, readyState: 0, duration: 0, error: 'Video element not found' };
              
              return {
                src: video.src,
                readyState: video.readyState,
                duration: video.duration || 0,
                error: video.error ? video.error.message : null
              };
            })()
          `);

          // Check if we have a blob URL
          if (videoStatus.src && videoStatus.src.startsWith("blob:")) {
            console.log(`[GazeValidator] Found blob src: ${videoStatus.src}`);
            console.log(
              `[GazeValidator] Video readyState: ${videoStatus.readyState}, duration: ${videoStatus.duration}`
            );

            // Check for video errors
            if (videoStatus.error) {
              console.log(
                `[GazeValidator] Video error detected: ${videoStatus.error}`
              );
              clearTimeout(timeout);
              clearInterval(checkInterval);
              resolve(false);
              return;
            }

            // readyState >= 2 means we have enough data to start playing
            // readyState >= 3 means we can play through without stalling
            if (videoStatus.readyState >= 2 && videoStatus.duration > 0) {
              // Further verify by attempting to play the video briefly
              const playTestResult = await this.testVideoPlayback(page);
              if (playTestResult) {
                console.log(
                  `[GazeValidator] Success: Video is confirmed playable`
                );
                clearTimeout(timeout);
                clearInterval(checkInterval);
                resolve(true);
              } else {
                console.log(
                  `[GazeValidator] Video has blob src but failed playback test`
                );
                clearTimeout(timeout);
                clearInterval(checkInterval);
                resolve(false);
              }
            }
          }
        } catch (error) {
          // Continue polling even if there's an error
          console.log(`[GazeValidator] Error during video check: ${error}`);
        }
      }, 1000); // Check every 1 second for more thorough validation
    });
  }

  /**
   * Tests if the video can actually play by attempting to start playback and checking for progress.
   */
  private async testVideoPlayback(page: Page): Promise<boolean> {
    try {
      const playbackTest = await page.evaluate(`
        (() => {
          return new Promise((resolve) => {
            const video = document.querySelector('video#gaze_video_html5_api');
            if (!video) {
              resolve(false);
              return;
            }

            let hasProgressed = false;
            let initialTime = video.currentTime;
            
            const timeUpdateHandler = () => {
              if (video.currentTime > initialTime) {
                hasProgressed = true;
                video.removeEventListener('timeupdate', timeUpdateHandler);
                video.pause(); // Pause after confirming playback
                resolve(true);
              }
            };

            const errorHandler = () => {
              video.removeEventListener('timeupdate', timeUpdateHandler);
              video.removeEventListener('error', errorHandler);
              resolve(false);
            };

            // Set up event listeners
            video.addEventListener('timeupdate', timeUpdateHandler);
            video.addEventListener('error', errorHandler);

            // Try to play
            const playPromise = video.play();
            if (playPromise) {
              playPromise.catch(() => {
                video.removeEventListener('timeupdate', timeUpdateHandler);
                video.removeEventListener('error', errorHandler);
                resolve(false);
              });
            }

            // Timeout after 5 seconds if no progress
            setTimeout(() => {
              if (!hasProgressed) {
                video.removeEventListener('timeupdate', timeUpdateHandler);
                video.removeEventListener('error', errorHandler);
                video.pause();
                resolve(false);
              }
            }, 5000);
          });
        })()
      `);

      return playbackTest as boolean;
    } catch (error) {
      console.log(`[GazeValidator] Playback test error: ${error}`);
      return false;
    }
  }
}
