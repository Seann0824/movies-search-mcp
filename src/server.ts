import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { GazeSource } from "./sources/Gaze.source";
import { GazeValidatorService } from "./core/gaze.validator";
import { SearchQuery, SearchResult } from "./types";

dotenv.config();

/**
 * 电影搜索工具 MCP Server
 * 为 AI 提供搜索和验证电影资源的能力
 */
class MovieSearchMCPServer {
  private server: Server;
  private gazeSource: GazeSource;
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
    this.gazeValidator = new GazeValidatorService();

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // 注册工具列表处理器
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_movie",
            description: "搜索电影或电视剧资源，返回视频链接列表（不进行验证）",
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
                  description: "季数（仅限电视剧）",
                  minimum: 1,
                },
                episode: {
                  type: "number",
                  description: "集数（仅限电视剧）",
                  minimum: 1,
                },
              },
              required: ["title", "type"],
            },
          },
          {
            name: "validate_video_url",
            description: "验证视频链接是否可播放",
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

    // 注册工具调用处理器
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        const { name, arguments: args } = request.params;

        try {
          switch (name) {
            case "search_movie":
              return await this.handleMovieSearch(args as any);
            case "validate_video_url":
              return await this.handleVideoValidation(args as any);
            default:
              throw new Error(`未知的工具: ${name}`);
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `错误: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  private async handleMovieSearch(args: {
    title: string;
    type: "movie" | "tv";
    season?: number;
    episode?: number;
  }) {
    const { title, type, season, episode } = args;

    if (!title || !type) {
      throw new Error("标题和类型是必需的参数");
    }

    const query: SearchQuery = {
      title,
      type,
      ...(season && { season }),
      ...(episode && { episode }),
    };

    console.log(`[MCP Server] 开始搜索: ${JSON.stringify(query)}`);

    // 搜索所有潜在的播放页面（不进行验证）
    const searchResults = await this.gazeSource.find(query);

    if (searchResults.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `未找到 "${title}" 的任何资源。请尝试使用不同的关键词。`,
          },
        ],
      };
    }

    console.log(`[MCP Server] 找到 ${searchResults.length} 个资源`);

    // 格式化结果 - 直接返回所有搜索结果
    const resultText =
      `🎬 搜索结果: "${title}"\n\n` +
      `📋 找到 ${searchResults.length} 个资源（未验证可播放性）:\n\n` +
      searchResults
        .map(
          (result, index) =>
            `${index + 1}. 【${result.quality}】${result.url}\n   来源: ${result.source}`
        )
        .join("\n\n") +
      `\n\n💡 提示: 使用 validate_video_url 工具来验证特定链接是否可播放`;

    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  }

  private async handleVideoValidation(args: { url: string }) {
    const { url } = args;

    if (!url) {
      throw new Error("URL 是必需的参数");
    }

    console.log(`[MCP Server] 开始验证视频: ${url}`);

    const isValid = await this.gazeValidator.isValid(url);

    const resultText = isValid
      ? `✅ 视频链接验证成功！\n\n链接: ${url}\n状态: 可播放`
      : `❌ 视频链接验证失败！\n\n链接: ${url}\n状态: 无法播放或加载失败`;

    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
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
