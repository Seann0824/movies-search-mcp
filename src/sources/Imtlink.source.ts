import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { Page } from "playwright";
import { BaseSource } from "./BaseSource";
import { SearchQuery, SearchResult } from "../types";

// Apply the stealth plugin
chromium.use(stealth());

export class ImtlinkSource extends BaseSource {
  name = "Imtlink";

  async find(query: SearchQuery): Promise<SearchResult[]> {
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

      // 搜索电影
      const searchResults = await this.searchMovies(page, query.title);

      if (searchResults.length === 0) {
        console.log(`[Imtlink] No movies found for "${query.title}"`);
        return [];
      }

      // 将详情页链接转换为播放页链接
      return searchResults.map((result) => ({
        ...result,
        url: this.convertToPlayUrl(result.url),
        source: this.name,
      }));
    } catch (error) {
      console.error("[Imtlink] An error occurred:", error);
      return [];
    } finally {
      await browser.close();
    }
  }

  private async searchMovies(
    page: Page,
    title: string
  ): Promise<SearchResult[]> {
    try {
      const searchUrl = `https://www.imtlink.com/vodsearch.html?wd=${encodeURIComponent(title)}`;

      console.log(`[Imtlink] Searching: ${searchUrl}`);

      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // 等待页面加载完成
      await page.waitForTimeout(2000);

      // 提取第一页的搜索结果
      const firstPageResults = await this.extractSearchResults(page);

      console.log(
        `[Imtlink] Found ${firstPageResults.length} results on first page`
      );

      // 检查是否有更多页面，并获取前几页的结果（限制为前3页以避免过多请求）
      const allResults = [...firstPageResults];
      const maxPages = 3; // 限制搜索前3页

      try {
        // 获取分页信息
        const pageInfo = await page.evaluate(() => {
          const totalEl = document.querySelector(".ewave-total");
          const nextPageLink = document.querySelector(
            '.ewave-page a[href*="/page/2.html"]'
          );

          return {
            total: totalEl ? parseInt(totalEl.textContent || "0") : 0,
            hasNextPage: nextPageLink !== null,
            nextPageUrl: nextPageLink
              ? nextPageLink.getAttribute("href")
              : null,
          };
        });

        if (
          pageInfo.hasNextPage &&
          pageInfo.total > firstPageResults.length &&
          allResults.length < 20
        ) {
          console.log(
            `[Imtlink] Found ${pageInfo.total} total results, fetching additional pages...`
          );

          for (let pageNum = 2; pageNum <= maxPages; pageNum++) {
            try {
              const pageUrl = `https://www.imtlink.com/vodsearch${encodeURIComponent(title)}/page/${pageNum}.html`;
              console.log(`[Imtlink] Fetching page ${pageNum}: ${pageUrl}`);

              await page.goto(pageUrl, {
                waitUntil: "domcontentloaded",
                timeout: 15000,
              });

              await page.waitForTimeout(1500);

              const pageResults = await this.extractSearchResults(page);
              console.log(
                `[Imtlink] Found ${pageResults.length} results on page ${pageNum}`
              );

              if (pageResults.length === 0) {
                break; // 没有更多结果，停止分页
              }

              allResults.push(...pageResults);

              // 如果已经获得足够的结果，停止分页
              if (allResults.length >= 20) {
                break;
              }
            } catch (pageError) {
              console.warn(
                `[Imtlink] Error fetching page ${pageNum}:`,
                pageError
              );
              break;
            }
          }
        }
      } catch (paginationError) {
        console.warn("[Imtlink] Error during pagination:", paginationError);
      }

      console.log(
        `[Imtlink] Total found ${allResults.length} results across all pages`
      );

      return allResults;
    } catch (error) {
      console.error("[Imtlink] Error searching movies:", error);
      return [];
    }
  }

  private async extractSearchResults(page: Page): Promise<SearchResult[]> {
    try {
      // 首先检查是否有搜索结果
      const hasResults = await page.evaluate(() => {
        const vodList = document.querySelector(".vod-list");
        return vodList !== null;
      });

      if (!hasResults) {
        console.log(
          "[Imtlink] No .vod-list container found - no search results"
        );
        return [];
      }

      // 获取分页信息
      const pageInfo = await page.evaluate(() => {
        const totalEl = document.querySelector(".ewave-total");
        const currentPageEl = document.querySelector(
          ".ewave-page .active a, .ewave-page .num"
        );

        return {
          total: totalEl ? parseInt(totalEl.textContent || "0") : 0,
          currentPage: currentPageEl
            ? currentPageEl.textContent?.trim() || "1"
            : "1",
        };
      });

      console.log(
        `[Imtlink] Page info - Total: ${pageInfo.total}, Current page: ${pageInfo.currentPage}`
      );

      // 使用正确的DOM结构提取搜索结果
      let results = await page.evaluate(() => {
        const results: Array<{ title: string; url: string; quality: string }> =
          [];

        // 查找 .vod-list ul.row 下的所有 li 项目
        const items = document.querySelectorAll(".vod-list ul.row li");

        items.forEach((item) => {
          // 在每个 li 中查找 .name h3 a 元素
          const titleEl = item.querySelector('.name h3 a[href*="/voddetail/"]');
          const qualityEl = item.querySelector(".item-status");

          if (titleEl) {
            const title =
              titleEl.textContent?.trim() ||
              titleEl.getAttribute("title") ||
              "";
            const url = titleEl.getAttribute("href") || "";
            const quality = qualityEl?.textContent?.trim() || "HD";

            if (title && url) {
              results.push({
                title: title,
                url: url.startsWith("http")
                  ? url
                  : `https://www.imtlink.com${url}`,
                quality: quality,
              });
            }
          }
        });

        return results;
      });

      console.log(`[Imtlink] Extracted ${results.length} results from DOM`);

      // 如果第一种方法没有结果，尝试备用方法
      if (results.length === 0) {
        console.log("[Imtlink] Trying fallback extraction method");

        results = await page.evaluate(() => {
          const results: Array<{
            title: string;
            url: string;
            quality: string;
          }> = [];
          const links = document.querySelectorAll('a[href*="/voddetail/"]');

          links.forEach((link) => {
            const title =
              link.textContent?.trim() || link.getAttribute("title") || "";
            const url = link.getAttribute("href") || "";

            if (title && url && title.length > 2) {
              // 尝试找到对应的质量信息
              const parentLi = link.closest("li");
              const qualityEl = parentLi?.querySelector(
                ".item-status, .pic-text, .status"
              );
              const quality = qualityEl?.textContent?.trim() || "HD";

              results.push({
                title: title,
                url: url.startsWith("http")
                  ? url
                  : `https://www.imtlink.com${url}`,
                quality: quality,
              });
            }
          });

          return results;
        });
      }

      // 过滤重复结果
      const uniqueResults = results.filter(
        (result, index, self) =>
          index === self.findIndex((r) => r.url === result.url)
      );

      return uniqueResults.map((result) => ({
        title: result.title,
        url: result.url,
        quality: result.quality,
        source: this.name,
      }));
    } catch (error) {
      console.error("[Imtlink] Error extracting search results:", error);
      return [];
    }
  }

  /**
   * 将详情页URL转换为播放页URL
   * 例如: /voddetail/161499.html -> /vodplay/161499-1-1.html
   */
  private convertToPlayUrl(detailUrl: string): string {
    try {
      // 从详情页URL中提取ID
      const match = detailUrl.match(/\/voddetail\/(\d+)\.html/);
      if (match) {
        const id = match[1];
        // 转换为播放页URL (默认第1季第1集)
        const playUrl = `https://www.imtlink.com/vodplay/${id}-1-1.html`;
        console.log(`[Imtlink] Converted ${detailUrl} -> ${playUrl}`);
        return playUrl;
      }

      // 如果已经是播放页URL，直接返回
      if (detailUrl.includes("/vodplay/")) {
        return detailUrl;
      }

      // 如果无法转换，返回原URL
      console.warn(`[Imtlink] Could not convert URL: ${detailUrl}`);
      return detailUrl;
    } catch (error) {
      console.error(`[Imtlink] Error converting URL ${detailUrl}:`, error);
      return detailUrl;
    }
  }
}
