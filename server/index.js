// =====================================================================
// 自带行情代理 + 静态服务（零运行时依赖，仅 Node 内置模块）
//
// 作用：
//   1) 托管打包后的 H5（dist/build/h5）
//   2) 代理 /rt /em /search 到东方财富官方接口（实时/历史/搜索）
//      服务端fetch，浏览器同域调用，彻底规避跨域与 JSONP 失败。
//
// 使用：
//   node server/index.js            # 默认 8787 端口
//   PORT=9000 node server/index.js
// 然后通过 http://localhost:<PORT> 访问。
// 部署到服务器时，把 API_PROXY 指向该地址（前端即走同源代理）。
// =====================================================================
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

// 静态根目录：按优先级查找已构建产物（h5out > webapp > dist/build/h5）
function resolveRoot() {
  const dirs = [
    path.resolve(__dirname, "..", "h5out37"),
    path.resolve(__dirname, "..", "h5out36"),
    path.resolve(__dirname, "..", "h5out35"),
    path.resolve(__dirname, "..", "h5out34"),
    path.resolve(__dirname, "..", "h5out33"),
    path.resolve(__dirname, "..", "h5out32"),
    path.resolve(__dirname, "..", "h5out31"),
    path.resolve(__dirname, "..", "h5out30"),
    path.resolve(__dirname, "..", "h5out29"),
    path.resolve(__dirname, "..", "h5out28"),
    path.resolve(__dirname, "..", "h5out27"),
    path.resolve(__dirname, "..", "h5out26"),
    path.resolve(__dirname, "..", "h5out25"),
    path.resolve(__dirname, "..", "h5out24"),
    path.resolve(__dirname, "..", "h5out23"),
    path.resolve(__dirname, "..", "h5out22"),
    path.resolve(__dirname, "..", "h5out21"),
    path.resolve(__dirname, "..", "h5out20"),
    path.resolve(__dirname, "..", "h5out19"),
    path.resolve(__dirname, "..", "h5out18"),
    path.resolve(__dirname, "..", "h5out17"),
    path.resolve(__dirname, "..", "h5out16"),
    path.resolve(__dirname, "..", "h5out15"),
    path.resolve(__dirname, "..", "h5out14"),
    path.resolve(__dirname, "..", "h5out13"),
    path.resolve(__dirname, "..", "h5out12"),
    path.resolve(__dirname, "..", "h5out11"),
    path.resolve(__dirname, "..", "h5out10"),
    path.resolve(__dirname, "..", "h5out9"),
    path.resolve(__dirname, "..", "h5out8"),
    path.resolve(__dirname, "..", "h5out7"),
    path.resolve(__dirname, "..", "h5out6"),
    path.resolve(__dirname, "..", "h5out4"),
    path.resolve(__dirname, "..", "h5out3"),
    path.resolve(__dirname, "..", "h5out2"),
    path.resolve(__dirname, "..", "h5out"),
    path.resolve(__dirname, "..", "webapp"),
    path.resolve(__dirname, "..", "dist", "build", "h5"),
  ];
  for (const d of dirs) {
    if (fs.existsSync(path.join(d, "index.html"))) return d;
  }
  return dirs[0];
}
const ROOT = resolveRoot();
const PORT = process.env.PORT || 8787;

const UPSTREAM = {
  "/rt": "https://push2.eastmoney.com",
  "/em": "https://push2his.eastmoney.com",
  "/search": "https://searchapi.eastmoney.com",
};

// 出网策略（实测结论，避免踩坑）：
//   - 东方财富(push2his)经 Node 的 https-proxy-agent 隧道会稳定 socket hang up，
//     而「直连」与「curl」都能稳定拿到数据。故优先直连，失败回退 curl。
//   - curl 会自动读取 HTTPS_PROXY 环境变量，兼顾公司/沙箱代理场景。
//   - 腾讯 / 新浪直连即可，无需代理。
//   - 因此本服务不再依赖 https-proxy-agent，纯 Node 内置模块 + 可选 curl 兜底。
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  let filePath = path.join(ROOT, urlPath);
  // 防目录穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      // SPA 兜底：未知路径回 index.html
      filePath = path.join(ROOT, "index.html");
    }
    fs.readFile(filePath, (e, data) => {
      if (e) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  });
}

// 直连上游（Node 原生 https，每次新连接，无连接池复用问题）
function fetchDirect(urlStr, ua, referer) {
  return new Promise((resolve, reject) => {
    const r = https.get(
      urlStr,
      { headers: { "User-Agent": ua, Referer: referer }, agent: null },
      (up) => {
        const chunks = [];
        up.on("data", (d) => chunks.push(d));
        up.on("end", () =>
          resolve({
            status: up.statusCode || 200,
            contentType: up.headers["content-type"],
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    r.on("error", reject);
    r.setTimeout(15000, () => r.destroy(new Error("upstream timeout")));
  });
}

// curl 兜底：自动读取 HTTPS_PROXY 环境变量，对东方财富等直连偶发 hang up 的上游更稳定
function fetchCurl(urlStr, ua, referer) {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      ["-s", "-L", "--max-time", "15", "--fail", "-A", ua, "-e", referer, urlStr],
      { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        resolve({ status: 200, contentType: "application/octet-stream", body: stdout });
      }
    );
  });
}

function pipeUp(res, r) {
  const headers = { "Access-Control-Allow-Origin": "*" };
  if (r.contentType) headers["Content-Type"] = r.contentType;
  res.writeHead(r.status || 200, headers);
  res.end(r.body);
}

async function proxyRequest(req, res, prefix) {
  const target = UPSTREAM[prefix];
  const upstreamUrl = target + req.url.slice(prefix.length); // 含 query
  let lastErr;
  // 1) 直连（腾讯/新浪稳定；东方财富偶发 hang up，靠重试 + curl 兜底）
  for (let i = 0; i < 3; i++) {
    try {
      return pipeUp(res, await fetchDirect(upstreamUrl, UA, target + "/"));
    } catch (e) {
      lastErr = e;
      await sleep(300);
    }
  }
  // 2) curl 兜底（走系统代理，东方财富稳定）
  for (let i = 0; i < 2; i++) {
    try {
      return pipeUp(res, await fetchCurl(upstreamUrl, UA, target + "/"));
    } catch (e) {
      lastErr = e;
      await sleep(300);
    }
  }
  if (!res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("proxy error: " + (lastErr?.message || "unknown"));
  } else {
    res.destroy();
  }
}

const server = http.createServer((req, res) => {
  for (const prefix of Object.keys(UPSTREAM)) {
    // 精确匹配前缀后跟 "/" 或 "?"，避免 "/em" 误捕获 "/rt..." 等长前缀路径
    if (req.url === prefix || req.url.startsWith(prefix + "/") || req.url.startsWith(prefix + "?")) {
      proxyRequest(req, res, prefix);
      return;
    }
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`[stock-analyzer] 服务已启动: http://localhost:${PORT}`);
  console.log(`[stock-analyzer] 静态目录: ${ROOT}`);
  if (!fs.existsSync(path.join(ROOT, "index.html"))) {
    console.warn(
      "[stock-analyzer] 警告: 未找到 webapp/index.html 或 dist/build/h5/index.html，请先构建"
    );
  }
});
