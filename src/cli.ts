#!/usr/bin/env node

import { spawn } from "child_process";
import path from "path";

/**
 * 电影搜索工具 MCP Server CLI
 * 默认运行 STDIO 模式，支持 --sse 参数运行 SSE 模式
 */

const args = process.argv.slice(2);
const isSSEMode = args.includes("--sse") || args.includes("-s");

// 构建目标文件路径
const targetFile = isSSEMode ? "mcp-server-sse.js" : "mcp-server.js";
const targetPath = path.join(__dirname, targetFile);

// 过滤掉模式参数，传递其他参数
const filteredArgs = args.filter((arg) => arg !== "--sse" && arg !== "-s");

console.error(
  `🎬 启动电影搜索工具 MCP Server (${isSSEMode ? "SSE" : "STDIO"} 模式)`
);

// 启动对应的服务器
const child = spawn("node", [targetPath, ...filteredArgs], {
  stdio: "inherit",
  env: process.env,
});

// 处理退出信号
process.on("SIGINT", () => {
  child.kill("SIGINT");
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});

child.on("exit", (code) => {
  process.exit(code || 0);
});

child.on("error", (error) => {
  console.error("启动服务器失败:", error);
  process.exit(1);
});
