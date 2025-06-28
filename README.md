# Movie Search Tool (MCP Server) 🎬

这是一个智能影视资源搜索工具，已改造为 **Model Context Protocol (MCP) Server**，为 AI 客户端提供自动化电影和电视剧搜索功能，返回经过验证的可播放视频链接。

## 🚀 MCP Server 快速使用

### 🌟 SSE 版本（推荐）- 带实时通知

```bash
# 1. 构建并启动
npm install
npm run build
npm run mcp:sse

# 2. 测试功能
npm run test:mcp:sse
```

**特色功能**：

- ✨ **实时通知** - 搜索和验证过程的实时进度更新
- 🔧 **SDK 顶层封装** - 使用 `McpServer` 类简化开发
- 🌐 **HTTP 端点** - 便于测试和调试

### 📋 配置 AI 客户端 (Claude Desktop)

在 `~/Library/Application Support/Claude/claude_desktop_config.json` 中添加：

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

### 🎬 在 AI 中使用

- 🔍 **搜索电影**: "请帮我搜索电影《阿凡达》"
- 📺 **搜索电视剧**: "请帮我搜索电视剧《人生切割术》"
- ✅ **验证链接**: "请验证这个视频链接是否可播放"

### 🛠️ 工作流程

1. **搜索阶段**: `search_movie` 工具返回所有找到的资源列表（未验证）
2. **选择阶段**: AI 从结果中选择最匹配用户需求的视频链接
3. **验证阶段**: 使用 `validate_video_url` 工具验证选中链接的可播放性

**实时通知示例**：

```
ℹ️ 🔍 开始搜索 "阿凡达"...
ℹ️ 🎉 搜索完成！找到 5 个资源（未验证）
ℹ️ 🔍 开始验证视频链接...
ℹ️ ✅ 验证成功，视频可播放
```

### 📚 详细文档

- [MCP_USAGE.md](./MCP_USAGE.md) - 完整使用指南
- [SSE_IMPLEMENTATION.md](./SSE_IMPLEMENTATION.md) - SSE 实现详解

## 🎯 项目状态

**当前已实现功能：**

- ✅ **Gaze.run 资源搜索** - 完整实现并通过测试
- ✅ **多层视频验证系统** - 基于浏览器自动化的高精度验证
- ✅ **反检测机制** - 使用 Playwright + Stealth 插件绕过网站检测
- ✅ **并发验证** - 支持多个视频链接同时验证
- ✅ **端到端测试** - 完整的搜索→验证→结果流程

**测试验证结果：**

```
✅ 搜索测试: 找到2个潜在结果
✅ 验证测试: 2个结果都通过严格验证
✅ 最终结果:
  [1] https://gaze.run/play/xxx (720P)
  [2] https://gaze.run/play/xxx (1080P)
```

## 架构规划

### 核心设计思想

项目采用**模块化**、**异步任务**和**可扩展**的设计思想。

1.  **模块化 (Source Providers)**：每个目标资源网站都被抽象为一个独立的 `Source` 模块。这使得增删或修改某个网站的爬虫逻辑不会影响到其他部分。
2.  **异步任务 (Job Queue)**：搜索和验证过程可能非常耗时。因此，API 被设计为异步模式。客户端提交一个搜索请求后，服务端立即返回一个任务 ID，并在后台通过任务队列 (Job Queue) 处理该请求。客户端可以稍后通过任务 ID 来轮询获取结果。
3.  **可扩展 (Scalable)**：通过任务队列和缓存机制，系统可以方便地横向扩展，以应对更高的并发请求。

### 技术栈 (Tech Stack)

| 分类              | 技术                       | 备注                                             |
| ----------------- | -------------------------- | ------------------------------------------------ |
| **运行时/语言**   | Node.js, TypeScript        | 兼顾性能与开发效率，类型安全。                   |
| **Web 框架**      | Express.js                 | 生态成熟，快速搭建 API 服务。                    |
| **无头浏览器**    | Playwright                 | 核心验证模块，模拟真实用户行为，验证链接有效性。 |
| **反检测**        | playwright-extra + stealth | 绕过网站的机器人检测机制。                       |
| **HTML 解析**     | Cheerio                    | 在静态页面上快速提取信息，辅助 Playwright。      |
| **任务队列**      | BullMQ                     | 基于 Redis 的高性能任务队列，处理后台搜索任务。  |
| **缓存/队列后端** | Redis                      | 缓存验证结果，并作为 BullMQ 的后端。             |
| **代码规范**      | ESLint + Prettier          | 保证代码风格统一。                               |
| **容器化**        | Docker                     | 简化部署，保证环境一致性。                       |

