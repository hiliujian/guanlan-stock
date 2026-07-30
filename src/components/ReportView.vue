<template>
  <view class="report">
    <!-- 顶部横幅 -->
    <view :class="['banner', bannerCls]">
      <OutlineIcon :type="bannerIcon" :size="34" />
      <text class="banner-text">{{ a.banner }}</text>
    </view>

    <!-- 综合评分 + 阶段 + 风险 -->
    <view class="score-row anim-fade-up">
      <view class="score-ring" :style="{ borderColor: scoreColor }">
        <text class="score-num" :style="{ color: scoreColor }">{{ a.score }}</text>
        <text class="score-label">技术面</text>
      </view>
      <view class="score-meta">
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
          <text class="m-k">MACD</text>
          <text class="m-v" :style="{ color: macdColor }">{{ macdState }}</text>
        </view>
        <view class="metric">
          <text class="m-k">KDJ</text>
          <text class="m-v" :style="{ color: kdjColor }">{{ kdjStateText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">RSI(12)</text>
          <text class="m-v" :style="{ color: rsiColor }">{{ a.rNow.toFixed(0) }} · {{ rsiState }}</text>
        </view>
        <view class="metric">
          <text class="m-k">量能(量比)</text>
          <text class="m-v" :style="{ color: volColor }">{{ a.volRatio.toFixed(2) }} · {{ volState }}</text>
        </view>
        <view class="metric">
          <text class="m-k">资金流向</text>
          <text class="m-v" :style="{ color: flowColor }">{{ flowText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">支撑 / 压力</text>
          <text class="m-v">{{ a.support.toFixed(2) }} / {{ a.resistance.toFixed(2) }}</text>
        </view>
      </view>
    </view>

    <!-- 综合评分依据 -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '120ms' }">
      <view class="panel-title">
        <OutlineIcon type="medal" :size="28" color="var(--primary)" />
        <text>技术面评分依据</text>
      </view>
      <view class="reason-list">
        <view v-for="(r, i) in a.scoreReasons" :key="i" class="reason">
          <text class="r-label">{{ r.label }}</text>
          <text class="r-delta" :style="{ color: r.delta > 0 ? 'var(--up)' : 'var(--down)' }">{{ r.delta > 0 ? '+' + r.delta : r.delta }}</text>
        </view>
      </view>
      <text class="base-note">基准分 50，按技术面多空因子加权得出（范围 5–95）；仅反映技术动能，非投资评级。</text>
    </view>

    <!-- 分析结论 -->
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
        <OutlineIcon type="info" :size="26" color="var(--text-3)" />
        <text>观望为主</text>
      </view>
    </view>

    <!-- 关键价位 -->
    <view class="levels anim-fade-up" :style="{ animationDelay: '240ms' }">
      <view class="lv">
        <text class="lv-k">支撑位</text>
        <PriceText :value="a.support" :size="30" />
      </view>
      <view class="lv">
        <text class="lv-k">建议买入区间</text>
        <text class="lv-v">{{ buyText }}</text>
      </view>
      <view class="lv">
        <text class="lv-k">压力位</text>
        <PriceText :value="a.resistance" :size="30" />
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

const props = defineProps<{ result: AnalysisResult }>();
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
  return "var(--text-2)";
});
const maColor = computed(() => {
  const s = a.value.maState;
  if (s === "多头排列") return "var(--up)";
  if (s === "空头排列") return "var(--down)";
  return "var(--text-2)";
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
  return "var(--text-2)";
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
  return "var(--text-2)";
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
  return "var(--text-2)";
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
  return "var(--text-2)";
});
const flowText = computed(() => {
  const f = a.value.f5;
  if (!f.has) return "暂无数据";
  return f.sum > 0 ? "净流入" + f.sum.toFixed(2) + "亿" : "净流出" + Math.abs(f.sum).toFixed(2) + "亿";
});
const flowColor = computed(() => {
  const f = a.value.f5;
  if (!f.has) return "var(--text-3)";
  return f.sum > 0 ? "var(--up)" : "var(--down)";
});

// ---------------- 分析结论（综合合成） ----------------
const conclusion = computed(() => {
  const r = a.value;
  const parts: string[] = [];
  parts.push(`当前${r.trendText}（${r.strength}），均线${r.maState}，处于「${r.stageText}」阶段。${r.stageDetail}`);
  parts.push(
    `技术面：MACD${r.macdCross === "gold" ? "金叉" : r.macdCross === "dead" ? "死叉" : "红绿柱交替"}，KDJ${r.kdjCross === "gold" ? "金叉" : r.kdjCross === "dead" ? "死叉" : "纠缠"}且${r.kdjState}，RSI(12)=${r.rNow.toFixed(0)}（${rsiState.value}），量比${r.volRatio.toFixed(2)}（${volState.value}）。`
  );
  parts.push(
    `关键价位：支撑 ${r.support.toFixed(2)}（距现价 ${(r.distSup * 100).toFixed(1)}%），压力 ${r.resistance.toFixed(2)}（上方空间 ${(r.distRes * 100).toFixed(1)}%）；${flowText.value}。`
  );
  let rec = "";
  if (r.reduce) rec = "综合信号偏空，建议逢高减仓、严格控制仓位风险。";
  else if (r.add) rec = "趋势与资金配合良好，可于回调时分批加仓。";
  else if (r.build) rec = "处于相对低位且风险可控，可于支撑区附近考虑建仓。";
  else if (r.watch) rec = "可纳入自选关注，等待更优介入时点。";
  else rec = "多空信号交织，建议以观望为主，等待方向明朗。";
  parts.push(rec);
  parts.push("（注：「运行阶段」为技术形态识别，仅描述量价特征，不构成对主力行为的确认；以上仅为技术参考，非投资建议。）");
  return parts.join("");
});

// 买入区间：价格远离支撑时（analyzer 置 NaN）显示占位，避免给出无意义买点
const buyText = computed(() => {
  const r = a.value;
  if (r.buyLow == null || isNaN(r.buyLow) || isNaN(r.buyHigh)) return "—（远离支撑，按趋势跟踪）";
  return `${r.buyLow} ~ ${r.buyHigh}`;
});
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
  color: var(--text-3);
  margin-top: 4rpx;
}
.score-meta {
  flex: 1;
}
.meta-line {
  display: flex;
  justify-content: space-between;
  padding: 7rpx 0;
  border-bottom: 1rpx solid var(--border);
  font-size: 25rpx;
}
.meta-line:last-child {
  border-bottom: none;
}
.meta-k {
  color: var(--text-3);
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
  gap: 6rpx;
}
.m-k {
  font-size: 22rpx;
  color: var(--text-3);
}
.m-v {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.3rpx;
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
  color: var(--text-2);
}
.r-delta {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.base-note {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  color: var(--text-3);
}

/* 分析结论 */
.conclusion {
  display: block;
  font-size: 25rpx;
  color: var(--text-2);
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
  color: var(--text-3);
}

.levels {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 6rpx 26rpx;
  margin-bottom: 16rpx;
}
.lv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--border);
}
.lv:last-child {
  border-bottom: none;
}
.lv-k {
  color: var(--text-3);
  font-size: 25rpx;
}
.lv-v {
  font-size: 27rpx;
  font-weight: 600;
  color: var(--text);
}

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
  color: var(--text-2);
  line-height: 1.6;
}
.dot {
  color: var(--up);
}
</style>
