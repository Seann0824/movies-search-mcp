/**
 * 日志工具
 * 在 STDIO 模式下禁用所有日志输出，避免干扰 MCP 协议通信
 */

// 检测是否为 STDIO 模式（通过环境变量或进程参数）
const isSTDIOMode =
  process.env.MCP_MODE === "stdio" ||
  process.argv.some((arg) => arg.includes("mcp-server.js")) ||
  !process.env.MCP_SSE_PORT;

export const logger = {
  log: (...args: any[]) => {
    if (!isSTDIOMode) {
      console.log(...args);
    }
  },

  error: (...args: any[]) => {
    if (!isSTDIOMode) {
      console.error(...args);
    }
  },

  warn: (...args: any[]) => {
    if (!isSTDIOMode) {
      console.warn(...args);
    }
  },

  debug: (...args: any[]) => {
    if (!isSTDIOMode && process.env.DEBUG) {
      console.log("[DEBUG]", ...args);
    }
  },
};