### 核心模块详解

#### 🔍 已实现：Gaze.run 搜索引擎

**GazeSource** (`src/sources/Gaze.source.ts`)：

- 使用 Playwright 获取会话 cookies
- 调用 Gaze.run API 端点 `/filter_movielist` 进行搜索
- 返回格式化的播放页面 URL 列表
- 支持不同画质的视频资源发现

#### 🛡️ 已实现：高级视频验证系统

**GazeValidatorService** (`src/core/gaze.validator.ts`)：

验证器采用**五层漏斗验证策略**，确保返回的每个链接都是真正可播放的：

1. **L1 - 页面加载验证**: 确保播放页面能正常加载
2. **L2 - 播放按钮检测**: 识别并点击视频播放按钮
3. **L3 - Blob URL 检测**: 监控 `<video>` 元素的 `src` 属性变化
4. **L4 - 视频状态验证**: 检查 `readyState ≥ 2` 和 `duration > 0`
5. **L5 - 实际播放测试**: 尝试播放并监听 `timeupdate` 事件确认视频真正可播放

**反检测机制：**

- 使用真实 Chrome 浏览器 (`channel: 'chrome'`)
- 集成 `puppeteer-extra-plugin-stealth` 隐藏自动化特征
- 拦截并替换 `devtools-detector.min.js` 脚本
- 禁用 `console.clear()` 保留调试信息

#### 🎯 验证精度

经过实际测试验证，系统能够：

- **准确识别**可播放视频（readyState: 4, 有效时长）
- **自动过滤**加载失败或无法播放的资源
- **支持多种画质**（720P, 1080P）
- **并发处理**多个验证任务

### 项目目录结构

```
movies-search-tool/
├── src/
│   ├── api/             # API 层 (Express.js) - 待实现
│   │   ├── controllers/ # 请求处理器
│   │   ├── middlewares/ # 中间件
│   │   └── routes/      # API 路由定义
│   ├── config/          # 配置管理
│   │   └── index.ts
│   ├── core/            # 核心业务逻辑
│   │   └── gaze.validator.ts # ✅ Gaze专用验证器 (已实现)
│   ├── jobs/            # 后台任务处理 - 待实现
│   ├── services/        # 应用服务层 - 待实现
│   ├── sources/         # ✅ 资源网站爬虫实现
│   │   ├── BaseSource.ts     # ✅ 抽象基类 (已实现)
│   │   ├── Gaze.source.ts    # ✅ Gaze.run 搜索 (已实现)
│   │   └── Gaze.source.test.ts # ✅ 端到端测试 (已实现)
│   ├── sdk-fake/        # ✅ 反检测资源
│   │   └── gaze/devtools-detector.min.js # 伪造脚本
│   ├── types/           # ✅ TypeScript 类型定义 (已实现)
│   │   └── index.ts
│   ├── utils/           # 工具函数 - 待实现
│   └── server.ts        # Express 服务器 - 待实现
├── package.json         # ✅ 依赖配置完成
├── tsconfig.json        # ✅ TypeScript 配置
└── README.md           # ✅ 本文档
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
# 运行 Gaze.run 端到端测试
npm test src/sources/Gaze.source.test.ts

# 运行所有测试
npm test
```

### 测试输出示例

```
✅ All validated results:
  [1] https://gaze.run/play/3707985a810eb936d216b2f.. (720P)
  [2] https://gaze.run/play/57fac3ff0917fa8ad2088a.. (1080P)
```

## 📋 API 设计 (计划中)

#### 1. 发起搜索任务

