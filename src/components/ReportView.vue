<template>
  <view class="report">
    <!-- 顶部横幅 -->
    <view :class="['banner', bannerCls]">
      <OutlineIcon :type="bannerIcon" :size="34" />
      <text class="banner-text">{{ a.banner }}</text>
    </view>

    <!-- 直白操作信号（核心卖点：什么时候买 / 什么时候卖）
         信号头部 + 盘中异动警示 + 触发/确认详情上下拼接为一张连通卡片，共享圆角阴影与色条 -->
    <view :class="['signal-card', signalCls]">
      <view class="signal">
        <view class="sig-main">
          <text class="sig-label">{{ a.signal.label }}</text>
          <text class="sig-text">{{ a.signal.text }}</text>
        </view>
        <view class="sig-type">{{ a.sigType }}</view>
      </view>
      <!-- 今日盘中异动（A 股特有：涨停/跌停/炸板/跌停开板，实时警示，紧随买卖信号） -->
      <view v-if="a.intradayMove.label" :class="['sig-alert', intradayCls]">
        <view class="sa-live" />
        <text class="sa-label">{{ a.intradayMove.label }}</text>
        <text class="sa-pct" :style="{ color: intradayPctColor }">{{ intradayPctText }}</text>
        <view class="sa-spacer" />
        <text class="sa-sub">{{ intradaySub }}</text>
      </view>
      <view class="sig-detail">
        <view class="sd-row">
          <text class="sd-k">触发条件</text>
          <text class="sd-v">{{ a.signal.reason }}</text>
        </view>
        <view class="sd-row">
          <text class="sd-k">确认信号</text>
          <text class="sd-v">{{ a.signal.confirm }}</text>
        </view>
      </view>
    </view>

    <!-- 技术面评分（单张卡片：总分 → 趋势/阶段/风险 → 构成明细，一气呵成） -->
    <view class="panel score-panel anim-fade-up">
      <view class="panel-title">
        <OutlineIcon type="medal" :size="28" color="var(--primary)" />
        <text>技术面评分</text>
      </view>
      <view class="score-row">
        <view class="score-ring" :style="{ borderColor: scoreColor }">
          <text class="score-num" :style="{ color: scoreColor }">{{ a.score }}</text>
          <text class="score-label">得分</text>
        </view>
        <view class="score-meta subsection">
          <view class="meta-line">
            <text class="meta-k">当前趋势</text>
            <text class="meta-v">{{ a.trendText }}（{{ a.strength }}）</text>
          </view>
          <view class="meta-line">
            <text class="meta-k">量价阶段</text>
            <text class="meta-v">{{ a.stageText }}</text>
          </view>
          <view class="meta-line">
            <text class="meta-k">风险等级</text>
            <text class="meta-v" :style="{ color: riskColor }">{{ a.riskLevel }}风险</text>
          </view>
        </view>
      </view>
      <view class="score-divider" />
      <view class="reason-list">
        <view v-for="(r, i) in a.scoreReasons" :key="i" class="reason">
          <text class="r-label">{{ r.label }}</text>
          <text class="r-delta" :style="{ color: r.delta > 0 ? 'var(--up)' : 'var(--down)' }">{{ r.delta > 0 ? '+' + r.delta : r.delta }}</text>
        </view>
      </view>
      <text class="base-note">基准分 50，按技术面多空因子加权得出（范围 5–95）；仅反映技术动能，非投资评级。</text>
    </view>

    <!-- 关键价位 · 操作建议（支撑/买点/压力 + 决策标签，小白最关心的「在哪买卖」紧跟评分） -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '40ms' }">
      <view class="panel-title">
        <OutlineIcon type="bars" :size="28" color="var(--primary)" />
        <text>关键价位 · 操作建议</text>
      </view>
      <view class="levels">
        <view class="lv subsection">
          <text class="lv-k">支撑位</text>
          <view class="lv-right">
            <PriceText :value="a.support" :neutral="true" :size="24" :weight="400" :class="supPriceCls" />
            <text v-if="a.breakdown" class="lv-tag bad">已跌破</text>
            <text v-else-if="a.nearSup" class="lv-tag warn">临近</text>
          </view>
        </view>
        <view class="lv subsection">
          <text class="lv-k">建议买入区间</text>
          <text class="lv-v" :class="buyActive ? 'lv-bz-ok' : ''">{{ buyText }}</text>
        </view>
        <view class="lv subsection">
          <text class="lv-k">压力位</text>
          <view class="lv-right">
            <PriceText :value="a.resistance" :neutral="true" :size="24" :weight="400" :class="resPriceCls" />
            <text v-if="a.breakout" class="lv-tag ok">已突破</text>
            <text v-else-if="a.nearRes" class="lv-tag warn">临近</text>
          </view>
        </view>
      </view>
      <view class="decision">
        <!-- 图标不传 color，通过 stroke="currentColor" 继承 .dec-item 父元素颜色，
             避免每个图标手动传 color prop 造成多套颜色源 -->
        <view v-if="a.watch" class="dec-item ok">
          <OutlineIcon type="star" :size="26" />
          <text>可关注</text>
        </view>
        <view v-if="a.build" class="dec-item ok">
          <OutlineIcon type="fire" :size="26" />
          <text>考虑建仓</text>
        </view>
        <view v-if="a.add" class="dec-item ok">
          <OutlineIcon type="plus" :size="26" />
          <text>可加仓</text>
        </view>
        <view v-if="a.reduce" class="dec-item warn">
          <OutlineIcon type="arrow-down" :size="26" />
          <text>建议减仓</text>
        </view>
        <view v-if="!a.watch && !a.build && !a.add && !a.reduce" class="dec-item wait">
          <OutlineIcon type="info" :size="26" />
          <text>观望为主</text>
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
          <text class="m-k">趋势强度(ADX)</text>
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
          <text class="m-v" :style="{ color: rsiColor }">{{ rsiText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">量能比(VMA5/20)</text>
          <text class="m-v" :style="{ color: volColor }">{{ a.volRatio.toFixed(2) }} · {{ volState }}</text>
        </view>
        <view class="metric">
          <text class="m-k">量价背离</text>
          <text class="m-v" :style="{ color: divColor }">{{ divText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">主力净流入(近5日)</text>
          <text class="m-v" :style="{ color: flow5Color }">{{ flow5Text }}</text>
        </view>
        <view class="metric">
          <text class="m-k">主力净流入(近10日)</text>
          <text class="m-v" :style="{ color: flow10Color }">{{ flow10Text }}</text>
        </view>
        <view class="metric">
          <text class="m-k">主力净流入(近20日)</text>
          <text class="m-v" :style="{ color: flow20Color }">{{ flow20Text }}</text>
        </view>
        <view class="metric">
          <text class="m-k">布林%B</text>
          <text class="m-v" :style="{ color: bollColor }">{{ bollPctBText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">乖离率 BIAS</text>
          <text class="m-v" :style="{ color: biasColor }">{{ biasText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">布林带宽</text>
          <text class="m-v" :style="{ color: bollBwColor }">{{ bollBwText }}</text>
        </view>
      </view>
    </view>

    <!-- 信号回测 · 历史胜率：为「量化预判」提供历史校准（样本不足时优雅降级） -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '70ms' }">
      <view class="panel-title">
        <OutlineIcon type="check" :size="28" color="var(--primary)" />
        <text>信号回测 · 历史胜率</text>
      </view>
      <template v-if="btValid">
        <view class="metric-grid">
          <view class="metric">
            <text class="m-k">买入信号</text>
            <text class="m-v" :style="{ color: btBuyColor }">{{ btBuyText }}</text>
          </view>
          <view class="metric">
            <text class="m-k">卖出信号</text>
            <text class="m-v" :style="{ color: btSellColor }">{{ btSellText }}</text>
          </view>
        </view>
        <text class="base-note">口径：仅统计「MA5/20 交叉 + 放量确认」单一规则（近 {{ a.backtest.bars }} 根日线 · 20 日前瞻）的历史胜率，不代表对综合评分与买卖信号的验证；历史参考，非未来保证。</text>
      </template>
      <view v-else class="news-empty">
        <text>样本不足</text>
      </view>
    </view>

    <!-- 筹码分布 · 成本结构（CYQ 近似）：A 股「成本密集区」是支撑压力的核心参考 -->
    <view v-if="a.chip" class="panel chip-panel anim-fade-up" :style="{ animationDelay: '80ms' }">
      <view class="panel-title">
        <OutlineIcon type="layers" :size="28" color="var(--primary)" />
        <text>筹码分布 · 成本结构</text>
      </view>
      <view class="metric-grid">
        <view class="metric">
          <text class="m-k">平均持仓成本</text>
          <text class="m-v" :style="{ color: chipDistColor }">{{ chipAvgText }}（{{ chipDistLabel }}）</text>
        </view>
        <view class="metric">
          <text class="m-k">筹码密集峰</text>
          <text class="m-v">{{ chipPeakText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">获利盘比例</text>
          <text class="m-v" :style="{ color: chipProfitColor }">{{ chipProfitText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">90% 筹码区间</text>
          <text class="m-v">{{ chipRangeText }}</text>
        </view>
      </view>
      <text class="base-note">筹码为近 120 日成交量加权近似（CYQ）：获利盘过高易回吐，跌破密集峰多数人被套。</text>
    </view>

    <!-- 波动与风险 -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '90ms' }">
      <view class="panel-title">
        <OutlineIcon type="color" :size="28" color="var(--primary)" />
        <text>波动与风险</text>
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
          <text class="m-k">日均波动(ATR%)</text>
          <text class="m-v">{{ atrPctText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">单日VaR(95%)</text>
          <text class="m-v" :style="{ color: var95Color }">{{ var95Text }}</text>
        </view>
        <view class="metric">
          <text class="m-k">120日区间位置</text>
          <text class="m-v" :style="{ color: rangePosColor }">{{ rangePosText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">平均换手率(20日)</text>
          <text class="m-v" :style="{ color: turnColor }">{{ turnText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">OBV 能量潮</text>
          <text class="m-v" :style="{ color: obvColor }">{{ a.obvTrend }}</text>
        </view>
      </view>
      <text class="base-note">VaR 为近 120 日日收益的 5% 分位（正常市场下 95% 交易日单日跌幅不超此值）；区间位置 0=区间底 100=区间顶。</text>
    </view>

    <!-- 大盘 · 市场环境（beta 感知：宽基指数 + 行业板块 + 市场情绪 + 量能 一体纳入）
         置于「波动与风险」之后、关联资讯之前：先把个股自身的技术面与风险全维度体检做完，
         再拉远看大盘 regime 与行业节奏，最后由「分析结论」统一收束——符合「个股 → 环境 → 结论」的阅读顺序。
         卡片永远渲染：指数K线缺失时各维度显示「暂无数据」（analyzer 已优雅降级）。 -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '120ms' }">
      <view class="panel-title">
        <OutlineIcon type="arrow-up" :size="28" color="var(--primary)" />
        <text>大盘 · 市场环境</text>
      </view>
      <view class="metric-grid">
        <view class="metric">
          <text class="m-k">{{ a.marketEnv.indexName }}</text>
          <text class="m-v" :style="{ color: indexDisplayColor }">{{ a.marketEnv.indexTrendDisplay }}</text>
        </view>
        <view class="metric">
          <text class="m-k">大盘趋势强度(ADX)</text>
          <text class="m-v" :style="{ color: indexDisplayColor }">{{ marketIdxStrength }}</text>
        </view>
        <view class="metric">
          <text class="m-k">个股与大盘协同</text>
          <text class="m-v" :style="{ color: alignColor }">{{ a.marketEnv.alignText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">市场情绪</text>
          <text class="m-v" :style="{ color: breadthColor }">{{ a.marketEnv.breadthText }}</text>
        </view>
        <view class="metric">
          <text class="m-k">大盘量能</text>
          <text class="m-v" :style="{ color: mktVolColor }">{{ a.marketEnv.mktVolText }}<template v-if="a.marketEnv.idxVolRatio && a.marketEnv.mktVolText !== '暂无数据'">（{{ a.marketEnv.idxVolRatio.toFixed(2) }}）</template></text>
        </view>
        <view class="metric">
          <text class="m-k">仓位建议</text>
          <text class="m-v" :style="{ color: positionColor }">{{ a.marketEnv.positionAdvice }}</text>
        </view>
        <template v-if="a.marketEnv.sectorName">
          <view class="metric">
            <text class="m-k">所属行业</text>
            <text class="m-v">{{ a.marketEnv.sectorName }}</text>
          </view>
          <view class="metric">
            <text class="m-k">行业趋势</text>
            <text class="m-v" :style="{ color: sectorDisplayColor }">{{ a.marketEnv.sectorTrendDisplay }}</text>
          </view>
          <view class="metric">
            <text class="m-k">个股与行业协同</text>
            <text class="m-v" :style="{ color: sectorAlignColor }">{{ a.marketEnv.sectorAlignText }}</text>
          </view>
        </template>
      </view>
      <text class="base-note">大盘环境已纳入综合评分（最高 ±18 分）；逆势或行业逆风时请降仓避险。</text>
    </view>

    <view class="panel news-panel anim-fade-up" :style="{ animationDelay: '160ms' }">
      <view class="panel-title">
        <OutlineIcon type="news" :size="28" color="var(--primary)" />
        <text>关联资讯</text>
      </view>
      <view v-if="newsItems.length" class="news-list">
        <view v-for="it in newsItems" :key="it.id" class="news-item" @click="openNews(it)">
          <view class="ni-head">
            <text :class="['ni-tag', tagCls(it)]">{{ tagText(it) }}</text>
            <text class="ni-title">{{ it.title }}</text>
          </view>
          <view v-if="it.summary" class="ni-sum">{{ it.summary }}</view>
          <view class="ni-foot">
            <view class="ni-foot-l">
              <text class="ni-src">{{ it.source }}</text>
              <text v-if="it.scope === 'industry'" class="ni-scope">板块</text>
            </view>
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
        <text class="ni-note">资讯情绪已按 ±12 分纳入综合评分（当前贡献 {{ newsDelta > 0 ? '+' : '' }}{{ newsDelta }} 分）。</text>
      </view>
    </view>

    <!-- 分析结论（综合所有量化因子的最终总结，置于关联资讯之后） -->
    <view class="panel anim-fade-up" :style="{ animationDelay: '170ms' }">
      <view class="panel-title">
        <OutlineIcon type="chatbubble" :size="28" color="var(--primary)" />
        <text>分析结论</text>
      </view>
      <text class="conclusion">{{ conclusion }}</text>
    </view>

    <!-- 风险提示 -->
    <view class="risks anim-fade-up" :style="{ animationDelay: '200ms' }">
      <view class="risks-title">
        <OutlineIcon type="flag" :size="28" color="var(--warn)" />
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
  // 用 star-filled 代替 medal，避免与"技术面评分"面板的 medal 图标重复。
  return "star-filled";
});
// 操作信号卡片着色（A股约定：买/看涨=红 var(--up)、卖/看跌=绿 var(--down)、持有(蓝)/关注(橙)/观望(灰)）
const signalCls = computed(() => {
  const l = a.value.signal.level;
  return l === "buy" ? "buy" : l === "sell" ? "sell" : l === "hold" ? "hold" : l === "watch" ? "watch" : "wait";
});
// 技术评分着色（A股约定：高分=看多强=利好=红、低分=看空弱=利空=绿、中分橙）
const scoreColor = computed(() => {
  const s = a.value.score;
  if (s >= 70) return "var(--up)";
  if (s >= 45) return "var(--warn)";
  return "var(--down)";
});
// 风险等级着色（A股约定：低风险=利好=红、高风险=利空=绿、中风险橙）
const riskColor = computed(() => {
  const r = a.value.riskLevel;
  if (r === "低") return "var(--up)";
  if (r === "中") return "var(--warn)";
  return "var(--down)";
});

// ---------------- 大盘环境派生 ----------------
// 合成唯一结论的着色：今日动能定性（超跌反弹/修复企稳/反转信号=偏多；见顶信号=偏空；回踩/调整=中性）+ 中期趋势
const indexDisplayColor = computed(() => {
  const t = a.value.marketEnv?.indexTrendDisplay || "";
  if (t === "超跌反弹" || t === "修复企稳" || t === "反转信号") return "var(--up)";
  if (t === "见顶信号") return "var(--down)";
  // 中性也是真实结论（正常回踩/阶段调整），用墨黑；淡黑仅保留给下方「暂无数据」占位
  if (t === "正常回踩" || t === "阶段调整") return "var(--r-ink)";
  if (t === "上涨趋势" || t === "震荡偏强") return "var(--up)";
  if (t === "下跌趋势" || t === "震荡偏弱") return "var(--down)";
  return "var(--text-2)";
});
const marketIdxStrength = computed(() => {
  const env = a.value.marketEnv;
  if (!env || env.indexTrend === "暂无数据") return "暂无数据";
  const adx = env.indexAdx || 0;
  if (adx >= 40) return "强趋势(ADX " + adx.toFixed(0) + ")";
  if (adx >= 25) return "明显趋势(ADX " + adx.toFixed(0) + ")";
  if (adx >= 20) return "趋势初现(ADX " + adx.toFixed(0) + ")";
  return "震荡(ADX " + adx.toFixed(0) + ")";
});
const alignColor = computed(() => {
  const env = a.value.marketEnv;
  // 淡黑仅用于「暂无数据」占位；真实内容（含中性「与大盘方向一致」）一律墨黑。
  // A股约定同 breadthColor：顺大盘（正分=利多）红、逆大盘（负分=利空）绿、中性墨黑。
  // 此前正分用 --primary 品牌绿，与相邻 breadthColor 红绿口径相悖且和利空绿混淆，已统一。
  if (!env || env.alignText === "暂无数据") return "var(--text-2)";
  const s = env.alignScore || 0;
  if (s > 0) return "var(--up)";
  if (s < 0) return "var(--down)";
  return "var(--r-ink)";
});
const breadthColor = computed(() => {
  const env = a.value.marketEnv;
  if (!env || env.breadthText === "暂无数据") return "var(--text-2)";
  const s = env.breadthScore || 0;
  if (s > 0) return "var(--up)";
  if (s < 0) return "var(--down)";
  return "var(--r-ink)";
});
// 大盘量能颜色：放量+上涨趋势=红(量价配合)、放量+下跌趋势=绿(恐慌抛售)；缩量/量能正常=中性墨黑
const mktVolColor = computed(() => {
  const env = a.value.marketEnv;
  if (!env || env.mktVolText === "暂无数据") return "var(--text-2)";
  if (env.mktVolText === "大盘缩量") return "var(--r-ink)";
  if (env.mktVolText === "大盘放量") return env.indexTrend === "上涨趋势" || env.indexTrend === "震荡偏强" ? "var(--up)" : "var(--down)";
  return "var(--r-ink)";
});
// 行业板块维度着色：合成唯一结论（行业今日动能定性 + 中期行业趋势）同口径着色
const sectorDisplayColor = computed(() => {
  const t = a.value.marketEnv?.sectorTrendDisplay || "";
  if (t === "超跌反弹" || t === "修复企稳" || t === "反转信号") return "var(--up)";
  if (t === "见顶信号") return "var(--down)";
  // 中性也是真实结论，用墨黑；淡黑仅保留给未定义（无行业数据）的占位
  if (t === "正常回踩" || t === "阶段调整") return "var(--r-ink)";
  if (t === "上涨趋势" || t === "震荡偏强") return "var(--up)";
  if (t === "下跌趋势" || t === "震荡偏弱") return "var(--down)";
  return "var(--text-2)";
});
const sectorAlignColor = computed(() => {
  const s = a.value.marketEnv?.sectorAlignScore || 0;
  // 与 alignColor 同口径：顺行业（正分=利多）红、逆行业（负分=利空）绿、中性灰
  if (s > 0) return "var(--up)";
  if (s < 0) return "var(--down)";
  return "var(--text-2)";
});
// 仓位建议着色（A股约定：积极(≥55%)=看多=红、防御(≤30%)=看空=绿、中性灰——与「顺势多/逆势少」的风险预算一致）
const positionColor = computed(() => {
  const pct = a.value.marketEnv?.positionPct || 0;
  const advice = a.value.marketEnv?.positionAdvice || "";
  if (advice === "暂无数据") return "var(--text-2)";
  if (pct >= 55) return "var(--up)";
  if (pct <= 30) return "var(--down)";
  // 中性仓位建议（30%–55%）是真实结论，用墨黑而非淡黑
  return "var(--r-ink)";
});
// 今日盘中异动样式（A股约定：涨=红 var(--up)、跌=绿 var(--down)）
const intradayCls = computed(() => {
  const m = a.value.intradayMove;
  if (m.isLimitUp || m.isBrokenLimitDown || m.isBigUp) return "up"; // 封涨停 / 跌停开板(转强) / 今日大涨 → 红
  if (m.isLimitDown || m.isBrokenLimitUp || m.isBigDown) return "down"; // 封跌停 / 炸板(转弱) / 今日大跌 → 绿
  return "";
});
// 盘中异动副文案：依据走势标记给出简洁的盘中解读（补充主标签，一眼看懂发生了什么）
const intradaySub = computed(() => {
  const m = a.value.intradayMove;
  if (m.isLimitUp) return "强势封板";
  if (m.isLimitDown) return "弱势封板";
  if (m.isBrokenLimitUp) return "曾封涨停后打开";
  if (m.isBrokenLimitDown) return "跌停打开·恐慌释放";
  if (m.isBigUp) return "放量大涨，短线动能强";
  if (m.isBigDown) return "放量急跌，注意风险";
  return "";
});
// 异动数值展示文本：
// 跌停开板/炸板 → 显示「较跌停/较涨停」的距板幅度（用户关心从板回到哪了，
// 此时相对昨收的涨跌幅无信息量）；封板/大涨大跌/无异动 → 显示今日涨跌幅。
const intradayPctText = computed(() => {
  const m = a.value.intradayMove;
  if (m.offLimitPct != null) {
    const v = m.offLimitPct;
    return (v >= 0 ? "较跌停 +" : "较涨停 ") + v.toFixed(2) + "%";
  }
  const p = m.pct * 100;
  return (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
});
// 异动数值着色（A股：涨=红、跌=绿）——距板口径下回升=红、回落=绿
const intradayPctColor = computed(() => {
  const m = a.value.intradayMove;
  if (m.offLimitPct != null) return m.offLimitPct >= 0 ? "var(--up)" : "var(--down)";
  return m.pct >= 0 ? "var(--up)" : "var(--down)";
});

// ---------------- 多维研判派生 ----------------
const trendColor = computed(() => {
  const t = a.value.trend;
  if (t === "up" || t === "shake_up") return "var(--up)";
  if (t === "down" || t === "shake_down") return "var(--down)";
  return "var(--r-ink)";
});
const maColor = computed(() => {
  const s = a.value.maState;
  if (s === "多头排列") return "var(--up)";
  if (s === "空头排列") return "var(--down)";
  return "var(--r-ink)";
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
  return "var(--r-ink)";
});
const kdjStateText = computed(() => {
  const c = a.value.kdjCross;
  const cross = c === "gold" ? "金叉" : c === "dead" ? "死叉" : "持平";
  return cross + "·" + a.value.kdjState;
});
// KDJ 状态着色（A股统一口径：超买=回落风险=利空绿，超卖=反弹机会=利多红，与 RSI/BIAS 同口径）
const kdjColor = computed(() => {
  const s = a.value.kdjState;
  if (s === "超买") return "var(--down)";
  if (s === "超卖") return "var(--up)";
  return "var(--r-ink)";
});
const rsiState = computed(() => {
  const r = a.value.rNow;
  if (r > 70) return "超买";
  if (r < 30) return "超卖";
  return "中性";
});
const rsiText = computed(() => {
  // RSI 数据无效（K 线不足 / 指标未成熟）→ 明确告知用户，不显示误导性的"50.00 · 中性"
  if (!a.value.rsiValid) return "暂无数据";
  return a.value.rNow.toFixed(2) + " · " + rsiState.value;
});
const rsiColor = computed(() => {
  if (!a.value.rsiValid) return "var(--text-2)";
  const r = a.value.rNow;
  if (r > 70) return "var(--down)"; // 超买=回落风险=利空绿
  if (r < 30) return "var(--up)"; // 超卖=反弹机会=利多红
  return "var(--r-ink)";
});
const volState = computed(() => {
  const v = a.value.volRatio;
  if (v > 1.15) return "放量";
  if (v < 0.85) return "缩量";
  return "温和";
});
// 量能比只表达「活跃度」无方向：放量=异动关注（橙，与布林变盘同警示口径），
// 不占红绿多空语义；缩量/温和中性灰
const volColor = computed(() => {
  const v = a.value.volRatio;
  if (v > 1.15) return "var(--warn)";
  return "var(--r-ink)";
});
// 主力资金净流入（近5/10/20日）：同一口径生成文本与着色，避免三份重复实现。
// f10/f20 analyzer 早已计算并参与 reduce 卖出信号，此前仅展示近5日，属展示缺口。
function flowCell(key: "f5" | "f10" | "f20") {
  return {
    text: computed(() => {
      const f = a.value[key];
      if (!f.has) return "暂无数据";
      return (f.sum > 0 ? "+" : "") + f.sum.toFixed(2) + "亿";
    }),
    color: computed(() => {
      const f = a.value[key];
      if (!f.has) return "var(--text-2)";
      return f.sum > 0 ? "var(--up)" : "var(--down)";
    }),
  };
}
// 解构成顶层 ref：对象内嵌 ComputedRef 在模板中不会自动解包
const { text: flow5Text, color: flow5Color } = flowCell("f5");
const { text: flow10Text, color: flow10Color } = flowCell("f10");
const { text: flow20Text, color: flow20Color } = flowCell("f20");
// 换手率无数据（降级源未提供）时统一用 --text-3 着色，与主力净流入无数据保持一致
const turnColor = computed(() => {
  const v = a.value.turnAvg;
  if (!(v > 0)) return "var(--text-2)";
  return "var(--r-ink)";
});

// ---------------- 新增专业指标派生 ----------------
const adxLast = computed(() => {
  const arr = a.value.adx;
  return arr[arr.length - 1] || 0;
});
const adxStateText = computed(() => `${a.value.adxState} · ${adxLast.value.toFixed(2)}`);
const adxColor = computed(() => {
  if (adxLast.value < 20) return "var(--r-ink)"; // 无趋势 → 中性
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
  if (v == null) return "var(--r-ink)";
  if (v > 1) return "var(--down)"; // 触上轨·超买=回落风险 → 绿
  if (v < 0) return "var(--up)"; // 触下轨·超卖=反弹机会 → 红
  return "var(--r-ink)";
});
const volAnnText = computed(() => (a.value.volAnn * 100).toFixed(2) + "%");
const mddText = computed(() => (a.value.maxDrawdown * 100).toFixed(2) + "%");
const mddColor = computed(() =>
  a.value.maxDrawdown > 0.35 ? "var(--down)" : a.value.maxDrawdown > 0.2 ? "var(--warn)" : "var(--r-ink)"
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

// ---------------- 量价背离（严格版）派生（A股约定：顶背离=偏空=绿，底背离=偏多=红） ----------------
const divText = computed(() => {
  const d = a.value.divergence;
  if (d === "top") return "顶背离·动能衰减";
  if (d === "bottom") return "底背离·动能积聚";
  return "量价同步";
});
const divColor = computed(() =>
  a.value.divergence === "top" ? "var(--down)" : a.value.divergence === "bottom" ? "var(--up)" : "var(--r-ink)"
);

// ---------------- VaR / 区间位置派生（风险=偏空=绿，低位机会=偏多=红，与回撤/风险等级同口径） ----------------
const var95Text = computed(() => a.value.var95.toFixed(2) + "%");
const var95Color = computed(() =>
  a.value.var95 <= -5 ? "var(--down)" : a.value.var95 <= -3 ? "var(--warn)" : "var(--r-ink)"
);
const rangePosText = computed(() => `${a.value.rangePos.toFixed(0)}%（距高点 ${a.value.distHigh120.toFixed(1)}%）`);
const rangePosColor = computed(() =>
  a.value.rangePos > 80 ? "var(--down)" : a.value.rangePos < 20 ? "var(--up)" : "var(--r-ink)"
);

// ---------------- 信号回测派生（样本不足时降级为「样本不足」） ----------------
const bt = computed(() => a.value.backtest);
const btValid = computed(() => bt.value.bars >= 80 && bt.value.buyCount + bt.value.sellCount >= 3);
const fmtBtRet = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
const btBuyText = computed(() =>
  `${bt.value.buyCount}次 · ${bt.value.horizon}日胜率 ${(bt.value.buyWinRate * 100).toFixed(0)}% · 均收 ${fmtBtRet(bt.value.buyAvgRet)}`
);
const btSellText = computed(() =>
  `${bt.value.sellCount}次 · ${bt.value.horizon}日胜率 ${(bt.value.sellWinRate * 100).toFixed(0)}% · 均收 ${fmtBtRet(bt.value.sellAvgRet)}`
);
// 均收为正=该方向有效=红；均收为负=失效=绿（A股约定）
const btBuyColor = computed(() => (bt.value.buyAvgRet > 0 ? "var(--up)" : bt.value.buyAvgRet < 0 ? "var(--down)" : "var(--r-ink)"));
const btSellColor = computed(() => (bt.value.sellAvgRet > 0 ? "var(--up)" : bt.value.sellAvgRet < 0 ? "var(--down)" : "var(--r-ink)"));

// ---------------- 乖离率 BIAS · 布林带宽（均值回归 + 波动率挤压）派生 ----------------
const biasText = computed(() => {
  const v = a.value.bias12;
  if (a.value.bias24 > 20) return `BIAS24 ${a.value.bias24.toFixed(2)}% · 中期超买`;
  if (a.value.bias24 < -20) return `BIAS24 ${a.value.bias24.toFixed(2)}% · 中期超卖`;
  if (v > 12) return `BIAS12 ${v.toFixed(2)}% · 短期超买`;
  if (v < -12) return `BIAS12 ${v.toFixed(2)}% · 短期超卖`;
  return `6日 ${a.value.bias6.toFixed(1)}% / 12日 ${v.toFixed(1)}% / 24日 ${a.value.bias24.toFixed(1)}%`;
});
const biasColor = computed(() => {
  if (a.value.bias24 > 20 || a.value.bias12 > 12) return "var(--down)"; // 超买=均值回归风险 → 绿（评分 -3/-5 同号）
  if (a.value.bias24 < -20 || a.value.bias12 < -12) return "var(--up)"; // 超卖=反弹机会 → 红（评分 +3/+5 同号）
  return "var(--r-ink)";
});
const bollBwText = computed(() => {
  const bw = a.value.bollBwNow;
  if (a.value.bollSqueeze) return `带宽收缩 · 即将变盘`;
  if (bw > 2.2) return `带宽扩张 · 波动剧烈`;
  if (bw < 0.6) return `带宽偏窄 · 蓄势中`;
  return `带宽常态 · 波动正常`;
});
const bollBwColor = computed(() => {
  if (a.value.bollSqueeze) return "var(--warn)";                              // 变盘信号（无方向警示）→ 橙
  if (a.value.bollBwNow > 2.2) return "var(--down)";                      // 极度扩张=波动风险 → 绿（评分 -2 同号）
  return "var(--r-ink)";                                                  // 偏窄蓄势/常态均无方向 → 灰
});

// ---------------- 筹码分布（CYQ）派生 ----------------
const chipAvgText = computed(() => a.value.chip ? a.value.chip.avgCost.toFixed(2) : "—");
const chipDistLabel = computed(() => {
  const c = a.value.chip;
  if (!c) return "";
  const d = c.avgCost ? (a.value.price - c.avgCost) / c.avgCost : 0;
  if (d > 0.08) return `高于成本 ${(d * 100).toFixed(1)}%`;
  if (d < -0.08) return `低于成本 ${(-d * 100).toFixed(1)}%`;
  return "贴近成本";
});
const chipDistColor = computed(() => {
  const c = a.value.chip;
  if (!c) return "var(--r-ink)";
  const d = c.avgCost ? (a.value.price - c.avgCost) / c.avgCost : 0;
  // 高于成本重心=上方获利盘回吐压力 → 绿（评分 -2 同号）；低于=下方承接支撑 → 红（+2 同号）
  return d > 0.08 ? "var(--down)" : d < -0.08 ? "var(--up)" : "var(--r-ink)";
});
const chipPeakText = computed(() => {
  const c = a.value.chip;
  if (!c || !c.peakPrice) return "—";
  const d = (a.value.price - c.peakPrice) / c.peakPrice;
  // 现价高于密集峰 → 密集峰在下方形成支撑；现价低于密集峰 → 密集峰在上方形成套牢压力
  const rel = d > 0.08 ? "现价下方支撑" : d < -0.08 ? "现价上方压力" : "贴近现价";
  return `${c.peakPrice.toFixed(2)}（${rel}）`;
});
const chipProfitText = computed(() => {
  const c = a.value.chip;
  if (!c) return "—";
  const pct = (c.profitRatio * 100).toFixed(0);
  if (c.profitRatio > 0.85) return `${pct}% · 获利盘比例高，易回吐`;
  if (c.profitRatio < 0.20) return `${pct}% · 获利盘比例低，抛压轻`;
  return `${pct}% · 获利盘比例适中`;
});
const chipProfitColor = computed(() => {
  const c = a.value.chip;
  if (!c) return "var(--r-ink)";
  // 获利盘过高=回吐风险 → 绿（评分 -5 同号）；稀少=抛压轻 → 红（+5 同号）
  return c.profitRatio > 0.85 ? "var(--down)" : c.profitRatio < 0.20 ? "var(--up)" : "var(--r-ink)";
});
const chipRangeText = computed(() => {
  const c = a.value.chip;
  if (!c || c.percentiles["5"] == null) return "—";
  return `${c.percentiles["5"].toFixed(2)} ~ ${c.percentiles["95"].toFixed(2)}`;
});

// ---------------- 资讯情绪（供分析结论综合所有量化因子） ----------------
const ns = computed<NewsSignal | null>(() => props.newsSignal ?? null);
// 资讯情绪对综合评分的贡献（analyzer 同口径：±12 封顶）
const newsDelta = computed(() =>
  ns.value ? Math.max(-12, Math.min(12, Math.round((ns.value.score / 100) * 12))) : 0
);

// ---------------- 分析结论（综合合成） ----------------
// 结论文案：短句直给——「定位 + 怎么做 + 价位应对 + 逆风提示」。
// 各指标明细已由上方面板呈现，结论不复读数值细节（避免长文劝退）；
// 但防误判关键信息必须收束进结论：技术面总分与走势预测、已破位/已突破的
// 既成事实、资金背离、极端超买超卖、量价背离。
const conclusion = computed(() => {
  const r = a.value;
  const parts: string[] = [];
  parts.push(`${r.trendText}（${r.strength}），处于「${r.stageText}」阶段，${r.riskLevel}风险，技术面评分 ${r.score} 分，走势预测「${r.sigType}」。`);
  if (r.reduce) parts.push("信号偏空，建议逢高减仓、严控仓位。");
  else if (r.add) parts.push("趋势与资金配合良好，可于回调分批加仓。");
  else if (r.build) parts.push("处于相对低位且风险可控，可于支撑附近分批建仓。");
  else if (r.watch) parts.push("可纳入自选关注，等待更优介入时点。");
  else parts.push("多空信号交织，建议观望，等方向明朗。");
  // 价位应对必须区分「既成事实」与「待验证假设」：已破位仍念通用止损提示会误导
  if (r.breakdown) parts.push(`支撑 ${r.support.toFixed(2)} 已被有效跌破，原支撑或转为压力，反弹无力应止损离场。`);
  else if (r.breakout) parts.push(`压力 ${r.resistance.toFixed(2)} 已有效突破，回踩不破可顺势持有或跟进。`);
  else parts.push(`支撑 ${r.support.toFixed(2)}、压力 ${r.resistance.toFixed(2)}：有效跌破支撑应止损离场，放量突破压力可顺势跟进。`);
  // 资金背离防误判：给偏多建议但主力明显净流出（analyzer 同口径 ≤ -0.5 亿）时必须点破
  if ((r.add || r.build || r.watch) && r.f5.has && r.f5.sum <= -0.5) {
    parts.push(`但近5日主力资金净流出 ${Math.abs(r.f5.sum).toFixed(2)} 亿，介入宜轻仓试探、严控仓位。`);
  }
  // 极端超买/超卖属结论级状态（追高/抄底风险），仅极端时提示；RSI 无效数据不参与
  if (r.rsiValid && (r.rNow > 78 || r.bias24 > 20)) parts.push("短期超买明显，追高需防回撤。");
  else if (r.rsiValid && !r.reduce && (r.rNow < 22 || r.bias24 < -20)) parts.push("短期超卖明显，随时可能出现技术性反弹。");
  // 量价背离属防误判关键信号：顶背离警示动能衰减、底背离提示下跌动能减弱
  if (r.divergence === "top") parts.push("量价顶背离，上涨动能衰减，追高需防冲高回落。");
  else if (r.divergence === "bottom") parts.push("量价底背离，下跌动能减弱，关注企稳信号。");
  // 指数数据缺失时（analyzer 占位 marketEnv：positionPct=0、alignScore=0）跳过本段，
  // 避免把「无数据」误报成「市场环境偏弱」误导用户；该分支内 positionAdvice 必为真实文案。
  const env = r.marketEnv;
  if (env && env.indexTrend !== "暂无数据") {
    const mktAdverse = (env.alignScore || 0) < 0;
    const sectorAdverse = (env.sectorAlignScore || 0) < 0;
    const defensive = (env.positionPct || 0) <= 30;
    if (mktAdverse || sectorAdverse || defensive) {
      const what = mktAdverse ? "大盘逆风" : sectorAdverse ? "行业逆风" : "市场环境偏弱";
      parts.push(`${what}，${env.positionAdvice}。`);
    }
  }
  if (ns.value && newsDelta.value !== 0) {
    parts.push(`近3日资讯情绪${newsDelta.value > 0 ? "偏多" : "偏空"}（评分${newsDelta.value > 0 ? "+" : ""}${newsDelta.value} 分）。`);
  }
  parts.push("以上为技术面参考，非投资建议。");
  return parts.join("");
});

// 买入区间：价格远离支撑时（analyzer 置 NaN）显示占位，避免给出无意义买点
const buyText = computed(() => {
  const r = a.value;
  if (r.buyLow == null || isNaN(r.buyLow) || isNaN(r.buyHigh)) return "—（远离支撑，按趋势跟踪）";
  return `${r.buyLow} ~ ${r.buyHigh}`;
});
// 关键价位状态着色：三个数值默认统一墨色，出现状态时数值本身换语义色
// （已突破/买入区间成立=红·机会，已跌破=绿·风险，临近=橙·无方向警示），不再是「淡黑没意义」
const supPriceCls = computed(() => (a.value.breakdown ? "lv-st-bad" : a.value.nearSup ? "lv-st-warn" : ""));
const resPriceCls = computed(() => (a.value.breakout ? "lv-st-ok" : a.value.nearRes ? "lv-st-warn" : ""));
const buyActive = computed(() => {
  const r = a.value;
  return r.buyLow != null && !isNaN(r.buyLow) && !isNaN(r.buyHigh);
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
  /* 浅色主题下：正文从近黑的 #16202e 软化为透气的石墨墨色，
     面板改用带极淡主题 tint 的玻璃（浮于 #eef1f6 背景之上，而非更白），
     避免「黑字白底文档」的廉价观感；深色调沿用 --text，不受影响。 */
  --r-ink: #33414f; /* 一级墨色：明快石墨，明显比 #16202e 透气，不再近黑 */
  --r-soft: var(--text-2); /* 二级灰：标签/次级 */
  --r-panel: linear-gradient(155deg, rgba(255, 255, 255, 0.82), rgba(244, 249, 247, 0.64));
  --r-edge: rgba(7, 193, 96, 0.16); /* 浅色面板主题描边，建立浅色主题识别度 */
}
/* 深色主题：墨色回退到浅色文字，面板回到玻璃卡，保证切主题不漂移 */
:root.theme-dark .report {
  --r-ink: var(--text);
  --r-soft: var(--text-2);
  --r-panel: var(--card);
  --r-edge: transparent;
}
.banner {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 18rpx 22rpx;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  line-height: 1.6;
  margin-bottom: 18rpx;
}
/* A股语义统一：红=偏强/机会（利多），绿=偏弱/风险（利空），橙=警示/变盘。
   与下方买卖信号、决策标签、突破/跌破标签同一口径，同一份报告不允许两套红绿语义。 */
.banner.ok {
  background: rgba(239, 35, 42, 0.1);
  color: var(--up);
}
.banner.warn {
  background: rgba(255, 159, 28, 0.12);
  color: #c87f00;
}
.banner.bad {
  background: rgba(9, 176, 122, 0.1);
  color: var(--down);
}
.banner-text {
  flex: 1;
}

/* 今日盘中异动警示条（内嵌于信号卡片：涨停/跌停/炸板/跌停开板）
   A股约定：涨=红(var(--up)=#ef232a)、跌=绿(var(--down)=#09b07a)。 */
.sig-alert {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 24rpx;
  /* 分隔线用中性 --border（与 .score-divider/.decision 发丝线同源）：
     --r-edge 是品牌绿描边，压在涨/跌语义浅底（警示条背景）上会撞色突兀 */
  border-top: 1px solid var(--border);
  font-size: var(--font-sm);
}
.sig-alert.up { background: rgba(239, 35, 42, 0.08); color: var(--up); }
.sig-alert.down { background: rgba(9, 176, 122, 0.1); color: var(--down); }
/* 实时脉冲圆点：让「盘中」语义一目了然 */
.sa-live {
  flex: none;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.85;
  animation: sa-pulse 1.6s var(--ease-out) infinite;
}
@keyframes sa-pulse {
  0% { box-shadow: 0 0 0 0 currentColor; }
  70% { box-shadow: 0 0 0 12rpx transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.sig-alert .sa-pct { font-size: var(--font-sm); }
.sa-spacer { flex: 1; }
.sa-sub { font-size: var(--font-xs); opacity: 0.8; }

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
  font-size: var(--font-3xl);
  line-height: 1;
  color: var(--r-ink);
}
.score-label {
  font-size: var(--font-xs);
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
  font-size: var(--font-sm);
}
.meta-k {
  color: var(--text-2);
}
.meta-v {
  color: var(--r-ink);
}

/* 通用面板（研判 / 评分依据 / 结论） */
.panel {
  background: var(--r-panel);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1rpx solid var(--r-edge);
  backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  padding: 20rpx 24rpx;
  margin-bottom: 16rpx;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: var(--font-md);
  color: var(--r-ink);
  margin-bottom: 16rpx;
}

/* 多维研判：2 列网格
   卡片内部分隔线统一为 1px 发丝线（与 .score-divider / .sig-alert / .decision / .sig-detail
   等卡片内分隔保持一致）。注意必须用绝对 1px 而非 1rpx：1rpx 在桌面高分屏缩放下为
   次像素（≈0.65px），网格 gap 透缝按行取整会导致「有的行有线、有的行没有」；
   1px 在任何 DPR 下都稳定渲染且粗细一致。 */
.metric-grid {
  display: grid;
  /* 2 列布局适配手机屏宽；奇数 metric 时让最后一格跨满整行，避免右下角空缺 */
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
/* 奇数个 metric 时，最后一个跨满整行（避免最后一行右列空缺） */
.metric:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}
.metric {
  background: var(--bg-2);
  padding: 16rpx 18rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  text-align: center;
}
.m-k {
  font-size: var(--font-xs);
  color: var(--r-soft);
  text-align: center;
}
.m-v {
  font-size: var(--font-sm);
  color: var(--r-ink);
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
  font-size: var(--font-sm);
}
.r-label {
  color: var(--r-soft);
}
.r-delta {
  font-variant-numeric: tabular-nums;
}
.base-note {
  display: block;
  margin-top: 14rpx;
  font-size: var(--font-xs);
  color: var(--text-2);
}

/* 综合评分面板：score-row 内嵌时去掉底部间距（由 score-divider 接替分隔） */
.score-panel .score-row {
  margin-bottom: 0;
}
.score-divider {
  height: 1px;
  background: var(--border);
  margin: 16rpx 0;
}

/* 关键价位 / 决策标签内嵌面板时去掉外边距，用分隔线区隔 */
.panel .levels {
  margin-bottom: 0;
}
.panel .decision {
  margin-bottom: 0;
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 1px solid var(--border);
}

/* 分析结论 */
.conclusion {
  display: block;
  font-size: var(--font-sm);
  color: var(--r-ink);
  line-height: 1.75;
}

/* 决策标签：单一基础类 + 3 个语义状态色，避免多套重复样式 */
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
  font-size: var(--font-sm);
  transition: transform var(--dur-fast) var(--ease-out);
}
.dec-item:active {
  transform: scale(0.96);
}
.dec-item.ok {
  background: rgba(239, 35, 42, 0.1);
  color: var(--up);
}
.dec-item.warn {
  background: rgba(9, 176, 122, 0.12);
  color: var(--down);
}
.dec-item.wait {
  background: var(--card-2);
  color: var(--r-ink); /* 「观望」是真实决策结论，墨黑；与信号卡 wait 态同色 */
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
  font-size: var(--font-sm);
}
.lv-v {
  font-size: var(--font-sm);
  color: var(--r-ink);
}
/* 关键价位三个数值统一口径：字号与左侧标题一致（--font-sm 24rpx）+ 墨色 --r-ink
   （支撑/压力经 .price-text 覆盖 PriceText 默认平盘色，与建议买入区间完全一致）；
   出现状态（已突破/买入区间成立/临近/已跌破）时数值换语义色，强化状态可读性 */
.lv-right .price-text {
  color: var(--r-ink);
}
.lv-right .price-text.lv-st-ok {
  color: var(--up);
}
.lv-right .price-text.lv-st-bad {
  color: var(--down);
}
.lv-right .price-text.lv-st-warn {
  color: #c87f00;
}
.lv-v.lv-bz-ok {
  color: var(--up);
}

/* 直白操作信号卡片（核心卖点） */
/* ---- 信号卡片：头部 + 详情上下拼接为一张连通卡片 ---- */
.signal-card {
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  margin-bottom: 16rpx;
  overflow: hidden;
}
/* 色条贯穿整张卡片（头部 + 详情），A股约定：买(看涨)=红 var(--up)、卖(看跌)=绿 var(--down) */
.signal-card.buy { border-left: 8rpx solid var(--up); }
.signal-card.sell { border-left: 8rpx solid var(--down); }
.signal-card.hold { border-left: 8rpx solid #3b82f6; }
.signal-card.watch { border-left: 8rpx solid var(--warn); }
.signal-card.wait { border-left: 8rpx solid var(--border); }
.signal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
}
.signal-card.buy .signal { background: rgba(239, 35, 42, 0.1); }
.signal-card.sell .signal { background: rgba(9, 176, 122, 0.12); }
.signal-card.hold .signal { background: rgba(59, 130, 246, 0.1); }
.signal-card.watch .signal { background: rgba(255, 159, 28, 0.12); }
.signal-card.wait .signal { background: var(--card-2); }
.sig-main { display: flex; flex-direction: column; gap: 6rpx; flex: 1; min-width: 0; }
.sig-label { font-size: var(--font-xl); line-height: 1.1; }
.signal-card.buy .sig-label { color: var(--up); }
.signal-card.sell .sig-label { color: var(--down); }
.signal-card.hold .sig-label { color: #2563eb; }
.signal-card.watch .sig-label { color: #c87f00; }
.signal-card.wait .sig-label { color: var(--r-ink); }
.sig-text { font-size: var(--font-sm); color: var(--r-ink); line-height: 1.5; }
.sig-type {
  flex: none;
  font-size: var(--font-xs);
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  color: var(--r-soft);
  margin-left: 16rpx;
}
.sig-detail {
  background: var(--r-panel);
  /* 卡内分隔线用中性 --border：--r-edge 品牌绿压在警示条/语义色块上撞色突兀 */
  border-top: 1px solid var(--border);
  padding: 16rpx 24rpx;
}
.sd-row { display: flex; gap: 16rpx; padding: 8rpx 0; }
.sd-k { flex: none; font-size: var(--font-sm); color: var(--text-2); width: 128rpx; }
.sd-v { flex: 1; font-size: var(--font-sm); color: var(--r-ink); line-height: 1.6; }

/* 关键价位状态徽标（A股约定：已突破/上涨=红 var(--up)、已跌破/下跌=绿 var(--down)） */
.lv-right { display: flex; align-items: center; gap: 12rpx; }
.lv-tag { font-size: var(--font-xs); padding: 4rpx 12rpx; border-radius: 8rpx; }
.lv-tag.ok { color: var(--up); background: rgba(239, 35, 42, 0.12); }
.lv-tag.bad { color: var(--down); background: rgba(9, 176, 122, 0.12); }
.lv-tag.warn { color: #c87f00; background: rgba(255, 159, 28, 0.14); }

.risks {
  background: var(--r-panel);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1rpx solid var(--r-edge);
  backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  padding: 20rpx 26rpx;
}
.risks-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: var(--font-md);
  color: var(--r-ink);
  margin-bottom: 10rpx;
}
.risk-item {
  display: flex;
  gap: 8rpx;
  padding: 5rpx 0;
  font-size: var(--font-sm);
  color: var(--r-ink);
  line-height: 1.6;
}
.dot {
  color: var(--text-2);
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
  font-size: var(--font-xs);
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
  font-size: var(--font-xs);
  /* 行高与标题首行等高（--font-sm × 1.5）：标签盒子恒等于标题一行高，
     文字由 line-height 垂直居中；去掉旧 margin-top 手动凑位与竖向 padding（撑高失对齐） */
  line-height: calc(var(--font-sm) * 1.5);
  padding: 0 12rpx;
  border-radius: 6rpx;
}
.ni-tag.ok { color: var(--up); background: rgba(239, 35, 42, 0.14); }
.ni-tag.bad { color: var(--down); background: rgba(9, 176, 122, 0.14); }
/* 中性标签是真实判定（非「暂无数据」），文字用墨黑，仅靠灰底与利好/利空彩签区分 */
.ni-tag.neutral { color: var(--r-ink); background: var(--border); }
.ni-title {
  flex: 1;
  font-size: var(--font-sm);
  color: var(--r-ink);
  line-height: 1.5;
}
.ni-sum {
  margin-top: 8rpx;
  font-size: var(--font-xs);
  color: var(--r-ink); /* 摘要是正文内容，用墨黑；淡黑仅限暂无数据/标签/注释 */
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
  font-size: var(--font-xs);
  color: var(--text-2);
}
.ni-foot-l {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
/* 板块资讯标识：所属板块动态（板块行情联动个股） */
.ni-scope {
  color: var(--primary);
  background: rgba(7, 193, 96, 0.1);
  padding: 1rpx 10rpx;
  border-radius: 6rpx;
}
.news-empty {
  font-size: var(--font-sm);
  color: var(--text-2);
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
  font-size: var(--font-sm);
  color: var(--r-ink);
}
.ni-row {
  display: flex;
  gap: 12rpx;
  align-items: baseline;
}
.ni-k {
  flex: none;
  font-size: var(--font-xs);
  padding: 3rpx 12rpx;
  border-radius: 6rpx;
}
.ni-k.ok { color: var(--up); background: rgba(239, 35, 42, 0.12); }
.ni-k.bad { color: var(--down); background: rgba(9, 176, 122, 0.12); }
.ni-v {
  flex: 1;
  font-size: var(--font-sm);
  color: var(--r-ink); /* 催化/风险列举是正文内容，用墨黑 */
  line-height: 1.5;
}
.ni-note {
  display: block;
  margin-top: 4rpx;
  font-size: var(--font-xs);
  color: var(--text-2);
  line-height: 1.55;
}
</style>
