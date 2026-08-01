<template>
  <view class="report">
    <!-- 顶部横幅 -->
    <view :class="['banner', bannerCls]">
      <OutlineIcon :type="bannerIcon" :size="34" />
      <text class="banner-text">{{ a.banner }}</text>
    </view>

    <!-- 直白操作信号（核心卖点：什么时候买 / 什么时候卖） -->
    <view :class="['signal', signalCls]">
      <view class="sig-main">
        <text class="sig-label">{{ a.signal.label }}</text>
        <text class="sig-text">{{ a.signal.text }}</text>
      </view>
      <view class="sig-type">{{ a.sigType }}</view>
    </view>
    <view class="sig-detail anim-fade-up">
      <view class="sd-row">
        <text class="sd-k">触发条件</text>
        <text class="sd-v">{{ a.signal.reason }}</text>
      </view>
      <view class="sd-row">
        <text class="sd-k">确认信号</text>
        <text class="sd-v">{{ a.signal.confirm }}</text>
      </view>
    </view>

    <!-- 综合评分 + 阶段 + 风险 -->
    <view class="score-row anim-fade-up">
      <view class="score-ring" :style="{ borderColor: scoreColor }">
        <text class="score-num" :style="{ color: scoreColor }">{{ a.score }}</text>
        <text class="score-label">技术面</text>
      </view>
      <view class="score-meta subsection">
        <view class="meta-line">
          <text class="meta-k">当前趋势</text>
          <text class="meta-v">{{ a.trendText }}（{{ a.strength }}）</text>
        </view>
        <view class="meta-line">
          <text class="meta-k">运行阶段</text>
          <text class="meta-v">{{ a.stageText }}</text>
        </view>
        <view class="meta-line">
          <text class="meta-k">风险等级</text>
          <text class="meta-v" :style="{ color: riskColor }">{{ a.riskLevel }}风险</text>
        </view>
      </view>
    </view>

    <!-- 多维技术研判 -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '60ms' }">
      <view class="panel-title">
        <OutlineIcon type="pulldown" :size="28" color="var(--primary)" />
        <text>多维技术研判</text>
      </view>
      <view class="metric-grid">
        <view class="metric">
          <text class="m-k">趋势方向</text>
          <text class="m-v" :style="{ color: trendColor }">{{ a.trendText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">均线系统</text>
          <text class="m-v" :style="{ color: maColor }">{{ a.maState }}</text>
        </view>
        <view class="metric">
          <text class="m-k">ADX 趋势强度</text>
          <text class="m-v" :style="{ color: adxColor }">{{ adxStateText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">MACD</text>
          <text class="m-v" :style="{ color: macdColor }">{{ macdState }}</text>
        </view>
        <view class="metric">
          <text class="m-k">KDJ</text>
          <text class="m-v" :style="{ color: kdjColor }">{{ kdjStateText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">RSI(12)</text>
          <text class="m-v" :style="{ color: rsiColor }">{{ a.rNow.toFixed(2) }} · {{ rsiState }}</text>
        </view>
        <view class="metric">
          <text class="m-k">量能比(VMA5/20)</text>
          <text class="m-v" :style="{ color: volColor }">{{ a.volRatio.toFixed(2) }} · {{ volState }}</text>
        </view>
        <view class="metric">
          <text class="m-k">主力净流入(近5日)</text>
          <text class="m-v" :style="{ color: flowColor }">{{ flowText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">支撑 / 压力</text>
          <text class="m-v">{{ a.support.toFixed(2) }} / {{ a.resistance.toFixed(2) }}</text>
        </view>
        <view class="metric">
          <text class="m-k">布林 %B</text>
          <text class="m-v" :style="{ color: bollColor }">{{ bollPctBText }}</text>
        </view>
      </view>
    </view>

    <!-- 波动 · 风险 · 量能 -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '90ms' }">
      <view class="panel-title">
        <OutlineIcon type="color" :size="28" color="var(--primary)" />
        <text>波动 · 风险 · 量能</text>
      </view>
      <view class="metric-grid">
        <view class="metric">
          <text class="m-k">年化波动率</text>
          <text class="m-v">{{ volAnnText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">最大回撤(120日)</text>
          <text class="m-v" :style="{ color: mddColor }">{{ mddText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">ATR(占现价%)</text>
          <text class="m-v">{{ atrPctText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">平均换手率(20日)</text>
          <text class="m-v" :style="{ color: turnColor }">{{ turnText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">OBV 量能趋势</text>
          <text class="m-v" :style="{ color: obvColor }">{{ a.obvTrend }}</text>
        </view>
        <view class="metric">
          <text class="m-k">乖离率 BIAS(6/12/24)</text>
          <text class="m-v">{{ biasText }}</text>
        </view>
      </view>
    </view>

    <view class="panel news-panel anim-fade-up" :style="{ animationDelay: '160ms' }">
      <view class="panel-title">
        <OutlineIcon type="news" :size="28" color="var(--primary)" />
        <text>关联资讯</text>
      </view>
      <view v-if="newsItems.length" class="news-list">
        <view v-for="(it, i) in newsItems" :key="it.id" class="news-item" @click="openNews(it)">
          <view class="ni-head">
            <text :class="['ni-tag', tagCls(it)]">{{ tagText(it) }}</text>
            <text class="ni-title">{{ it.title }}</text>
          </view>
          <view v-if="it.summary" class="ni-sum">{{ it.summary }}</view>
          <view class="ni-foot">
            <text class="ni-src">{{ it.source }}</text>
            <text class="ni-time">{{ it.time || '时间未知' }}</text>
          </view>
        </view>
      </view>
      <view v-if="newsItems.length > 5" class="news-more">
        <text>滑动查看剩余 {{ newsItems.length - 5 }} 条 · 共 {{ newsItems.length }} 条</text>
      </view>
      <view v-if="!newsItems.length" class="news-empty">
        <text>暂无数据</text>
      </view>

      <view v-if="ns" class="news-impact subsection">
        <text class="ni-h">资讯如何影响分析</text>
        <view v-if="ns.catalysts.length" class="ni-row">
          <text class="ni-k ok">利好催化剂</text>
          <text class="ni-v">{{ ns.catalysts.join('、') }}</text>
        </view>
        <view v-if="ns.risks.length" class="ni-row">
          <text class="ni-k bad">利空风险事件</text>
          <text class="ni-v">{{ ns.risks.join('、') }}</text>
        </view>
        <text class="ni-note">资讯情绪已按 ±12 分纳入综合评分（当前贡献 {{ newsDelta > 0 ? '+' : '' }}{{ newsDelta }} 分），与量价 / 资金因子协同研判，不构成单独买卖依据。</text>
      </view>
    </view>

    <!-- 技术面评分（评分构成依据，置于结论之上） -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '170ms' }">
      <view class="panel-title">
        <OutlineIcon type="medal" :size="28" color="var(--primary)" />
        <text>技术面评分</text>
      </view>
      <view class="reason-list">
        <view v-for="(r, i) in a.scoreReasons" :key="i" class="reason">
          <text class="r-label">{{ r.label }}</text>
          <text class="r-delta" :style="{ color: r.delta > 0 ? 'var(--up)' : 'var(--down)' }">{{ r.delta > 0 ? '+' + r.delta : r.delta }}</text>
        </view>
      </view>
      <text class="base-note">基准分 50，按技术面多空因子加权得出（范围 5–95）；仅反映技术动能，非投资评级。</text>
    </view>

    <!-- 分析结论（综合所有量化因子的最终总结，置于关联资讯之后） -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '180ms' }">
      <view class="panel-title">
        <OutlineIcon type="chatbubble" :size="28" color="var(--primary)" />
        <text>分析结论</text>
      </view>
      <text class="conclusion">{{ conclusion }}</text>
    </view>

    <!-- 决策标签 -->
    <view class="decision anim-fade-up" :style="{ animationDelay: '200ms' }">
      <view v-if="a.watch" class="dec-item ok">
        <OutlineIcon type="star" :size="26" color="var(--primary)" />
        <text>可关注</text>
      </view>
      <view v-if="a.build" class="dec-item ok">
        <OutlineIcon type="fire" :size="26" color="var(--primary)" />
        <text>考虑建仓</text>
      </view>
      <view v-if="a.add" class="dec-item ok">
        <OutlineIcon type="plus" :size="26" color="var(--primary)" />
        <text>可加仓</text>
      </view>
      <view v-if="a.reduce" class="dec-item warn">
        <OutlineIcon type="arrow-down" :size="26" color="var(--down)" />
        <text>建议减仓</text>
      </view>
      <view v-if="!a.watch && !a.build && !a.add && !a.reduce" class="dec-item wait">
        <OutlineIcon type="info" :size="26" color="var(--text-2)" />
        <text>观望为主</text>
      </view>
    </view>

          <!-- 关键价位 -->
          <view class="levels anim-fade-up" :style="{ animationDelay: '240ms' }">
            <view class="lv subsection">
              <text class="lv-k">支撑位</text>
              <view class="lv-right">
                <PriceText :value="a.support" :size="30" />
                <text v-if="a.breakdown" class="lv-tag bad">已跌破</text>
                <text v-else-if="a.nearSup" class="lv-tag warn">临近</text>
              </view>
            </view>
            <view class="lv subsection">
              <text class="lv-k">建议买入区间</text>
              <text class="lv-v">{{ buyText }}</text>
            </view>
            <view class="lv subsection">
              <text class="lv-k">压力位</text>
              <view class="lv-right">
                <PriceText :value="a.resistance" :size="30" />
                <text v-if="a.breakout" class="lv-tag ok">已突破</text>
                <text v-else-if="a.nearRes" class="lv-tag warn">临近</text>
              </view>
            </view>
          </view>

    <!-- 风险提示 -->
    <view class="risks anim-fade-up" :style="{ animationDelay: '300ms' }">
      <view class="risks-title">
        <OutlineIcon type="flag" :size="28" color="var(--up)" />
        <text>风险提示</text>
      </view>
      <view v-for="(r, i) in a.risks" :key="i" class="risk-item">
        <text class="dot">·</text>
        <text class="risk-text">{{ r }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import PriceText from "./PriceText.vue";
import type { AnalysisResult } from "@/utils/analyzer";
import { tagNewsItem, type NewsItem, type NewsSignal } from "@/utils/newsSentiment";

const props = defineProps<{ result: AnalysisResult; news?: NewsItem[]; newsSignal?: NewsSignal | null }>();
// 关键：必须用 computed（不要立即 .value），否则 a 会变成 setup 时刻的静态快照，
// 切换股票时 props.result 变了但 a 不变 → 报告不刷新。
const a = computed(() => props.result);

const bannerCls = computed(() => {
  const c = a.value.bannerCls;
  if (c === "bad") return "bad";
  if (c === "warn") return "warn";
  return "ok";
});
const bannerIcon = computed(() => {
  if (bannerCls.value === "bad") return "info";
  if (bannerCls.value === "warn") return "info";
  return "medal";
});
// 操作信号卡片着色：买(绿) / 卖(红) / 持有(蓝) / 关注(橙) / 观望(灰)
const signalCls = computed(() => {
  const l = a.value.signal.level;
  return l === "buy" ? "buy" : l === "sell" ? "sell" : l === "hold" ? "hold" : l === "watch" ? "watch" : "wait";
});
const scoreColor = computed(() => {
  const s = a.value.score;
  if (s >= 70) return "var(--primary)";
  if (s >= 45) return "#ff9f1c";
  return "var(--up)";
});
const riskColor = computed(() => {
  const r = a.value.riskLevel;
  if (r === "低") return "var(--primary)";
  if (r === "中") return "#ff9f1c";
  return "var(--up)";
});

// ---------------- 多维研判派生 ----------------
const trendColor = computed(() => {
  const t = a.value.trend;
  if (t === "up" || t === "shake_up") return "var(--up)";
  if (t === "down" || t === "shake_down") return "var(--down)";
  return "var(--text)";
});
const maColor = computed(() => {
  const s = a.value.maState;
  if (s === "多头排列") return "var(--up)";
  if (s === "空头排列") return "var(--down)";
  return "var(--text)";
});
const macdState = computed(() => {
  const c = a.value.macdCross;
  if (c === "gold") return "金叉·看多";
  if (c === "dead") return "死叉·看空";
  const arr = a.value.macd.macd;
  const last = arr[arr.length - 1];
  return last > 0 ? "红柱·多头" : "绿柱·空头";
});
const macdColor = computed(() => {
  const c = a.value.macdCross;
  if (c === "gold") return "var(--up)";
  if (c === "dead") return "var(--down)";
  return "var(--text)";
});
const kdjStateText = computed(() => {
  const c = a.value.kdjCross;
  const cross = c === "gold" ? "金叉" : c === "dead" ? "死叉" : "持平";
  return cross + "·" + a.value.kdjState;
});
const kdjColor = computed(() => {
  const s = a.value.kdjState;
  if (s === "超买") return "var(--up)";
  if (s === "超卖") return "var(--down)";
  return "var(--text)";
});
const rsiState = computed(() => {
  const r = a.value.rNow;
  if (r > 70) return "超买";
  if (r < 30) return "超卖";
  return "中性";
});
const rsiColor = computed(() => {
  const r = a.value.rNow;
  if (r > 70) return "var(--up)";
  if (r < 30) return "var(--down)";
  return "var(--text)";
});
const volState = computed(() => {
  const v = a.value.volRatio;
  if (v > 1.15) return "放量";
  if (v < 0.85) return "缩量";
  return "温和";
});
const volColor = computed(() => {
  const v = a.value.volRatio;
  if (v > 1.15) return "var(--up)";
  if (v < 0.85) return "var(--down)";
  return "var(--text)";
});
const flowText = computed(() => {
  const f = a.value.f5;
  if (!f.has) return "暂无数据";
  return (f.sum > 0 ? "+" : "") + f.sum.toFixed(2) + "亿";
});
const flowColor = computed(() => {
  const f = a.value.f5;
  if (!f.has) return "var(--text-3)";
  return f.sum > 0 ? "var(--up)" : "var(--down)";
});
// 换手率无数据（降级源未提供）时统一用 --text-3 着色，与主力净流入无数据保持一致
const turnColor = computed(() => {
  const v = a.value.turnAvg;
  if (!(v > 0)) return "var(--text-3)";
  return "var(--text)";
});

// ---------------- 新增专业指标派生 ----------------
const adxLast = computed(() => {
  const arr = a.value.adx;
  return arr[arr.length - 1] || 0;
});
const adxStateText = computed(() => `${a.value.adxState} · ${adxLast.value.toFixed(2)}`);
const adxColor = computed(() => {
  if (adxLast.value < 20) return "var(--text)"; // 无趋势 → 中性
  const last = a.value.adx.length - 1;
  return a.value.pDI[last] > a.value.mDI[last] ? "var(--up)" : "var(--down)";
});
const bollPctBText = computed(() => {
  const v = a.value.bollPctB[a.value.bollPctB.length - 1];
  if (v == null) return "—";
  if (v > 1) return "触上轨·超买";
  if (v < 0) return "触下轨·超卖";
  if (v > 0.8) return "偏上轨";
  if (v < 0.2) return "偏下轨";
  return "中轨附近";
});
const bollColor = computed(() => {
  const v = a.value.bollPctB[a.value.bollPctB.length - 1];
  if (v == null) return "var(--text)";
  return v > 1 || v < 0 ? "var(--up)" : "var(--text)";
});
const volAnnText = computed(() => (a.value.volAnn * 100).toFixed(2) + "%");
const mddText = computed(() => (a.value.maxDrawdown * 100).toFixed(2) + "%");
const mddColor = computed(() =>
  a.value.maxDrawdown > 0.35 ? "var(--up)" : a.value.maxDrawdown > 0.2 ? "#ff9f1c" : "var(--text)"
);
const atrPctText = computed(() => a.value.atrPct.toFixed(2) + "%");
const turnText = computed(() => {
  const v = a.value.turnAvg;
  // 换手率仅东方财富提供；若该源未命中（降级到腾讯/新浪），turnover 全为 0，
  // 此时不应显示误导性的「0.00% · 正常」，明确告知用户数据缺失。
  if (!(v > 0)) return "暂无数据";
  return v.toFixed(2) + "% · " + a.value.turnState;
});
const obvColor = computed(() =>
  a.value.obvTrend.indexOf("配合") >= 0 ? "var(--up)" : "var(--down)"
);
const biasText = computed(
  () => `${a.value.bias6.toFixed(2)} / ${a.value.bias12.toFixed(2)} / ${a.value.bias24.toFixed(2)}`
);

// ---------------- 资讯情绪（供分析结论综合所有量化因子） ----------------
const ns = computed<NewsSignal | null>(() => props.newsSignal ?? null);
// 资讯情绪对综合评分的贡献（analyzer 同口径：±12 封顶）
const newsDelta = computed(() =>
  ns.value ? Math.max(-12, Math.min(12, Math.round((ns.value.score / 100) * 12))) : 0
);

// ---------------- 分析结论（综合合成） ----------------
const conclusion = computed(() => {
  const r = a.value;
  const parts: string[] = [];
  parts.push(`当前${r.trendText}（${r.strength}），均线${r.maState}，处于「${r.stageText}」阶段。${r.stageDetail}`);
  const pb = r.bollPctB[r.bollPctB.length - 1];
  const bollStr = pb == null ? "—" : pb.toFixed(2);
  parts.push(
    `技术面：MACD${r.macdCross === "gold" ? "金叉" : r.macdCross === "dead" ? "死叉" : "红绿柱交替"}，KDJ${r.kdjCross === "gold" ? "金叉" : r.kdjCross === "dead" ? "死叉" : "纠缠"}且${r.kdjState}，RSI(12)=${r.rNow.toFixed(2)}（${rsiState.value}），量能比${r.volRatio.toFixed(2)}（${volState.value}）；趋势强度 ADX(14)=${r.adx[r.adx.length - 1].toFixed(2)}（${r.adxState}），布林%B=${bollStr}，近20日平均换手率${r.turnAvg > 0 ? r.turnAvg.toFixed(2) + "%（" + r.turnState + "）" : "暂无数据"}。`
  );
  parts.push(
    `关键价位：支撑 ${r.support.toFixed(2)}（距现价 ${(r.distSup * 100).toFixed(2)}%），压力 ${r.resistance.toFixed(2)}（上方空间 ${(r.distRes * 100).toFixed(2)}%）；近5日主力净流入${flowText.value}。`
  );
  // 资讯情绪因子：与其他量化因子一并汇总进结论（放在关联资讯板块之后，形成完整闭环）
  if (ns.value) {
    const tone = newsDelta.value > 0 ? "偏多" : newsDelta.value < 0 ? "偏空" : "中性";
    const cats = ns.value.catalysts.length ? `利好催化含「${ns.value.catalysts.join("、")}」` : "";
    const risks = ns.value.risks.length ? `需留意「${ns.value.risks.join("、")}」等风险事件` : "";
    const conn = cats && risks ? "，" : "";
    parts.push(
      `资讯面：近3日相关公开资讯情绪${tone}（综合评分贡献 ${newsDelta.value > 0 ? "+" : ""}${newsDelta.value} 分）${cats}${conn}${risks}。`
    );
  }
  let rec = "";
  if (r.reduce) rec = "综合信号偏空，建议逢高减仓、严格控制仓位风险。";
  else if (r.add) rec = "趋势与资金配合良好，可于回调时分批加仓。";
  else if (r.build) rec = "处于相对低位且风险可控，可于支撑区附近考虑建仓。";
  else if (r.watch) rec = "可纳入自选关注，等待更优介入时点。";
  else rec = "多空信号交织，建议以观望为主，等待方向明朗。";
  parts.push(rec);
  parts.push(
    "综上，以上研判综合了趋势、均线、动量(KDJ/MACD/RSI)、量能与资金(主力净流入)、波动风险(ATR/最大回撤/换手率)及资讯情绪等全部量化因子，力求对各维度的一致性与矛盾点给出整体判断。"
  );
  parts.push("（注：「运行阶段」为技术形态识别，仅描述量价特征，不构成对主力行为的确认；以上仅为技术参考，非投资建议。）");
  return parts.join("");
});

// 买入区间：价格远离支撑时（analyzer 置 NaN）显示占位，避免给出无意义买点
const buyText = computed(() => {
  const r = a.value;
  if (r.buyLow == null || isNaN(r.buyLow) || isNaN(r.buyHigh)) return "—（远离支撑，按趋势跟踪）";
  return `${r.buyLow} ~ ${r.buyHigh}`;
});

// ---------------- 关联资讯展示列表 ----------------
// 直接使用 MarketView 已做完「相关性 + 最近3天 + 时间倒序」过滤后的条目（props.news），
// 确保呈现给投资者的每一条都与当前股票相关且时效有效。
// 情绪信号（ns / newsDelta）已上移至「分析结论」计算之前，用于让结论综合资讯情绪因子。
const newsItems = computed<NewsItem[]>(() => props.news || []);
function tagText(it: NewsItem): string {
  const t = tagNewsItem(it);
  return t === "bull" ? "利好" : t === "bear" ? "利空" : "中性";
}
function tagCls(it: NewsItem): string {
  const t = tagNewsItem(it);
  return t === "bull" ? "ok" : t === "bear" ? "bad" : "neutral";
}
function openNews(it: NewsItem) {
  if (!it.url) return;
  // H5 直接新窗口打开；非 H5（小程序）环境无 window，静默忽略避免运行报错
  try {
    if (typeof window !== "undefined" && (window as any).open) (window as any).open(it.url, "_blank");
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
.report {
  padding: 4rpx 0;
}
.banner {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 18rpx 22rpx;
  border-radius: var(--radius-sm);
  font-size: 26rpx;
  line-height: 1.6;
  margin-bottom: 18rpx;
}
.banner.ok {
  background: rgba(7, 193, 96, 0.1);
  color: var(--primary-dark);
}
.banner.warn {
  background: rgba(255, 159, 28, 0.12);
  color: #c87f00;
}
.banner.bad {
  background: rgba(250, 81, 81, 0.1);
  color: var(--up);
}
.banner-text {
  flex: 1;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 16rpx;
}
.score-ring {
  width: 118rpx;
  height: 118rpx;
  border-radius: 50%;
  border: 8rpx solid var(--primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.3s ease;
}
.score-num {
  font-size: 46rpx;
  font-weight: 700;
  line-height: 1;
}
.score-label {
  font-size: 20rpx;
  color: var(--text-2);
  margin-top: 4rpx;
}
.score-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.meta-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 25rpx;
}
.meta-k {
  color: var(--text-2);
}
.meta-v {
  color: var(--text);
  font-weight: 500;
}

/* 通用面板（研判 / 评分依据 / 结论） */
.panel {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 20rpx 24rpx;
  margin-bottom: 16rpx;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 27rpx;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 16rpx;
}

/* 多维研判：2 列网格 */
.metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rpx;
  background: var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.metric {
  background: var(--card);
  padding: 16rpx 18rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  text-align: center;
}
.m-k {
  font-size: 22rpx;
  color: var(--text);
  text-align: center;
}
.m-v {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.3rpx;
  text-align: center;
}

/* 评分依据 */
.reason-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.reason {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  font-size: 24rpx;
}
.r-label {
  color: var(--text);
}
.r-delta {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.base-note {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  color: var(--text-2);
}

/* 分析结论 */
.conclusion {
  display: block;
  font-size: 25rpx;
  color: var(--text);
  line-height: 1.75;
}

.decision {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-bottom: 16rpx;
}
.dec-item {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  font-size: 25rpx;
  font-weight: 500;
  transition: transform 0.15s ease;
}
.dec-item:active {
  transform: scale(0.96);
}
.dec-item.ok {
  background: rgba(7, 193, 96, 0.1);
  color: var(--primary-dark);
}
.dec-item.warn {
  background: rgba(9, 187, 7, 0.1);
  color: var(--down);
}
.dec-item.wait {
  background: var(--card-2);
  color: var(--text-2);
}

.levels {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-bottom: 16rpx;
}
.lv {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lv-k {
  color: var(--text-2);
  font-size: 25rpx;
}
.lv-v {
  font-size: 27rpx;
  font-weight: 600;
  color: var(--text);
}

/* 直白操作信号卡片（核心卖点） */
.signal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  margin-bottom: 12rpx;
}
.signal.buy { background: rgba(7, 193, 96, 0.12); border-left: 8rpx solid var(--primary); }
.signal.sell { background: rgba(250, 81, 81, 0.1); border-left: 8rpx solid var(--up); }
.signal.hold { background: rgba(59, 130, 246, 0.1); border-left: 8rpx solid #3b82f6; }
.signal.watch { background: rgba(255, 159, 28, 0.12); border-left: 8rpx solid #ff9f1c; }
.signal.wait { background: var(--card-2); border-left: 8rpx solid var(--border); }
.sig-main { display: flex; flex-direction: column; gap: 6rpx; flex: 1; min-width: 0; }
.sig-label { font-size: 38rpx; font-weight: 800; line-height: 1.1; }
.signal.buy .sig-label { color: var(--primary-dark); }
.signal.sell .sig-label { color: var(--up); }
.signal.hold .sig-label { color: #2563eb; }
.signal.watch .sig-label { color: #c87f00; }
.signal.wait .sig-label { color: var(--text); }
.sig-text { font-size: 24rpx; color: var(--text); line-height: 1.5; }
.sig-type {
  flex: none;
  font-size: 22rpx;
  font-weight: 600;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text);
  margin-left: 16rpx;
}
.sig-detail {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16rpx 24rpx;
  margin-bottom: 16rpx;
}
.sd-row { display: flex; gap: 16rpx; padding: 8rpx 0; }
.sd-k { flex: none; font-size: 23rpx; color: var(--text-2); width: 128rpx; }
.sd-v { flex: 1; font-size: 24rpx; color: var(--text); line-height: 1.6; }

/* 关键价位状态徽标 */
.lv-right { display: flex; align-items: center; gap: 12rpx; }
.lv-tag { font-size: 20rpx; padding: 4rpx 12rpx; border-radius: 8rpx; font-weight: 600; }
.lv-tag.ok { color: var(--primary-dark); background: rgba(7, 193, 96, 0.12); }
.lv-tag.bad { color: var(--up); background: rgba(250, 81, 81, 0.12); }
.lv-tag.warn { color: #c87f00; background: rgba(255, 159, 28, 0.14); }

.risks {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 20rpx 26rpx;
}
.risks-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 27rpx;
  font-weight: 600;
  margin-bottom: 10rpx;
}
.risk-item {
  display: flex;
  gap: 8rpx;
  padding: 5rpx 0;
  font-size: 24rpx;
  color: var(--text);
  line-height: 1.6;
}
.dot {
  color: var(--up);
}

/* 关联资讯板块 */
.news-panel { margin-bottom: 16rpx; }
.news-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-top: 4rpx;
  /* 固定约 5 条资讯的高度，超出内部滚动，不无限撑长面板 */
  max-height: 920rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-right: 4rpx;
}
.news-more {
  margin-top: 10rpx;
  text-align: center;
  font-size: 20rpx;
  color: var(--text-2);
}
.news-item {
  background: var(--card-2);
  border-radius: var(--radius-sm);
  padding: 14rpx 18rpx;
  transition: transform 0.12s ease;
}
.news-item:active { transform: scale(0.985); }
.ni-head {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
}
.ni-tag {
  flex: none;
  font-size: 20rpx;
  font-weight: 700;
  padding: 3rpx 12rpx;
  border-radius: 6rpx;
  margin-top: 4rpx;
}
.ni-tag.ok { color: var(--up); background: rgba(250, 81, 81, 0.14); }
.ni-tag.bad { color: var(--down); background: rgba(9, 187, 7, 0.14); }
.ni-tag.neutral { color: var(--text-2); background: var(--border); }
.ni-title {
  flex: 1;
  font-size: 25rpx;
  font-weight: 600;
  color: var(--text);
  line-height: 1.5;
}
.ni-sum {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--text-2);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.ni-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 8rpx;
  font-size: 20rpx;
  color: var(--text-2);
}
.news-empty {
  font-size: 23rpx;
  color: var(--text-3);
  text-align: center;
  padding: 24rpx 0;
  line-height: 1.6;
}
.news-impact {
  margin-top: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.ni-h {
  font-size: 23rpx;
  font-weight: 600;
  color: var(--text);
}
.ni-row {
  display: flex;
  gap: 12rpx;
  align-items: baseline;
}
.ni-k {
  flex: none;
  font-size: 21rpx;
  font-weight: 600;
  padding: 3rpx 12rpx;
  border-radius: 6rpx;
}
.ni-k.ok { color: var(--up); background: rgba(250, 81, 81, 0.12); }
.ni-k.bad { color: var(--down); background: rgba(9, 187, 7, 0.12); }
.ni-v {
  flex: 1;
  font-size: 23rpx;
  color: var(--text);
  line-height: 1.5;
}
.ni-note {
  display: block;
  margin-top: 4rpx;
  font-size: 21rpx;
  color: var(--text-2);
  line-height: 1.55;
}
</style>
