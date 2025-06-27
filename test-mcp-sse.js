#!/usr/bin/env node

/**
 * 测试 MCP Server SSE 版本
 * 验证搜索和验证功能的工作情况
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  SSEClientTransport,
} = require("@modelcontextprotocol/sdk/client/sse.js");

async function testMCPServerSSE() {
  console.log("🧪 开始测试 MCP Server SSE 版本...\n");

  try {
    // 创建 SSE 客户端传输 - 使用正确的 URL 格式
    const baseUrl = new URL("http://localhost:3000/sse");
    const transport = new SSEClientTransport(baseUrl);

    // 创建客户端
    const client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    // 连接到服务器
    console.log("🔗 连接到 SSE MCP Server...");
    await client.connect(transport);
    console.log("✅ 连接成功\n");

    // 获取可用工具
    console.log("📋 获取可用工具...");
    const toolsResponse = await client.listTools();

    console.log("🛠️ 可用工具:");
    toolsResponse.tools.forEach((tool) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log();

    // 测试电影搜索
    console.log("🎬 测试搜索电影...");
    const searchResponse = await client.callTool({
      name: "search_movie",
      arguments: {
        title: "阿凡达",
        type: "movie",
      },
    });

    console.log("📊 搜索结果:");
    console.log(searchResponse.content[0].text);
    console.log();

    // 解析搜索结果
    const searchResult = JSON.parse(searchResponse.content[0].text);

    if (searchResult.success && searchResult.results.length > 0) {
      // 测试验证第一个链接
      const firstUrl = searchResult.results[0].url;
      console.log(`🔍 测试验证链接: ${firstUrl}`);

      const validateResponse = await client.callTool({
        name: "validate_video_url",
        arguments: {
          url: firstUrl,
        },
      });

      console.log("✅ 验证结果:");
      console.log(validateResponse.content[0].text);
    } else {
      console.log("⚠️ 没有找到搜索结果，跳过验证测试");
    }

    // 关闭连接
    await client.close();
    console.log("\n🎉 测试完成！");
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
    console.error(
      "请确保 MCP Server SSE 版本正在运行 (npm run mcp-server-sse)"
    );
    process.exit(1);
  }
}

// 运行测试
testMCPServerSSE();
