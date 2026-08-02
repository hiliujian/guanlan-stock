// =====================================================================
// 传输层（与「数据源」解耦）
//
// 职责：把「一个上游 URL」变成「一段文本 / 一段脚本文本」，并自动在多种
// 传输通道间降级：
//   H5 浏览器：① 同源 / 私有代理（服务端转发，最快最稳）
//            ② 直连 fetch 到上游官方域名（若上游带 CORS 头则零代理成功）
//            ③ JSONP 直连（<script> 跨域，不受 CORS 限制，纯静态托管可用）
//            ④ 公共 CORS 代理兜底（不稳定，最后才用）
//   小程序：   同源 / 公共代理（无 JSONP/直连可用）
//
// 注意：本层只负责「拿到数据」，不关心数据来自哪家数据源。多数据源（东财 /
// 腾讯 / 新浪）的自动降级由 src/api/sources 在「数据源」层面处理。两层叠加，
// 既保证「单家数据源挂了能换一家」，又保证「某传输通道不通能换通道」。
// =====================================================================
import { isSupabaseConfigured } from "@/config/app";
import { getSupabase } from "@/api/supabase";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const isH5 = () => typeof window !== "undefined" && typeof document !== "undefined";

// 行情统一后端代理（Supabase Edge Function）。配置好 Supabase 后，行情请求
// 优先经此函数转发到东方财富；若该函数取数失败（如东财封锁云 IP），H5 会
// 自动回退到 JSONP / 直连，业务层无感知、跨端一致。
const EDGE_FN = "guanlan-quote-proxy";

// 经 Supabase Edge Function 透传东方财富接口，返回原始响应文本。
// 仅当 Supabase 已配置时可用；未配置时由调用方回退到本地取数通道。
async function requestViaSupabase(full: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase 未配置");
  // ⚠️ 外层超时兜底：东方财富在 TLS 层封锁 Supabase 海外云 IP 时，functions.invoke
  // 既不 resolve 也不 reject（信号/连接挂起），且 invoke 不吃 AbortSignal，单纯传
  // signal 无效。故用 withTimeout 在外层用 Promise.race 强制 6s 超时抛错，让上层
  // requestEmJson 在 H5 端快速回退 JSONP/直连，避免「已配置 Supabase 的部署（如
  // Vercel）行情首请求卡死几十秒」这一生产级问题。
  const { data, error } = await withTimeout(
    sb.functions.invoke(EDGE_FN, { body: { url: full } }),
    6000
  );
  if (error) throw new Error(error.message || "行情代理请求失败");
  const text = typeof data === "string" ? data : JSON.stringify(data ?? null);
  if (looksLikeHtml(text)) throw new Error("行情代理返回非 JSON 响应");
  return text;
}

// 上游 host -> 同源代理前缀（仅覆盖东方财富官方域名；腾讯/新浪等走直连 + JSONP）
const HOST_PREFIX: Record<string, string> = {
  "https://push2.eastmoney.com": "/rt",
  "https://push2his.eastmoney.com": "/em",
  "https://searchapi.eastmoney.com": "/search",
};

function localPath(full: string): string {
  for (const h of Object.keys(HOST_PREFIX)) {
    if (full.startsWith(h)) return HOST_PREFIX[h] + full.slice(h.length);
  }
  return full;
}

// 公共 CORS 代理兜底：上游接口本身无 CORS，纯静态托管（无同源代理）时，
// 浏览器无法直接跨域访问，需借公共代理转发。只保留 codetabs / allorigins 两个
// 稳定源，且前面已有 8s 超时兜底，不会因此把请求挂死。
function publicProxyUrls(full: string): string[] {
  const q = encodeURIComponent(full);
  return [
    "https://api.codetabs.com/v1/proxy/?quest=" + q,
    "https://api.allorigins.win/raw?url=" + q,
  ];
}

// 同源静态托管（如 CloudStudio 纯静态）会把 /rt /em 等未知路径回退成 index.html，
// 识别到一次 HTML 响应后即标记同源不可用，后续请求直接跳过，省一次无谓往返。
let sameOriginDead = false;

// 取候选请求地址：同源优先，公共代理兜底（仅前端可用）
function candidates(full: string): string[] {
  const list: string[] = [];
  if (isH5() && !sameOriginDead) list.push(localPath(full));
  list.push(...publicProxyUrls(full));
  return list;
}

