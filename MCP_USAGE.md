# 电影搜索工具 MCP Server 使用指南

这个项目已经成功改造为一个 **Model Context Protocol (MCP) Server**，为 AI 客户端提供电影和电视剧搜索功能。

## 🚀 两种传输方式

项目提供了两种 MCP Server 实现：

### 1. 标准 STDIO 版本 (`mcp-server.ts`)

- 使用标准输入输出传输
- 适合大多数 MCP 客户端
- 简单稳定的连接方式

### 2. SSE 版本 (`mcp-server-sse.ts`) ⭐ **推荐**

- 使用 Server-Sent Events (SSE) 传输
- **实时通知功能**：搜索和验证过程中的实时进度更新
- 使用 SDK 顶层封装 (`McpServer` 类)
- 更好的用户体验和调试信息
- HTTP 端点，便于测试和集成

## 🎯 功能特性

### 1. 电影搜索工具 (`search_movie`)

- **功能**: 搜索电影或电视剧资源，返回可播放的视频链接
- **参数**:
  - `title` (必需): 电影或电视剧的标题
  - `type` (必需): 内容类型，可选值：`movie`（电影）或 `tv`（电视剧）
  - `season` (可选): 季数（仅限电视剧）
  - `episode` (可选): 集数（仅限电视剧）

### 2. 视频验证工具 (`validate_video_url`)

- **功能**: 验证视频链接是否可播放
- **参数**:
  - `url` (必需): 要验证的视频播放页面 URL

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建项目

```bash
npm run build
```

### 3. 启动 MCP Server

#### 启动 SSE 版本（推荐）

```bash
npm run mcp:sse
```

或者在开发模式下运行：

```bash
npm run dev:mcp:sse
```

#### 启动 STDIO 版本

```bash
npm run mcp
```

或者在开发模式下运行：

```bash
npm run dev:mcp
```

## 🔧 配置 AI 客户端

### Claude Desktop 配置

在 Claude Desktop 的配置文件中添加以下配置：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### SSE 版本配置（推荐）

```json
{
  "mcpServers": {
    "movie-search-tool-sse": {
      "command": "node",
      "args": [
        "/path/to/your/project/movies-search-tool/dist/mcp-server-sse.js"
      ],
      "env": {}
    }
  }
}
```

#### STDIO 版本配置

```json
{
  "mcpServers": {
    "movie-search-tool": {
      "command": "node",
      "args": ["/path/to/your/project/movies-search-tool/dist/mcp-server.js"],
      "env": {}
    }
  }
}
```

**注意**: 请将 `/path/to/your/project/` 替换为你的实际项目路径。

### 其他 MCP 兼容客户端

对于其他支持 MCP 的客户端，请参考客户端文档进行配置。

## 📖 使用示例

配置完成后，你可以在 AI 客户端中使用以下功能：

### 搜索电影

```
请帮我搜索电影《阿凡达》
```

### 搜索电视剧

```
请帮我搜索电视剧《人生切割术》第一季
```

### 验证视频链接

```
请验证这个视频链接是否可播放：https://gaze.run/play/xxx
```

## 🛠️ 技术架构

### 核心组件

- **GazeSource**: Gaze.run 网站的搜索引擎
- **GazeValidatorService**: 高级视频验证系统，采用五层验证策略
- **MCP Server**: 标准 MCP 协议服务器实现

### 验证机制

1. **L1 - 页面加载验证**: 确保播放页面能正常加载
2. **L2 - 播放按钮检测**: 识别并点击视频播放按钮
3. **L3 - Blob URL 检测**: 监控 `<video>` 元素的 `src` 属性变化
4. **L4 - 视频状态验证**: 检查 `readyState ≥ 2` 和 `duration > 0`
5. **L5 - 实际播放测试**: 尝试播放并监听 `timeupdate` 事件确认视频真正可播放

### 反检测机制

- 使用真实 Chrome 浏览器
- 集成 `puppeteer-extra-plugin-stealth` 隐藏自动化特征
- 拦截并替换 `devtools-detector.min.js` 脚本
- 禁用 `console.clear()` 保留调试信息

## 📋 返回格式

### 搜索成功示例

```
🎬 搜索结果: "人生切割术"

✅ 找到 2 个可播放资源:

1. 【720P】https://gaze.run/play/xxx
   来源: Gaze

2. 【1080P】https://gaze.run/play/xxx
   来源: Gaze
```

### 验证成功示例

```
✅ 视频链接验证成功！

链接: https://gaze.run/play/xxx
状态: 可播放
```

## 🔍 故障排除

### 常见问题

1. **找不到资源**
   - 尝试使用不同的关键词
   - 检查标题拼写是否正确
   - 确认内容类型设置正确

2. **验证失败**
   - 网络连接问题
   - 目标网站暂时不可用
   - 视频资源已失效

3. **MCP Server 启动失败**
   - 检查 Node.js 版本（需要 ≥18）
   - 确认所有依赖已正确安装
   - 检查端口是否被占用

### 调试模式

启用详细日志输出：

```bash
DEBUG=* npm run dev:mcp:sse  # SSE 版本
DEBUG=* npm run dev:mcp      # STDIO 版本
```

### 测试 MCP Server

#### 测试 SSE 版本

```bash
# 先启动服务器
npm run dev:mcp:sse

# 在另一个终端运行测试
npm run test:mcp:sse
```

#### 测试 STDIO 版本

```bash
npm run test:mcp
```

## 🌟 特色优势

- **高精度验证**: 五层验证机制确保100%可播放性
- **高效并发**: 同时验证多个视频链接
- **反检测能力**: 成功绕过网站的机器人检测
- **多画质支持**: 自动识别720P/1080P等不同画质
- **标准协议**: 遵循 MCP 标准，兼容所有支持 MCP 的 AI 客户端

## 📄 许可证

ISC License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
