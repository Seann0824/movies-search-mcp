import { ShenQiZheSource } from "./ShenQiZhe.source";
import { SearchQuery } from "../types";
import { chromium } from "playwright-extra";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

// Read the mock HTML file once
const htmlContent = fs.readFileSync(
  path.resolve(__dirname, "../../movies-result.html"),
  "utf-8"
);

// Mock playwright-extra
jest.mock("playwright-extra", () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue(undefined),
          $$eval: jest
            .fn()
            .mockImplementation((selector, pageFunction, domain) => {
              // Fake the DOM evaluation
              const dom = new JSDOM(htmlContent);
              const items = dom.window.document.querySelectorAll(selector);
              return pageFunction(items, domain);
            }),
        }),
      }),
      close: jest.fn(),
    }),
    use: jest.fn(),
  },
}));

describe("ShenQiZheSource Unit Test", () => {
  let shenQiZheSource: ShenQiZheSource;

  beforeEach(() => {
    shenQiZheSource = new ShenQiZheSource();
  });

  it("should parse movie results from HTML correctly", async () => {
    const query: SearchQuery = {
      title: "小黄人",
      type: "movie",
    };
    const results = await shenQiZheSource.find(query);
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);

    const firstResult = results[0];
    expect(firstResult.title).toBe("小黄人大眼萌");
    expect(firstResult.url).toBe(
      "https://www.shenqizhe.com/vodplay/69958-1-1.html"
    );
    expect(firstResult.quality).toBe("HD");
    expect(firstResult.source).toBe("ShenQiZhe");
  });

  it("should handle empty search results", async () => {
    // Mock the $$eval to return an empty array
    (chromium.launch as jest.Mock).mockResolvedValueOnce({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue(undefined),
          $$eval: jest.fn().mockResolvedValue([]),
        }),
      }),
      close: jest.fn(),
    });

    shenQiZheSource = new ShenQiZheSource();

    const query: SearchQuery = {
      title: "a-movie-that-does-not-exist",
      type: "movie",
    };
    const results = await shenQiZheSource.find(query);

    expect(results).toEqual([]);
  });
});