// 可靠的同源代理（优先于不稳定的公共 CORS 代理）
function reliableProxies(full: string): string[] {
  const list: string[] = [];
  if (!sameOriginDead) list.push(localPath(full));
  return list;
}

// 客户端请求硬超时：单个取数请求超过该时长即中断，避免「分析中」卡死。
const FETCH_TIMEOUT = 8000;

// 竞速兜底：给任意 Promise 加一个「最迟 ms 毫秒」的硬上限。
//   · 传 fallback：超时/失败均 resolve(fallback)（不 reject），用于资金流等「非关键
//     路径」数据，绝不会阻塞主行情链路；
//   · 不传 fallback：超时即 reject（让上层 catch 走降级通道），用于行情代理等对
//     可用性敏感、需在超时后快速回退的路径。
function withTimeout<T>(p: Promise<T>, ms: number, fallback?: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      if (fallback !== undefined) resolve(fallback);
      else reject(new Error("请求超时"));
    }, ms);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(fallback !== undefined ? (fallback as T) : e);
      }
    );
  });
}

async function rawBytes(url: string): Promise<ArrayBuffer> {
  if (isH5()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.arrayBuffer();
    } finally {
      clearTimeout(timer);
    }
  }
  // 微信小程序：uni.request 支持 arraybuffer + timeout
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    uni.request({
      url,
      method: "GET",
      responseType: "arraybuffer",
      header: { "User-Agent": UA },
      timeout: FETCH_TIMEOUT,
      success: (res: any) => {
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
        resolve(res.data as ArrayBuffer);
      },
      fail: (err: any) => reject(err),
    });
  });
}

// 判断上游返回的字节是否为 HTML/XML（而非 JSON）。
function looksLikeHtml(text: string): boolean {
  const t = (text || "").replace(/^﻿/, "").trimStart();
  return (
    t.startsWith("<!DOCTYPE") ||
    t.startsWith("<html") ||
    t.startsWith("<?xml") ||
    (t.startsWith("<") && /^[a-zA-Z/!]/.test(t.slice(1, 2) || ""))
  );
}

function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8").decode(buf);
  } catch {
    return "";
  }
}

// 浏览器 JSONP 直连（带 cb 回调）：跨域 <script> 不受 CORS 限制，纯静态托管也能用。
// 适用于支持 cb 参数的接口（东方财富、腾讯 smartbox 等）。
function jsonpText(full: string, timeoutMs = FETCH_TIMEOUT): Promise<string> {
  if (!isH5()) return Promise.reject(new Error("非浏览器环境"));
  return new Promise((resolve, reject) => {
    const cb = "__jp_" + Math.random().toString(36).slice(2, 10);
    const sep = full.includes("?") ? "&" : "?";
    const url = full + sep + "cb=" + cb + "&_=" + Date.now();
    let done = false;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP 超时"));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      try {
        delete (window as any)[cb];
      } catch {
        /* noop */
      }
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    (window as any)[cb] = (data: any) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(JSON.stringify(data ?? null));
    };
    script.src = url;
    script.async = true;
    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP 加载失败"));
    };
    document.head.appendChild(script);
  });
}

// 全局变量式 JSONP：用于不以 cb 回调返回、而是直接赋值全局变量（如腾讯
// qt.gtimg.cn 返回 v_sh600519="..."、新浪 sinajs 返回 hq_str_sh600519="..."）
// 的接口。加载脚本后读取指定 window 全局变量并删除，避免脏读。
function requestGlobalVar(
  full: string,
  globalKey: string,
  timeoutMs = FETCH_TIMEOUT
): Promise<string> {
  if (!isH5()) return Promise.reject(new Error("非浏览器环境"));
  return new Promise((resolve, reject) => {
    const sep = full.includes("?") ? "&" : "?";
    const url = full + sep + "_=" + Date.now();
    let done = false;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("全局变量 JSONP 超时"));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      try {
        delete (window as any)[globalKey];
      } catch {
        /* noop */
      }
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    script.src = url;
    script.async = true;
    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("全局变量 JSONP 加载失败"));
    };
    script.onload = () => {
      if (done) return;
      // 脚本同步执行完毕，全局变量此时已就绪
      const val = (window as any)[globalKey];
      if (val === undefined || val === null) {
        done = true;
        cleanup();
        reject(new Error("全局变量未就绪"));
        return;
      }
      done = true;
      cleanup();
      resolve(typeof val === "string" ? val : JSON.stringify(val));
    };
    document.head.appendChild(script);
  });
}

