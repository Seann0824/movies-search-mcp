#!/usr/bin/env node

const { build } = require("esbuild");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🎬 开始构建电影搜索工具...");

// 清理输出目录
if (fs.existsSync("dist")) {
  fs.rmSync("dist", { recursive: true });
}
fs.mkdirSync("dist", { recursive: true });

// 构建配置
const buildOptions = {
  platform: "node",
  target: "node16",
  format: "cjs",
  bundle: true,
  minify: false,
  sourcemap: true,
  external: [
    // Playwright 相关需要保持外部依赖
    "playwright",
    "playwright-core",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth",
    // 这些是可选的 peer dependencies
    "fsevents",
  ],
};

// 构建所有入口文件
const entryPoints = [
  { in: "src/cli.ts", out: "cli" },
  { in: "src/mcp-server.ts", out: "mcp-server" },
  { in: "src/mcp-server-sse.ts", out: "mcp-server-sse" },
  { in: "src/server.ts", out: "server" },
];

async function buildAll() {
  try {
    console.log("📦 正在打包 JavaScript 文件...");

    for (const entry of entryPoints) {
      await build({
        ...buildOptions,
        entryPoints: [entry.in],
        outfile: `dist/${entry.out}.js`,
      });

      // 为可执行文件添加执行权限
      if (entry.out === "cli") {
        try {
          fs.chmodSync(`dist/${entry.out}.js`, "755");
        } catch (err) {
          console.warn(`⚠️  无法设置执行权限: ${err.message}`);
        }
      }
    }

    // 复制静态资源
    console.log("📄 复制静态资源...");
    if (fs.existsSync("src/sdk-fake")) {
      execSync("cp -r src/sdk-fake dist/", { stdio: "inherit" });
    }

    // 创建 package.json 用于发布
    console.log("📝 生成发布配置...");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

    // 更新发布包的依赖，只保留必要的运行时依赖
    const publishPackageJson = {
      ...packageJson,
      dependencies: {
        // 保留浏览器自动化相关依赖
        playwright: packageJson.dependencies.playwright,
        "playwright-extra": packageJson.dependencies["playwright-extra"],
        "puppeteer-extra-plugin-stealth":
          packageJson.dependencies["puppeteer-extra-plugin-stealth"],
        // 保留其他核心依赖
        "@modelcontextprotocol/sdk":
          packageJson.dependencies["@modelcontextprotocol/sdk"],
        cheerio: packageJson.dependencies.cheerio,
        zod: packageJson.dependencies.zod,
      },
      devDependencies: undefined,
      scripts: {
        start: "node server.js",
        mcp: "node mcp-server.js",
        "mcp:sse": "node mcp-server-sse.js",
        cli: "node cli.js",
        "cli:sse": "node cli.js --sse",
        postinstall: "npx playwright install chromium",
      },
      bin: {
        "movies-search-mcp": "./cli.js",
      },
      files: [
        "dist/**/*",
        "cli.js",
        "mcp-server.js",
        "mcp-server-sse.js",
        "server.js",
        "sdk-fake/**/*",
        "README.md",
        "LICENSE",
      ],
    };

    fs.writeFileSync(
      "dist/package.json",
      JSON.stringify(publishPackageJson, null, 2)
    );

    // 复制必要文件
    const filesToCopy = ["README.md", "LICENSE"];
    filesToCopy.forEach((file) => {
      if (fs.existsSync(file)) {
        fs.copyFileSync(file, `dist/${file}`);
      }
    });

    console.log("✅ 构建完成！");
    console.log("📦 构建产物位于 dist/ 目录");
    console.log("🚀 现在可以使用以下方式运行：");
    console.log("   - npx @acwink/movies-search-mcp");
    console.log("   - npx @acwink/movies-search-mcp --sse");
  } catch (error) {
    console.error("❌ 构建失败:", error);
    process.exit(1);
  }
}

buildAll();
