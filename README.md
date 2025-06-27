# Movie Search Tool (MCP Server)

这是一个智能影视资源搜索工具，旨在自动化查找和验证全网影视资源，为用户或 AI 提供直接可播放的有效链接。

## 架构规划

### 核心设计思想

项目采用**模块化**、**异步任务**和**可扩展**的设计思想。

1.  **模块化 (Source Providers)**：每个目标资源网站都被抽象为一个独立的 `Source` 模块。这使得增删或修改某个网站的爬虫逻辑不会影响到其他部分。
2.  **异步任务 (Job Queue)**：搜索和验证过程可能非常耗时。因此，API 被设计为异步模式。客户端提交一个搜索请求后，服务端立即返回一个任务 ID，并在后台通过任务队列 (Job Queue) 处理该请求。客户端可以稍后通过任务 ID 来轮询获取结果。
3.  **可扩展 (Scalable)**：通过任务队列和缓存机制，系统可以方便地横向扩展，以应对更高的并发请求。

### 技术栈 (Tech Stack)

| 分类              | 技术                | 备注                                             |
| ----------------- | ------------------- | ------------------------------------------------ |
| **运行时/语言**   | Node.js, TypeScript | 兼顾性能与开发效率，类型安全。                   |
| **Web 框架**      | Express.js          | 生态成熟，快速搭建 API 服务。                    |
| **无头浏览器**    | Playwright          | 核心验证模块，模拟真实用户行为，验证链接有效性。 |
| **HTML 解析**     | Cheerio             | 在静态页面上快速提取信息，辅助 Playwright。      |
| **任务队列**      | BullMQ              | 基于 Redis 的高性能任务队列，处理后台搜索任务。  |
| **缓存/队列后端** | Redis               | 缓存验证结果，并作为 BullMQ 的后端。             |
| **代码规范**      | ESLint + Prettier   | 保证代码风格统一。                               |
| **容器化**        | Docker              | 简化部署，保证环境一致性。                       |

### 核心模块详解

#### 链接有效性验证 (`Validator`)

为了确保提供给用户的链接是"真正可播放"的，验证器 (`validator.ts`) 将采用一个多层次的漏斗策略，以最高效率过滤无效资源：

1.  **L1 - 快速链接检查 (HTTP Check)**: 通过 `HEAD` 请求快速检查链接的存活性 (HTTP Status Code) 和 `Content-Type`，过滤明显的死链或错误页面。
2.  **L2 - 播放列表解析 (M3U8 Parse)**: 对于 HLS (`.m3u8`) 链接，下载并解析播放列表，确保其结构完整，并对其中的分片链接 (`.ts`) 进行存活性检查。
3.  **L3 - 媒体元数据分析 (Deep Check with `ffprobe`)**: **此为核心验证步骤**。使用 `ffprobe` (FFmpeg 工具集的一部分) 对视频流的头部进行探测。`ffprobe` 能在不下载完整视频的情况下，分析出视频的编码、时长、分辨率等元数据。如果能成功解析，即可 99% 确认链接为有效视频源。
4.  **L4 - 无头浏览器模拟 (Playwright Fallback)**: 作为兜底方案，当无法直接从页面 HTML 中找到视频地址时，启动 `Playwright` 模拟用户访问，通过监听网络请求捕获真实的视频流地址，再将其交给 L3 进行深度验证。

### 项目目录结构

```
movies-search-tool/
├── dist/                # 编译后的 JavaScript 文件
├── src/
│   ├── api/             # API 层 (Express.js)
│   │   ├── controllers/ # 请求处理器 (Request Handlers)
│   │   ├── middlewares/ # 中间件
│   │   └── routes/      # API 路由定义
│   ├── config/          # 配置管理 (环境变量、资源网站列表等)
│   │   └── index.ts
│   ├── core/            # 核心业务逻辑
│   │   ├── crawler.ts   # 爬虫引擎
│   │   └── validator.ts # 链接有效性验证器
│   ├── jobs/            # 后台任务处理 (BullMQ)
│   │   ├── queue.ts     # 任务队列实例
│   │   └── worker.ts    # 任务处理器
│   ├── services/        # 应用服务层
│   │   ├── cache.service.ts  # 缓存服务
│   │   └── task.service.ts   # 任务管理服务
│   ├── sources/         # 具体的资源网站爬虫实现
│   │   ├──- BaseSource.ts # 所有 Source 的抽象基类/接口
│   │   ├──- SiteA.source.ts
│   │   └──- SiteB.source.ts
│   ├── types/           # 全局 TypeScript 类型定义
│   │   └── index.ts
│   ├── utils/           # 工具函数 (logger, etc.)
│   └── server.ts        # Express 服务器入口文件
├── .env.example         # 环境变量示例
├── .eslintrc.js
├── .gitignore
├── package.json
├── README.md
└── tsconfig.json
```

### API 设计

#### 1. 发起搜索任务

- **Endpoint**: `POST /api/v1/search`
- **Request Body**:
  ```json
  {
    "title": "庆余年",
    "type": "tv", // 'movie' or 'tv'
    "season": 2, // Optional
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
  - **当任务仍在处理时:**
    ```json
    {
      "taskId": "a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8",
      "status": "processing"
    }
    ```
  - **当任务完成时:**
    ```json
    {
      "taskId": "a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8",
      "status": "completed",
      "query": { "title": "庆余年", "season": 2, "episode": 1 },
      "results": [
        {
          "url": "https://.../play.m3u8",
          "quality": "1080p",
          "source": "SiteA",
          "headers": {
            "Referer": "https://.../"
          }
        }
      ]
    }
    ```
  - **当任务失败时:**
    ```json
    {
      "taskId": "a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8",
      "status": "failed",
      "error": "No valid resources found after searching all sources."
    }
    ```

## 开发路线图 (Roadmap)

**Phase 1: MVP - 核心引擎**

- [ ] 初始化项目，配置 TS, ESLint, Prettier
- [ ] 实现针对单个网站的 `crawler`
- [ ] **实现多级链接验证器 (`validator`), 集成 `ffprobe` 进行媒体流分析**
- [ ] 创建 CLI 用于测试

**Phase 2: 可扩展性与健壮性**

- [ ] 重构 `crawler` 为模块化的 `Source` 架构
- [ ] 开发 `Source` 管理器
- [ ] 引入 Redis 进行链接缓存

**Phase 3: API 服务化**

- [ ] 搭建 Express 服务器
- [ ] 实现异步任务 API (`/search`, `/results/:taskId`)
- [ ] 集成 BullMQ 管理后台搜索任务

**Phase 4: 高级功能与部署**

- [ ] 集成代理 IP 支持
- [ ] 完善日志和监控
- [ ] 编写 Dockerfile 进行容器化
