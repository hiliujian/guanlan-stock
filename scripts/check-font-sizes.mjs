#!/usr/bin/env node
/**
 * 字号规范检查（lint:font）
 * -------------------------------------------------------------
 * 约束：全站 font-size 必须写成 var(--font-*)（8 档梯度，定义于 src/styles/global.css 的 :root）。
 * 允许例外：
 *   - inherit            ：继承父级字号
 *   - <num>px            ：px 字号仅用于 canvas 覆盖层（如图表 X 轴标签），与画布渲染保持一致
 * 任何裸 rpx / 其它单位 / 其它字面量字号都会被判为违规并令进程退出码为 1，
 * 可直接接入 CI 或 git 提交钩子，防止引入非标准字号。
 *
 * 用法：
 *   node scripts/check-font-sizes.mjs
 *   npm run lint:font
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(process.cwd(), "src");
const EXT = new Set([".css", ".scss", ".less", ".vue"]);
const FS_RE = /font-size\s*:\s*([^;]+?)\s*;/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (EXT.has(extname(p))) out.push(p);
  }
  return out;
}

let violations = 0;
for (const file of walk(ROOT)) {
  const text = readFileSync(file, "utf8");
  FS_RE.lastIndex = 0;
  let m;
  while ((m = FS_RE.exec(text))) {
    let val = m[1].trim();
    if (val.includes("!important")) val = val.replace("!important", "").trim();
    const ok =
      val.startsWith("var(--font-") ||
      val === "inherit" ||
      /^\d+(?:\.\d+)?px$/.test(val);
    if (!ok) {
      const line = text.slice(0, m.index).split("\n").length;
      violations++;
      console.error(
        `✗ ${file}:${line}  font-size: ${val}  （必须 var(--font-*)；px / inherit 为允许例外）`
      );
    }
  }
}

if (violations) {
  console.error(
    `\n发现 ${violations} 处非标准字号，请改用 --font-* 梯度变量（定义见 src/styles/global.css :root）。`
  );
  process.exit(1);
}
console.log(
  "✓ 字号规范检查通过：所有 font-size 均使用 --font-* 梯度变量（px / inherit 例外允许）。"
);
