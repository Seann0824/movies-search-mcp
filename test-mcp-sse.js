#!/usr/bin/env node

/**
 * SSE 版本的 MCP 客户端测试脚本
 * 测试电影搜索工具 MCP Server (SSE) 的功能
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function testSSEMCPServer() {
  console.log("🎬 开始测试电影搜索工具 MCP Server (SSE 版本)...\n");

  // 使用 SSE 传输连接到服务器
  const baseUrl = new URL("http://localhost:3000");
  const transport = new SSEClientTransport(baseUrl);

  const client = new Client(
    {
      name: "movie-search-sse-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    console.log("🔗 连接到 SSE MCP Server...");
    await client.connect(transport);
    console.log("✅ 成功连接到 SSE MCP Server\n");

    // 设置通知监听器
    client.onNotification = (notification) => {
      if (notification.method === "notifications/message") {
        const { level, data } = notification.params;
        const emoji =
          level === "info"
            ? "ℹ️"
            : level === "warning"
              ? "⚠️"
              : level === "error"
                ? "❌"
                : "📢";
        console.log(`${emoji} [通知] ${data}`);
      }
    };

    // 测试 1: 列出可用工具
    console.log("📋 测试 1: 列出可用工具");
    const tools = await client.listTools();
    console.log(`找到 ${tools.tools.length} 个工具:`);
    tools.tools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name}: ${tool.description}`);
    });
    console.log();

    // 测试 2: 搜索电影（使用一个简单的示例）
    console.log("🔍 测试 2: 搜索电影 (实时通知演示)");
    console.log("搜索关键词: '阿凡达'");
    console.log("注意观察实时通知...\n");

    try {
      const searchResult = await client.callTool({
        name: "search_movie",
        arguments: {
          title: "阿凡达",
          type: "movie",
        },
      });

      console.log("\n🎉 搜索完成！最终结果:");
      console.log(searchResult.content[0].text);
    } catch (error) {
      console.log("\n⚠️ 搜索测试跳过（需要网络连接和浏览器环境）");
      console.log(`错误: ${error.message}`);
    }

    console.log("\n🎉 SSE MCP Server 测试完成！");
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
  } finally {
    try {
      await client.close();
      console.log("🔌 客户端连接已关闭");
    } catch (closeError) {
      console.error("❌ 关闭连接时出错:", closeError.message);
    }
  }
}

// 检查服务器是否运行
async function checkServerHealth() {
  try {
    const response = await fetch("http://localhost:3000/health");
    if (response.ok) {
      const health = await response.json();
      console.log("💚 服务器健康检查:", health);
      return true;
    }
  } catch (error) {
    console.log("❌ 服务器未运行，请先启动 SSE MCP Server:");
    console.log("   npm run dev:mcp:sse");
    console.log("   或");
    console.log("   npm run mcp:sse");
    return false;
  }
}

// 运行测试
(async () => {
  const serverRunning = await checkServerHealth();
  if (serverRunning) {
    await testSSEMCPServer();
  }
})().catch(console.error);
