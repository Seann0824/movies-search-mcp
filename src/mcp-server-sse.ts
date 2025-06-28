#!/usr/bin/env node

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import dotenv from "dotenv";
import { GazeSource } from "./sources/Gaze.source";
import { ShenQiZheSource } from "./sources/ShenQiZhe.source";
import { ImtlinkSource } from "./sources/Imtlink.source";
import { GazeValidatorService } from "./core/gaze.validator";
import { ShenQiZheValidatorService } from "./core/shenqizhe.validator";
import { ImtlinkValidatorService } from "./core/imtlink.validator";
import { SearchQuery } from "./types/index";

dotenv.config();

/**
 * 电影搜索工具 MCP Server (SSE 版本)
 * 使用 SSE (Server-Sent Events) 传输和 SDK 顶层封装
 */

// 创建 MCP Server 实例的工厂函数
const createMovieSearchServer = () => {
  const server = new McpServer(
    {
      name: "movie-search-tool-sse",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  // 初始化服务
  const gazeSource = new GazeSource();
  const shenQiZheSource = new ShenQiZheSource();
  const imtlinkSource = new ImtlinkSource();
  const gazeValidator = new GazeValidatorService();
  const shenQiZheValidator = new ShenQiZheValidatorService();
  const imtlinkValidator = new ImtlinkValidatorService();

  /**
   * 根据URL选择合适的验证器
   */
  const getValidatorForUrl = (url: string) => {
    if (url.includes("gaze.run")) {
      return gazeValidator;
    } else if (url.includes("shenqizhe.com")) {
      return shenQiZheValidator;
    } else if (url.includes("imtlink.com")) {
      return imtlinkValidator;
    } else {
      // 默认使用 gaze 验证器
      return gazeValidator;
    }
  };

  // 注册电影搜索工具
  server.tool(
    "search_movie",
    "搜索电影或电视剧资源。返回未验证的搜索结果列表，包含标题、链接和质量信息。使用此工具获取候选资源后，请从结果中选择最匹配的链接，然后使用 validate_video_url 工具验证其可播放性。",
    {
      title: z.string().describe("电影或电视剧的标题"),
      type: z
        .enum(["movie", "tv"])
        .describe("内容类型：movie（电影）或 tv（电视剧）"),
      season: z.number().min(1).optional().describe("季数（仅限电视剧）"),
      episode: z.number().min(1).optional().describe("集数（仅限电视剧）"),
    },
    async ({ title, type, season, episode }, { sendNotification }) => {
      try {
        console.error(`[MCP SSE Server] 开始搜索: ${title} (${type})`);

        // 发送开始搜索的通知
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `🔍 开始搜索 "${title}"...`,
          },
        });

        const query: SearchQuery = {
          title,
          type,
          ...(season && { season }),
          ...(episode && { episode }),
        };

        // 并行搜索所有源
        const sources = [gazeSource, shenQiZheSource, imtlinkSource];
        const searchPromises = sources.map((source) => source.find(query));
        const resultsFromAllSources = await Promise.all(searchPromises);

        // 合并并展平结果
        const searchResults = resultsFromAllSources.flat();

        if (searchResults.length === 0) {
          await sendNotification({
            method: "notifications/message",
            params: {
              level: "warning",
              data: `❌ 未找到 "${title}" 的任何资源`,
            },
          });

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

        console.error(`[MCP SSE Server] 找到 ${searchResults.length} 个资源`);

        // 发送搜索完成通知
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `🎉 搜索完成！找到 ${searchResults.length} 个资源（未验证）`,
          },
        });

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
            title: result.title,
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
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`[MCP SSE Server] 搜索错误:`, error);

        await sendNotification({
          method: "notifications/message",
          params: {
            level: "error",
            data: `❌ 搜索过程中发生错误: ${errorMessage}`,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: errorMessage,
                  results: [],
                  total: 0,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 注册视频验证工具
  server.tool(
    "validate_video_url",
    "验证特定视频链接的可播放性。接收一个视频播放页面的 URL 或 URL 数组，返回该链接是否可以正常播放。支持批量验证多个链接。只有通过验证的链接才能确保用户可以观看。",
    {
      url: z
        .union([
          z.string().describe("要验证的视频播放页面 URL"),
          z.array(z.string()).describe("要批量验证的视频播放页面 URL 数组"),
        ])
        .describe("要验证的视频播放页面 URL（单个或数组）"),
    },
    async ({ url }, { sendNotification }) => {
      try {
        console.error(`[MCP SSE Server] 开始验证视频:`, url);

        // 处理单个 URL 或 URL 数组
        const urls = Array.isArray(url) ? url : [url];
        console.error(`[MCP SSE Server] 共需验证 ${urls.length} 个链接`);

        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `🔍 开始批量验证 ${urls.length} 个视频链接...`,
          },
        });

        // 并行验证所有 URL
        const validationPromises = urls.map(async (singleUrl, index) => {
          try {
            // 根据URL选择合适的验证器
            const validator = getValidatorForUrl(singleUrl);
            const validatorName = singleUrl.includes("gaze.run")
              ? "Gaze"
              : singleUrl.includes("shenqizhe.com")
                ? "ShenQiZhe"
                : singleUrl.includes("imtlink.com")
                  ? "Imtlink"
                  : "Default";

            console.error(
              `[MCP SSE Server] 验证 [${index + 1}/${urls.length}] ${singleUrl} - 使用 ${validatorName} 验证器`
            );

            await sendNotification({
              method: "notifications/message",
              params: {
                level: "info",
                data: `🔍 [${index + 1}/${urls.length}] 使用 ${validatorName} 验证器验证中...`,
              },
            });

            const isValid = await validator.isValid(singleUrl);

            const result = {
              url: singleUrl,
              valid: isValid,
              validator: validatorName,
              status: isValid ? "可播放" : "无法播放",
              message: isValid
                ? "视频链接验证成功，可以正常播放"
                : "视频链接验证失败，可能已失效或无法访问",
              timestamp: new Date().toISOString(),
            };

            await sendNotification({
              method: "notifications/message",
              params: {
                level: isValid ? "info" : "warning",
                data: isValid
                  ? `✅ [${index + 1}/${urls.length}] 验证成功 (${validatorName})`
                  : `❌ [${index + 1}/${urls.length}] 验证失败 (${validatorName})`,
              },
            });

            return result;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.error(
              `[MCP SSE Server] 验证 ${singleUrl} 时发生错误:`,
              error
            );

            await sendNotification({
              method: "notifications/message",
              params: {
                level: "error",
                data: `❌ [${index + 1}/${urls.length}] 验证出错: ${errorMessage}`,
              },
            });

            return {
              url: singleUrl,
              valid: false,
              validator: "Unknown",
              status: "验证失败",
              message: `验证过程中发生错误: ${errorMessage}`,
              error: errorMessage,
              timestamp: new Date().toISOString(),
            };
          }
        });

        const validationResults = await Promise.all(validationPromises);

        // 统计结果
        const validCount = validationResults.filter(
          (result) => result.valid
        ).length;
        const totalCount = validationResults.length;

        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `🎉 批量验证完成！${validCount}/${totalCount} 个链接可播放`,
          },
        });

        const result = {
          success: true,
          total: totalCount,
          valid: validCount,
          invalid: totalCount - validCount,
          results: validationResults,
          summary: `共验证 ${totalCount} 个链接，${validCount} 个可播放，${totalCount - validCount} 个无法播放`,
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
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`[MCP SSE Server] 验证错误:`, error);

        await sendNotification({
          method: "notifications/message",
          params: {
            level: "error",
            data: `❌ 验证过程中发生错误: ${errorMessage}`,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  url: url,
                  valid: false,
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
    }
  );

  return server;
};

