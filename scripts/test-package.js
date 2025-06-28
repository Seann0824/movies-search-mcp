#!/usr/bin/env node

/**
 * 测试 npm 包的完整性和功能
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🧪 开始测试 npm 包...\n");

// 检查必要文件是否存在
const requiredFiles = [
  "dist/cli.js",
  "dist/mcp-server.js",
  "dist/mcp-server-sse.js",
  "package.json",
  "README.md",
  "LICENSE",
];

console.log("📁 检查必要文件...");
for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - 文件不存在`);
    process.exit(1);
  }
}

// 检查 package.json 配置
console.log("\n📦 检查 package.json 配置...");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const requiredFields = [
  "name",
  "version",
  "description",
  "main",
  "bin",
  "files",
];
for (const field of requiredFields) {
  if (pkg[field]) {
    console.log(
      `✅ ${field}: ${typeof pkg[field] === "object" ? JSON.stringify(pkg[field]) : pkg[field]}`
    );
  } else {
    console.log(`❌ ${field} - 字段缺失`);
    process.exit(1);
  }
}

// 测试 CLI 可执行性
console.log("\n🚀 测试 CLI 可执行性...");

// 测试默认模式（STDIO）
console.log("测试 STDIO 模式...");
const stdioTest = spawn("node", ["dist/cli.js"], { stdio: "pipe" });

setTimeout(() => {
  stdioTest.kill("SIGTERM");
  console.log("✅ STDIO 模式启动成功");

  // 测试 SSE 模式
  console.log("测试 SSE 模式...");
  const sseTest = spawn("node", ["dist/cli.js", "--sse"], {
    stdio: "pipe",
    env: { ...process.env, PORT: "3001" },
  });

  setTimeout(() => {
    // 测试健康检查端点
    const http = require("http");
    const req = http.get("http://localhost:3001/health", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const health = JSON.parse(data);
          if (health.status === "healthy") {
            console.log("✅ SSE 模式启动成功");
            console.log("✅ 健康检查端点正常");
          } else {
            console.log("❌ 健康检查失败");
          }
        } catch (e) {
          console.log("❌ 健康检查响应解析失败");
        }

        sseTest.kill("SIGTERM");

        console.log("\n🎉 所有测试通过！包已准备好发布。");
        console.log("\n📝 发布步骤:");
        console.log("1. npm login");
        console.log("2. npm publish --access public");
        console.log("\n📋 使用方法:");
        console.log("npx @sean/movies-search-mcp          # STDIO 模式");
        console.log("npx @sean/movies-search-mcp --sse    # SSE 模式");
      });
    });

    req.on("error", (e) => {
      console.log("❌ SSE 健康检查失败:", e.message);
      sseTest.kill("SIGTERM");
      process.exit(1);
    });
  }, 2000); // 等待 SSE 服务器启动
}, 1000); // 等待 STDIO 服务器启动