- **Endpoint**: `POST /api/v1/search`
- **Request Body**:
  ```json
  {
    "title": "人生切割术",
    "type": "tv", // 'movie' or 'tv'
    "season": 1, // Optional
    "episode": 1 // Optional
  }
  ```
- **Success Response** (`202 Accepted`):
  ```json
  {
    "taskId": "a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8"
  }
  ```

#### 2. 获取任务结果

- **Endpoint**: `GET /api/v1/results/:taskId`
- **Success Response** (`200 OK`):
  ```json
  {
    "taskId": "a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8",
    "status": "completed",
    "query": { "title": "人生切割术", "type": "tv" },
    "results": [
      {
        "url": "https://gaze.run/play/xxx",
        "quality": "1080P",
        "source": "Gaze"
      },
      {
        "url": "https://gaze.run/play/xxx",
        "quality": "720P",
        "source": "Gaze"
      }
    ]
  }
  ```

```

## 🗺️ 开发路线图 (Roadmap)

**Phase 1: MVP - 核心引擎** ✅ **已完成**

- [x] 初始化项目，配置 TS, ESLint, Prettier
- [x] 实现 Gaze.run 专用搜索引擎 (`GazeSource`)
- [x] **实现高级视频验证器 (`GazeValidatorService`)**
- [x] 集成反检测机制 (Playwright + Stealth)
- [x] 创建端到端测试验证整个流程

**Phase 2: 可扩展性与健壮性** 🚧 **进行中**

- [ ] 重构为通用的 `Source` 架构支持更多网站
- [ ] 开发 `Source` 管理器
- [ ] 引入 Redis 进行链接缓存

**Phase 3: API 服务化** 📋 **计划中**

- [ ] 搭建 Express 服务器
- [ ] 实现异步任务 API (`/search`, `/results/:taskId`)
- [ ] 集成 BullMQ 管理后台搜索任务

**Phase 4: 高级功能与部署** 📋 **计划中**

- [ ] 集成代理 IP 支持
- [ ] 完善日志和监控
- [ ] 编写 Dockerfile 进行容器化
- [ ] MCP Server 集成

## 🎉 成果展示

当前实现已经达到了：

- **🎯 高精度验证**: 五层验证机制确保100%可播放性
- **🚀 高效并发**: 同时验证多个视频链接
- **🛡️ 反检测能力**: 成功绕过 Gaze.run 的机器人检测
- **📊 多画质支持**: 自动识别720P/1080P等不同画质
- **✅ 端到端测试**: 完整的搜索→验证→结果流程验证

这为后续扩展到更多视频网站和构建完整的API服务奠定了坚实的基础！

## 🎬 电影搜索工具 MCP Server

一个为 AI 助手提供电影和电视剧资源搜索功能的 Model Context Protocol (MCP) 服务器。

### ✨ 核心功能

- **🔍 智能搜索**: 根据标题、类型、季数、集数搜索影视资源
- **📋 结果列表**: 返回所有找到的资源链接（不进行预验证）
- **🔍 按需验证**: AI 可以选择最匹配的结果进行可播放性验证
- **⚡ 实时通知**: SSE 版本支持搜索和验证过程的实时反馈
- **🛡️ 反检测**: 使用 Playwright + Stealth 插件避免网站检测

## TODO (远期规划)

- **开发独立客户端**:
  - [ ] 创建一个简单的 Web 客户端（如使用 Vue/React），用于管理用户的“想看列表”。
  - [ ] 客户端能够展示电影/电视剧信息、搜索状态和最终找到的有效资源。

- **实现后台自动化**:
  - [ ] 引入数据库（如 SQLite）来持久化存储用户的播放列表和搜索结果。
  - [ ] 创建 API 接口（如 `/watchlist`）来管理播放列表的增删改查。
  - [ ] 当用户添加新条目到播放列表时，自动触发后台任务进行资源搜索和验证。
  - [ ] 将搜索到的有效链接更新到数据库，并在客户端上展示。

- **AI 功能增强**:
  - [ ] 探索使用 AI 来优化搜索查询，例如自动识别别名、年份，提高搜索准确率。
  - [ ] 研究基于用户观看历史的个性化推荐功能。
```
