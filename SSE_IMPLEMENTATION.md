# 电影搜索工具 MCP Server - SSE 实现详解

## 🎯 SSE 实现特色

本项目成功实现了使用 **Server-Sent Events (SSE)** 传输和 **MCP SDK 顶层封装**的 MCP Server，具有以下特色：

### ✨ 核心优势

1. **🔄 实时通知**: 搜索和验证过程中的实时进度更新
2. **📦 SDK 顶层封装**: 使用 `McpServer` 类简化开发
3. **🌐 HTTP 端点**: 便于测试、调试和集成
4. **🛠️ 类型安全**: 完整的 TypeScript 支持和 Zod 验证

## 🏗️ 架构设计

### 传输层架构

```
客户端 ←→ SSE 传输 ←→ MCP Server ←→ 电影搜索服务
   ↓           ↓           ↓              ↓
HTTP POST   SSEServer   McpServer    GazeSource
   ↓        Transport      ↓              ↓
实时通知  ←  消息处理  ←  工具调用  ←  GazeValidator
```

### 端点设计

- `GET /mcp` - 建立 SSE 连接
- `POST /messages` - 接收客户端消息
- `GET /health` - 健康检查

### 会话管理

- 自动生成会话 ID
- 内存中存储传输实例
- 优雅的连接关闭处理

## 🔧 关键实现

### 1. 使用 McpServer 顶层封装

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

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

// 使用类型安全的工具注册
server.tool(
  "search_movie",
  "搜索电影或电视剧资源",
  {
    title: z.string().describe("电影或电视剧的标题"),
    type: z.enum(["movie", "tv"]).describe("内容类型"),
    // ... 更多参数
  },
  async ({ title, type }, { sendNotification }) => {
    // 实现逻辑 + 实时通知
  }
);
```

### 2. SSE 传输实现

```typescript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// 建立 SSE 连接
app.get("/mcp", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports[sessionId] = transport;

  const server = createMovieSearchServer();
  await server.connect(transport);
});

// 处理客户端消息
app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  await transport.handlePostMessage(req, res, req.body);
});
```

### 3. 实时通知功能

```typescript
// 在工具执行过程中发送实时通知
await sendNotification({
  method: "notifications/message",
  params: {
    level: "info",
    data: `🔍 开始搜索 "${title}"...`,
  },
});

// 验证进度通知
await sendNotification({
  method: "notifications/message",
  params: {
    level: "info",
    data: `🔍 验证链接 ${index + 1}/${total}: ${quality}`,
  },
});
```

## 🚀 使用方式

### 启动服务器

```bash
# 开发模式
npm run dev:mcp:sse

# 生产模式
npm run build
npm run mcp:sse
```

### 客户端连接

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const transport = new SSEClientTransport(new URL("http://localhost:3000"));
const client = new Client({ name: "test-client", version: "1.0.0" });

// 监听实时通知
client.onNotification = (notification) => {
  if (notification.method === "notifications/message") {
    console.log(`[通知] ${notification.params.data}`);
  }
};

await client.connect(transport);
```

### 测试功能

```bash
# 运行自动化测试
npm run test:mcp:sse
```

## 📊 实时通知示例

当执行电影搜索时，用户会看到类似这样的实时进度：

```
ℹ️ [通知] 🔍 开始搜索 "阿凡达"...
ℹ️ [通知] 🎯 找到 3 个潜在结果，开始验证...
ℹ️ [通知] 🔍 验证链接 1/3: 720P
ℹ️ [通知] ✅ 验证成功: 720P - https://gaze.run/play/xxx
ℹ️ [通知] 🔍 验证链接 2/3: 1080P
ℹ️ [通知] ✅ 验证成功: 1080P - https://gaze.run/play/xxx
ℹ️ [通知] 🔍 验证链接 3/3: 480P
⚠️ [通知] ❌ 验证失败: 480P
ℹ️ [通知] 🎉 验证完成！找到 2 个可播放资源
```

## 🔍 与 STDIO 版本对比

| 特性             | SSE 版本         | STDIO 版本  |
| ---------------- | ---------------- | ----------- |
| **实时通知**     | ✅ 支持          | ❌ 不支持   |
| **HTTP 端点**    | ✅ 支持          | ❌ 不支持   |
| **调试便利性**   | ✅ 优秀          | ⚠️ 一般     |
| **客户端兼容性** | ⚠️ 需要 SSE 支持 | ✅ 广泛兼容 |
| **开发复杂度**   | ⚠️ 稍高          | ✅ 简单     |
| **用户体验**     | ✅ 优秀          | ⚠️ 一般     |

## 🛠️ 开发技巧

### 1. 错误处理

```typescript
try {
  // 业务逻辑
} catch (error) {
  await sendNotification({
    method: "notifications/message",
    params: {
      level: "error",
      data: `❌ 发生错误: ${error.message}`,
    },
  });

  return {
    content: [{ type: "text", text: `错误: ${error.message}` }],
    isError: true,
  };
}
```

### 2. 优雅关闭

```typescript
process.on("SIGINT", async () => {
  console.error("🛑 正在关闭服务器...");

  for (const sessionId in transports) {
    await transports[sessionId].close();
    delete transports[sessionId];
  }

  process.exit(0);
});
```

### 3. 健康检查

```typescript
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    server: "movie-search-tool-sse",
    version: "1.0.0",
    activeSessions: Object.keys(transports).length,
  });
});
```

## 🎉 总结

SSE 实现为电影搜索工具带来了：

1. **更好的用户体验** - 实时进度反馈
2. **更强的可观测性** - 详细的执行日志
3. **更灵活的部署** - HTTP 端点支持
4. **更现代的架构** - 事件驱动设计

这个实现展示了如何充分利用 MCP SDK 的顶层封装和 SSE 传输的优势，为 AI 客户端提供高质量的电影搜索服务。