// 东方财富 JSON 接口取数：
// - 已配置 Supabase：优先走 Edge Function 代理（guanlan-quote-proxy）；若代理取数
//   失败（典型：东方财富在 TLS 层封锁 Supabase 海外云 IP，已知硬约束），H5 浏览器
//   自动回退到 JSONP / 直连（用户本地中国 IP 直连东财可用），小程序无 JSONP/直连只能继续抛错；
// - 未配置（本地模式）：优先 JSONP(cb) 绕开 CORS（无需代理，最稳），失败再回退
//   requestText（同源 / 私有代理 / 公共代理）。小程序无 script 注入，直接走 requestText。
async function requestEmJson(full: string): Promise<string> {
  if (isSupabaseConfigured) {
    try {
      return await requestViaSupabase(full);
    } catch (e) {
      // Edge Function 取数失败兜底：H5 回退本地通道；小程序无替代通道只能继续抛错。
      if (isH5()) {
        console.warn("[transport] Edge Function 取数失败，回退本地通道：", (e as Error)?.message);
        try {
          return await jsonpText(full, 4000);
        } catch {
          /* JSONP 不可达，继续走 requestText 回退 */
        }
        return await requestText(full);
      }
      throw e;
    }
  }
  if (isH5()) {
    try {
      return await jsonpText(full, 4000);
    } catch {
      /* JSONP 不可达，回退代理通道 */
    }
  }
  return await requestText(full);
}

// 拉取上游文本，自动回退多个传输通道（按「可靠性 / 速度」排序）。
// 全部失败才抛友好错误，绝不直接把 HTML 交给 JSON.parse 导致崩溃。
async function requestText(full: string): Promise<string> {
  let lastErr: any;

  if (isH5()) {
    // ① 同源 / 私有代理优先
    const reliable = reliableProxies(full);
    for (let i = 0; i < reliable.length; i++) {
      try {
        const buf = await rawBytes(reliable[i]);
        if (!buf || !buf.byteLength) {
          lastErr = new Error("空响应");
          continue;
        }
        const text = decode(buf);
        if (looksLikeHtml(text)) {
          if (i === 0 && reliable[i] === localPath(full)) sameOriginDead = true;
          lastErr = new Error("非 JSON 响应");
          continue;
        }
        return text;
      } catch (e) {
        lastErr = e;
      }
    }

    // ② 直连 fetch 到上游官方域名（若上游带 CORS 头，零代理成功）
    try {
      const buf = await rawBytes(full);
      if (buf && buf.byteLength) {
        const t = decode(buf);
        if (!looksLikeHtml(t)) return t;
        lastErr = new Error("非 JSON 响应");
      } else {
        lastErr = new Error("空响应");
      }
    } catch (e) {
      lastErr = e;
    }

    // ③ 公共 CORS 代理兜底（仅浏览器，最后才用，因其不稳定）
    const pub = publicProxyUrls(full);
    for (let i = 0; i < pub.length; i++) {
      try {
        const buf = await rawBytes(pub[i]);
        if (!buf || !buf.byteLength) {
          lastErr = new Error("空响应");
          continue;
        }
        const text = decode(buf);
        if (looksLikeHtml(text)) {
          lastErr = new Error("非 JSON 响应");
          continue;
        }
        return text;
      } catch (e) {
        lastErr = e;
      }
    }
  } else {
    // 小程序：同源代理 / 公共代理，无 JSONP/直连可用
    const urls = candidates(full);
    for (let i = 0; i < urls.length; i++) {
      try {
        const buf = await rawBytes(urls[i]);
        if (!buf || !buf.byteLength) {
          lastErr = new Error("空响应");
          continue;
        }
        const text = decode(buf);
        if (looksLikeHtml(text)) {
          if (i === 0) sameOriginDead = true;
          lastErr = new Error("非 JSON 响应");
          continue;
        }
        return text;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw new Error("行情数据获取失败，请稍后重试");
}

export {
  UA,
  isH5,
  FETCH_TIMEOUT,
  withTimeout,
  looksLikeHtml,
  jsonpText,
  requestGlobalVar,
  requestText,
  requestEmJson,
};
