// =====================================================================
// Supabase 客户端（跨端单例）
// - H5 端：浏览器原生 fetch + localStorage，开箱即用
// - 小程序 / App 端：用 uni.request 包装成 fetch 垫片 + uni 存储垫片
//   业务层只调用 getSupabase()，永远不需要关心平台差异
// =====================================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import config, { isSupabaseConfigured } from "@/config/app";

let _client: SupabaseClient | null = null;

// 仅在非 H5 平台注入垫片（H5 用浏览器原生能力即可）
function isH5(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

// ---- uni.request 包装成 fetch（供小程序端使用）----
function createUniFetch(): typeof fetch {
  return function uniFetch(input: any, init?: any): Promise<any> {
    const url = typeof input === "string" ? input : input?.url || String(input);
    const method = (init?.method || "GET").toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (typeof (init.headers as any).forEach === "function") {
        (init.headers as any).forEach((v: string, k: string) => (headers[k] = v));
      } else {
        Object.assign(headers, init.headers);
      }
    }
    let body = init?.body;
    if (body && typeof body !== "string") body = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      uni.request({
        url,
        method: method as any,
        header: headers,
        data: body,
        success: (res: any) => {
          const status = res.statusCode;
          const data = res.data;
          const respHeaders = new Map<string, string>();
          if (res.header) {
            for (const k in res.header) respHeaders.set(k.toLowerCase(), res.header[k]);
          }
          const headersObj = {
            get: (k: string) => respHeaders.get(k.toLowerCase()) || null,
            forEach: (cb: (v: string, k: string) => void) => respHeaders.forEach(cb),
          };
          const resp: any = {
            ok: status >= 200 && status < 300,
            status,
            statusText: "",
            url,
            headers: headersObj,
            json: () => Promise.resolve(typeof data === "string" ? JSON.parse(data) : data),
            text: () => Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
            clone: () => resp,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          };
          resolve(resp);
        },
        fail: (err: any) => reject(err),
      });
    });
  } as any;
}

// ---- uni 存储包装成 Supabase Auth 的 storage 接口 ----
function createUniStorage() {
  return {
    getItem: (key: string) => uni.getStorageSync(key) ?? null,
    setItem: (key: string, value: string) => uni.setStorageSync(key, value),
    removeItem: (key: string) => uni.removeStorageSync(key),
  };
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (_client) return _client;

  const options: any = {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: isH5(),
    },
  };

  if (!isH5()) {
    options.auth.storage = createUniStorage();
    options.global = { fetch: createUniFetch() };
  }

  _client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, options);
  return _client;
}

export { isSupabaseConfigured };