// 创建 Express 应用
const app = express();
app.use(express.json());

// 存储传输会话
const transports: Record<string, SSEServerTransport> = {};

// SSE 端点 - 建立 SSE 流
app.get("/sse", async (req, res) => {
  console.error("🔗 建立 SSE 连接...");

  try {
    // 创建新的 SSE 传输
    const transport = new SSEServerTransport("/messages", res);

    // 存储传输会话
    const sessionId = transport.sessionId;
    transports[sessionId] = transport;

    // 设置关闭处理器
    transport.onclose = () => {
      console.error(`🔌 SSE 连接关闭: ${sessionId}`);
      delete transports[sessionId];
    };

    // 连接到 MCP 服务器
    const server = createMovieSearchServer();
    await server.connect(transport);

    console.error(`✅ SSE 连接建立成功: ${sessionId}`);
  } catch (error) {
    console.error("❌ 建立 SSE 连接失败:", error);
    if (!res.headersSent) {
      res.status(500).send("建立 SSE 连接失败");
    }
  }
});

// 消息端点 - 接收客户端 JSON-RPC 请求
app.post("/messages", async (req, res) => {
  console.error("📨 收到客户端消息");

  // 从 URL 查询参数中提取会话 ID
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    console.error("❌ 缺少会话 ID");
    res.status(400).send("缺少 sessionId 参数");
    return;
  }

  const transport = transports[sessionId];
  if (!transport) {
    console.error(`❌ 未找到会话: ${sessionId}`);
    res.status(404).send("会话未找到");
    return;
  }

  try {
    // 使用传输处理 POST 消息
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error("❌ 处理消息失败:", error);
    if (!res.headersSent) {
      res.status(500).send("处理消息失败");
    }
  }
});

// 健康检查端点
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    server: "movie-search-tool-sse",
    version: "1.0.0",
    activeSessions: Object.keys(transports).length,
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.error(`🎬 电影搜索工具 MCP Server (SSE) 启动成功`);
  console.error(`📡 监听端口: ${PORT}`);
  console.error(`🔗 SSE 端点: http://localhost:${PORT}/sse`);
  console.error(`📨 消息端点: http://localhost:${PORT}/messages`);
  console.error(`💚 健康检查: http://localhost:${PORT}/health`);
});

// 优雅关闭处理
process.on("SIGINT", async () => {
  console.error("🛑 正在关闭服务器...");

  // 关闭所有活动的传输连接
  for (const sessionId in transports) {
    try {
      console.error(`🔌 关闭会话: ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`❌ 关闭会话失败 ${sessionId}:`, error);
    }
  }

  console.error("✅ 服务器关闭完成");
  process.exit(0);
});
