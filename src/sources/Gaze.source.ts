import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { Page } from "playwright";
import { BaseSource } from "./BaseSource";
import { SearchQuery, SearchResult } from "../types";
import { logger } from "../utils/logger";

// Apply the stealth plugin
chromium.use(stealth());

interface GazeMovieItem {
  id: number;
  title: string;
  grade: string;
  cover_img: string;
  mid: string;
  definition: string;
}

interface GazeApiResponse {
  total: number;
  mlist: GazeMovieItem[];
  pages: number;
}

export class GazeSource extends BaseSource {
  name = "Gaze";

  async find(query: SearchQuery): Promise<SearchResult[]> {
    const browser = await chromium.launch({
      headless: true,
      channel: "chrome",
    });
    try {
      const context = await browser.newContext({
        // 伪装成真实的浏览器
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();

      // 新增步骤: 首先访问首页以获取 session cookies
      await page.goto("https://gaze.run/", { waitUntil: "domcontentloaded" });

      // 第一步: 调用 API 搜索电影
      const movies = await this.searchMovies(page, query.title);
      if (movies.length === 0) {
        logger.log(`[Gaze] No movies found for "${query.title}"`);
        return [];
      }

      // 返回结果，交由核心验证器进行下一步的可用性检查
      return movies.map((movie) => ({
        url: `https://gaze.run/play/${movie.mid}`,
        title: movie.title,
        quality: movie.definition,
        source: this.name,
      }));
    } catch (error) {
      logger.error("[Gaze] An error occurred:", error);
      return [];
    } finally {
      await browser.close();
    }
  }

  private async searchMovies(
    page: Page,
    title: string
  ): Promise<GazeMovieItem[]> {
    const searchUrl = "https://gaze.run/filter_movielist";

    // fetch API 在 Playwright 中可以携带当前浏览器的 cookies 和 user-agent
    const response = await page.evaluate(
      async ({ url, title }) => {
        const formData = new URLSearchParams();
        formData.append("mform", "all");
        formData.append("mcountry", "all");
        formData.append("tag_arr[]", "all");
        formData.append("page", "1");
        formData.append("sort", "updatetime");
        formData.append("album", "all");
        formData.append("title", title);
        formData.append("years", "all");

        const res = await fetch(url, {
          method: "POST",
          headers: {
            accept: "*/*",
            ba1d5a17569481a2: "a5627ccb35764f912f5afae6eafef72b",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest",
          },
          body: formData.toString(),
        });
        return res.json();
      },
      { url: searchUrl, title }
    );

    return (response as GazeApiResponse).mlist || [];
  }
}
