import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { BaseSource } from "./BaseSource";
import { SearchQuery, SearchResult } from "../types";
import { logger } from "../utils/logger";

chromium.use(stealth());

export class ShenQiZheSource extends BaseSource {
  name = "ShenQiZhe";
  private domain = "https://www.shenqizhe.com";

  async find(query: SearchQuery): Promise<SearchResult[]> {
    const browser = await chromium.launch({
      headless: true,
      channel: "chrome",
    });
    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();

      const searchUrl = `${this.domain}/vodsearch.html?wd=${encodeURIComponent(
        query.title
      )}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

      const finalResults = await page.$$eval(
        ".module-search-item",
        (items, domain) => {
          return Array.from(items)
            .map((item) => {
              const titleElement = item.querySelector(
                ".video-info-header h3 a"
              );
              const urlElement = item.querySelector(
                ".video-info-footer a.btn-important"
              );
              const qualityElement = item.querySelector(
                ".video-info-header a.video-serial"
              );

              const title = titleElement
                ? titleElement.getAttribute("title")
                : null;
              const relativeUrl = urlElement
                ? urlElement.getAttribute("href")
                : null;
              const quality = qualityElement
                ? qualityElement.textContent?.trim()
                : null;

              if (!title || !relativeUrl) {
                return null;
              }

              return {
                url: domain + relativeUrl,
                title: title,
                quality: quality || "Unknown",
              };
            })
            .filter((r) => r !== null);
        },
        this.domain
      );

      return finalResults.map(
        (r) =>
          ({
            ...r,
            source: this.name,
          }) as SearchResult
      );
    } catch (error) {
      logger.error(`[${this.name}] An error occurred:`, error);
      return [];
    } finally {
      await browser.close();
    }
  }
}
