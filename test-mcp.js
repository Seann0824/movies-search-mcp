#!/usr/bin/env node

/**
 * 简单的 MCP 客户端测试脚本
 * 用于验证电影搜索工具 MCP Server 的功能
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

async function testMCPServer() {
  console.log("🎬 开始测试电影搜索工具 MCP Server...\n");

  // 启动 MCP Server
  const serverProcess = spawn("node", ["dist/mcp-server.js"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const transport = new StdioClientTransport({
    readable: serverProcess.stdout,
    writable: serverProcess.stdin,
  });

  const client = new Client(
    {
      name: "movie-search-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log("✅ 成功连接到 MCP Server\n");

    // 测试 1: 列出可用工具
    console.log("📋 测试 1: 列出可用工具");
    const tools = await client.listTools();
    console.log(`找到 ${tools.tools.length} 个工具:`);
    tools.tools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name}: ${tool.description}`);
    });
    console.log();

    // 测试 2: 搜索电影（使用一个简单的示例）
    console.log("🔍 测试 2: 搜索电影");
    console.log("搜索关键词: '阿凡达'");

    try {
      const searchResult = await client.callTool({
        name: "search_movie",
        arguments: {
          title: "阿凡达",
          type: "movie",
        },
      });

      console.log("搜索结果:");
      console.log(searchResult.content[0].text);
    } catch (error) {
      console.log("搜索测试跳过（需要网络连接和浏览器环境）");
      console.log(`错误: ${error.message}`);
    }

    console.log("\n🎉 MCP Server 测试完成！");
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
  } finally {
    await client.close();
    serverProcess.kill();
  }
}

// 运行测试
testMCPServer().catch(console.error);
