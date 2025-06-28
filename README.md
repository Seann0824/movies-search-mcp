# 🎬 Movies Search Tool

一个智能的电影和电视剧资源搜索工具，基于 Model Context Protocol (MCP) 构建，支持多个视频源搜索和链接验证。

## ✨ 特性

- 🔍 **多源搜索**: 支持多个视频网站资源搜索
- ✅ **链接验证**: 自动验证视频链接的可播放性
- 🚀 **MCP 协议**: 完全兼容 Model Context Protocol
- 📡 **双模式支持**: STDIO 和 SSE (Server-Sent Events) 两种传输模式
- 🛠️ **易于集成**: 可作为 MCP 工具集成到 AI 应用中

## 📦 安装

### 全局安装

```bash
npm install -g @sean/movies-search-mcp
```

### 使用 npx (推荐)

```bash
# 默认 STDIO 模式
npx @sean/movies-search-mcp

# SSE 模式
npx @sean/movies-search-mcp --sse
```

## 🚀 使用方法

### 命令行使用

```bash
# 默认 STDIO 模式 (适合 MCP 客户端)
movies-search-mcp

# 或使用短命令
mst

# SSE 模式 (适合 Web 应用)
movies-search-mcp --sse
mst --sse

# 指定端口 (仅 SSE 模式)
PORT=3001 movies-search-mcp --sse
```

### MCP 客户端集成

将此工具添加到你的 MCP 客户端配置中：

```json
{
  "mcpServers": {
    "movies-search-mcp": {
      "command": "npx",
      "args": ["@sean/movies-search-mcp"]
    }
  }
}
```

### 可用工具

#### 1. search_movie

搜索电影或电视剧资源

```typescript
// 搜索电影
{
  "title": "阿凡达",
  "type": "movie"
}

// 搜索电视剧
{
  "title": "权力的游戏",
  "type": "tv",
  "season": 1,
  "episode": 1
}
```

#### 2. validate_video_url

验证视频链接的可播放性

```typescript
// 单个链接验证
{
  "url": "https://example.com/video/123"
}

// 批量验证
{
  "url": [
    "https://example.com/video/123",
    "https://example.com/video/456"
  ]
}
```

## 🔧 开发

### 本地开发

```bash
# 克隆项目
git clone https://github.com/seanwangjs/movies-search-mcp.git
cd movies-search-mcp

# 安装依赖
npm install

# 开发模式
npm run dev:cli          # STDIO 模式
npm run dev:cli:sse      # SSE 模式

# 构建
npm run build

# 测试
npm test
```

### 项目结构

```
src/
├── cli.ts              # CLI 入口文件
├── mcp-server.ts       # STDIO MCP 服务器
├── mcp-server-sse.ts   # SSE MCP 服务器
├── sources/            # 视频源实现
├── core/              # 验证器实现
├── types/             # 类型定义
└── utils/             # 工具函数
```

## 🌐 API 端点 (SSE 模式)

当使用 SSE 模式时，服务器会启动以下端点：

- `GET /sse` - 建立 SSE 连接
- `POST /messages` - 发送 JSON-RPC 消息
- `GET /health` - 健康检查

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

如果你遇到任何问题，请：

1. 查看 [Issues](https://github.com/seanwangjs/movies-search-mcp/issues)
2. 创建新的 Issue
3. 联系作者: seanwangjs@example.com

---

⭐ 如果这个项目对你有帮助，请给个 Star！
