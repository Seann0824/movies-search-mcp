#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { GazeSource } from "./sources/Gaze.source";
import { ShenQiZheSource } from "./sources/ShenQiZhe.source";
import { GazeValidatorService } from "./core/gaze.validator";
import { SearchQuery, SearchResult } from "./types/index";

dotenv.config();

/**
 * 电影搜索工具 MCP Server
 * 为 AI 提供搜索和验证电影资源的能力
 */
class MovieSearchMCPServer {
  private server: Server;
  private gazeSource: GazeSource;
  private shenQiZheSource: ShenQiZheSource;
  private gazeValidator: GazeValidatorService;

  constructor() {
    this.server = new Server(
      {
        name: "movie-search-tool",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.gazeSource = new GazeSource();
    this.shenQiZheSource = new ShenQiZheSource();
    this.gazeValidator = new GazeValidatorService();

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // 注册电影搜索工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_movie",
            description:
              "搜索电影或电视剧资源。返回未验证的搜索结果列表，包含标题、链接和质量信息。使用此工具获取候选资源后，请从结果中选择最匹配的链接，然后使用 validate_video_url 工具验证其可播放性。",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "电影或电视剧的标题",
                },
                type: {
                  type: "string",
                  enum: ["movie", "tv"],
                  description: "内容类型：movie（电影）或 tv（电视剧）",
                },
                season: {
                  type: "number",
                  minimum: 1,
                  description: "季数（仅限电视剧）",
                },
                episode: {
                  type: "number",
                  minimum: 1,
                  description: "集数（仅限电视剧）",
                },
              },
              required: ["title", "type"],
            },
          },
          {
            name: "validate_video_url",
            description:
              "验证特定视频链接的可播放性。接收一个视频播放页面的 URL，返回该链接是否可以正常播放。只有通过验证的链接才能确保用户可以观看。",
            inputSchema: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "要验证的视频播放页面 URL",
                },
              },
              required: ["url"],
            },
          },
        ],
      };
    });

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_movie": {
            const { title, type, season, episode } = args as {
              title: string;
              type: "movie" | "tv";
              season?: number;
              episode?: number;
            };

            console.error(`[MCP Server] 开始搜索: ${title} (${type})`);

            const query: SearchQuery = {
              title,
              type,
              ...(season && { season }),
              ...(episode && { episode }),
            };

            // 并行搜索所有源
            const sources = [this.gazeSource, this.shenQiZheSource];
            const searchPromises = sources.map((source) => source.find(query));
            const resultsFromAllSources = await Promise.all(searchPromises);

            // 合并并展平结果
            const searchResults = resultsFromAllSources.flat();

            if (searchResults.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        message: `未找到 "${title}" 的任何资源`,
                        results: [],
                        total: 0,
                        next_action: "请尝试使用不同的关键词重新搜索",
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            console.error(`[MCP Server] 找到 ${searchResults.length} 个资源`);

            // 返回结构化的搜索结果
            const structuredResults = {
              success: true,
              title: title,
              type: type,
              ...(season && { season }),
              ...(episode && { episode }),
              total: searchResults.length,
              results: searchResults.map((result, index) => ({
                id: index + 1,
                url: result.url,
                quality: result.quality,
                source: result.source,
                verified: false,
              })),
              next_action:
                "请从上述结果中选择最合适的链接，然后使用 validate_video_url 工具验证其可播放性",
            };

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(structuredResults, null, 2),
                },
              ],
            };
          }

          case "validate_video_url": {
            const { url } = args as { url: string };

            console.error(`[MCP Server] 开始验证视频: ${url}`);

            const isValid = await this.gazeValidator.isValid(url);

            const result = {
              success: true,
              url: url,
              valid: isValid,
              status: isValid ? "可播放" : "无法播放",
              message: isValid
                ? "视频链接验证成功，可以正常播放"
                : "视频链接验证失败，可能已失效或无法访问",
              timestamp: new Date().toISOString(),
            };

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`未知工具: ${name}`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`[MCP Server] 工具调用错误:`, error);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: errorMessage,
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🎬 电影搜索工具 MCP Server 已启动");
  }
}

// 启动服务器
const server = new MovieSearchMCPServer();
server.run().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
