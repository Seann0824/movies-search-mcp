#!/usr/bin/env node

import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import dotenv from "dotenv";
import { GazeSource } from "./sources/Gaze.source.js";
import { GazeValidatorService } from "./core/gaze.validator.js";
import { SearchQuery, SearchResult } from "./types/index.js";

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
  const gazeValidator = new GazeValidatorService();

  // 注册电影搜索工具
  server.tool(
    "search_movie",
    "搜索电影或电视剧资源，返回可播放的视频链接",
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

        // 第一步：搜索潜在的播放页面
        const initialResults = await gazeSource.find(query);

        if (initialResults.length === 0) {
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
                text: `未找到 "${title}" 的任何资源。请尝试使用不同的关键词。`,
              },
            ],
          };
        }

        // 发送找到潜在结果的通知
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `🎯 找到 ${initialResults.length} 个潜在结果，开始验证...`,
          },
        });

        // 第二步：并发验证所有找到的链接
        const validationPromises = initialResults.map(async (result, index) => {
          try {
            // 发送验证进度通知
            await sendNotification({
              method: "notifications/message",
              params: {
                level: "info",
                data: `🔍 验证链接 ${index + 1}/${initialResults.length}: ${result.quality}`,
              },
            });

            const isValid = await gazeValidator.isValid(result.url);

            if (isValid) {
              await sendNotification({
                method: "notifications/message",
                params: {
                  level: "info",
                  data: `✅ 验证成功: ${result.quality} - ${result.url}`,
                },
              });
            }

            return isValid ? result : null;
          } catch (error) {
            console.error(`[MCP SSE Server] 验证失败 ${result.url}:`, error);
            await sendNotification({
              method: "notifications/message",
              params: {
                level: "error",
                data: `❌ 验证失败: ${result.quality}`,
              },
            });
            return null;
          }
        });

        const validatedResults = (await Promise.all(validationPromises)).filter(
          (result): result is SearchResult => result !== null
        );

        console.error(
          `[MCP SSE Server] 验证完成，找到 ${validatedResults.length} 个可播放资源`
        );

        // 发送验证完成通知
        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `🎉 验证完成！找到 ${validatedResults.length} 个可播放资源`,
          },
        });

        if (validatedResults.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `找到了 ${initialResults.length} 个潜在资源，但验证后发现都无法播放。请稍后再试或使用不同的搜索词。`,
              },
            ],
          };
        }

        // 格式化结果
        const resultText =
          `🎬 搜索结果: "${title}"\n\n` +
          `✅ 找到 ${validatedResults.length} 个可播放资源:\n\n` +
          validatedResults
            .map(
              (result, index) =>
                `${index + 1}. 【${result.quality}】${result.url}\n   来源: ${result.source}`
            )
            .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: resultText,
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
              text: `错误: ${errorMessage}`,
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
    "验证视频链接是否可播放",
    {
      url: z.string().describe("要验证的视频播放页面 URL"),
    },
    async ({ url }, { sendNotification }) => {
      try {
        console.error(`[MCP SSE Server] 开始验证视频: ${url}`);

        await sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `🔍 开始验证视频链接...`,
          },
        });

        const isValid = await gazeValidator.isValid(url);

        const resultText = isValid
          ? `✅ 视频链接验证成功！\n\n链接: ${url}\n状态: 可播放`
          : `❌ 视频链接验证失败！\n\n链接: ${url}\n状态: 无法播放或加载失败`;

        await sendNotification({
          method: "notifications/message",
          params: {
            level: isValid ? "info" : "warning",
            data: isValid
              ? "✅ 验证成功，视频可播放"
              : "❌ 验证失败，视频无法播放",
          },
        });

        return {
          content: [
            {
              type: "text",
              text: resultText,
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
              text: `错误: ${errorMessage}`,
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
app.get("/mcp", async (req, res) => {
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
  console.error(`🔗 SSE 端点: http://localhost:${PORT}/mcp`);
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
