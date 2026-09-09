<template>
  <view class="wl-page">
    <!-- 头部：与社区共用 PageHeader，移出 scroll-view 以保证 H5 上始终吸顶。 -->
    <!-- #brand：默认品牌区（星标图标 + 「自选」渐变标题），与社区页同一套左上角 logo 风格 -->
    <PageHeader
      :brand-text="mainView === 'pos' ? '持仓' : '自选'"
      :brand-icon="mainView === 'pos' ? 'portfolio' : 'star'"
      brand-hint="swap"
      :brand-clickable="true"
      @brand-click="toggleView"
    >
      <!-- #right：自选 / 持仓共用同一枚「分组 + 涨跌家数」胶囊（同样式、同内容、同点击行为），
           点击展开分组面板 → 持仓页也能切换 / 新建 / 管理分组，与自选页完全一致。
           涨跌家数始终统计「当前视图当前分组」内的标的，胶囊永远描述其下方的列表。 -->
      <template #right>
        <view class="cm-me" role="button" aria-label="分组切换" @click="openGroups">
          <view class="cm-avatar flex-center" style="background: linear-gradient(135deg, var(--primary), var(--primary-dark, #06a050));">
            <OutlineIcon type="layers" :size="24" color="#fff" />
          </view>
          <text class="cm-name truncate">{{ upDown.currentGroup }}</text>
          <!-- 当前分组内实时涨/跌家数（随行情实时刷新）：并入分组按钮，避免割裂 -->
          <view class="ud-pill">
            <view class="ud-item">
              <OutlineIcon type="arrow-up" :size="16" color="var(--up)" />
              <text class="ud-num up">{{ upDown.counts.up }}</text>
            </view>
            <view class="ud-item">
              <OutlineIcon type="arrow-down" :size="16" color="var(--down)" />
              <text class="ud-num down">{{ upDown.counts.down }}</text>
            </view>
          </view>
          <OutlineIcon type="pulldown" :size="18" color="var(--text-2)" />
        </view>
      </template>
    </PageHeader>

    <view class="wl">

        <!-- 持仓信号提醒：持仓标的出现买/卖信号时展示，常驻卡片、点击行跳转个股、手动关闭才消失 -->
        <view v-if="sigAlertList.length" class="pos-alert anim-fade-up">
          <view class="pa-head">
            <OutlineIcon type="flag" :size="28" color="var(--warn)" />
            <text class="pa-title">持仓信号提醒</text>
            <view class="pa-close" @click="dismissSigAlerts" role="button" aria-label="关闭提醒">
              <OutlineIcon type="close" :size="26" color="var(--text-3)" />
            </view>
          </view>
          <view
            v-for="a in sigAlertList"
            :key="a.code"
            class="pa-row"
            role="button"
            :aria-label="`查看 ${a.name}`"
            @click="openAlertStock(a)"
          >
            <text class="pa-name truncate">{{ a.name }}</text>
            <!-- 提醒卡只对已设持仓的标的生成（scanPositionSignals 仅扫持仓），
                 因此按持仓视角命名：buy→加仓 / sell→减仓（配色类名 buy/sell 语义一致，保留复用） -->
            <text :class="['pa-lv', a.level]">{{ a.level === "buy" ? "加仓" : "减仓" }}</text>
            <text class="pa-meta">现价 {{ fmtPrice(a.price) }}</text>
            <text :class="['pa-meta', trendCls(a.pnl)]">{{ fmtSigned(a.pnl) }}%</text>
          </view>
        </view>

        <!-- 价格预警：命中行在自选表格内闪烁红/绿提示（见 .tr.alert-up/.alert-down），
             不再使用独立横幅卡片；清除预警请在长按菜单「编辑价格预警」中操作。 -->

        <!-- ===== 持仓视图：每行 名称/代码 + 信号(引擎操作建议) + 现价 + 收益率 + 盈亏 + 成本；
             右上角汇总见头部（总收益/总收益率）。与自选视图互斥切换，共享行情与信号数据源。
             点击行跳转行情页；长按行弹出操作菜单（设置持仓/清除持仓/编辑预警等，与自选行一致）。
             行数值列公用 .tr/.td/.st-num/.th 样式体系，表头与信号标签复用全局 .th 规范 ===== -->
        <view v-if="mainView === 'pos'" class="pos-view anim-fade-up">
          <view v-if="!posRows.length" class="empty-wrap">
            <view class="empty-card glass">
              <view class="empty-ic flex-center">
                <OutlineIcon type="portfolio" :size="60" color="var(--primary)" />
              </view>
              <!-- 有持仓但当前分组筛空 → 提示切回「全部」，避免误判为「持仓丢了」 -->
              <template v-if="posRowsAll.length">
                <text class="empty-title">「{{ upDown.currentGroup }}」暂无持仓</text>
                <text class="empty-s">该分组内没有已设持仓的标的，切回「全部」即可查看所有持仓。</text>
                <button class="btn-primary empty-btn" @click="pickGroup('__all__')">查看全部持仓</button>
              </template>
              <template v-else>
                <text class="empty-title">还没有持仓</text>
                <text class="empty-s">在「行情」页报告卡或自选页长按菜单中设置持仓成本与数量，收益与操作信号将同步展示在这里。</text>
                <button class="btn-primary empty-btn" @click="toggleView">切换到自选</button>
              </template>
            </view>
          </view>
          <view v-else class="wl-wrap">
            <!-- 持仓表格完全复用自选表格体系（.wl-grid/.wl-thead/.tr/.td/.c-name/.act-chip），
                 仅列集不同：名称/代码 · 操作 · 收益率 · 盈亏 · 成本 · 现价 · 数量 -->
            <scroll-view class="wl-grid" :scroll-x="!dragKey" :scroll-y="!dragKey">
              <view class="wl-rows">
              <view class="wl-thead">
                <view class="th c-name"></view>
                <view v-if="posCols.sig" class="th c-sig"><text class="th-label">操作</text></view>
                <view v-if="posCols.pct" class="th c-pct"><text class="th-label">收益率</text></view>
                <view v-if="posCols.pnl" class="th c-pnl"><text class="th-label">盈亏</text></view>
                <view v-if="posCols.cost" class="th c-cost"><text class="th-label">成本</text></view>
                <view v-if="posCols.price" class="th c-price"><text class="th-label">现价</text></view>
                <view v-if="posCols.qty" class="th c-qty"><text class="th-label">数量</text></view>
              </view>
              <view class="wl-body">
              <view
                v-for="p in posRows"
                :key="p.secid"
                class="tr"
                :class="{ reordering: posReorderMode, dragging: dragKey === p.secid }"
                :style="dragKey === p.secid ? dragStyle : undefined"
                role="button"
                :aria-label="`查看 ${p.name}，长按管理`"
                @click="openPosStock(p)"
                @touchstart="onPosPressStart(p, $event)"
                @touchmove="onRowPressMove"
                @touchend="onRowPressEnd"
                @touchcancel="onRowPressEnd"
                @mousedown="onPosPressStart(p, $event)"
                @mousemove="onRowPressMove"
                @mouseup="onRowPressEnd"
                @mouseleave="onRowPressEnd"
              >
                <view class="td c-name" :class="{ 'has-handle': posReorderMode }">
                  <view
                    v-if="posReorderMode"
                    class="drag-handle"
                    :class="{ on: dragKey === p.secid }"
                    role="button"
                    aria-label="拖动排序"
                    @click.stop
                    @touchstart.stop="onPosDragStart($event, p)"
                    @touchmove.stop="onDragMove"
                    @touchend.stop="onDragEnd"
                    @touchcancel.stop="onDragEnd"
                    @mousedown.stop="onPosDragStart($event, p)"
                  >
                    <OutlineIcon type="grip" :size="30" :color="dragKey === p.secid ? 'var(--primary)' : 'var(--text-3)'" />
                  </view>
                  <view class="t-block">
                    <text class="t-name truncate">{{ p.name }}</text>
                    <view class="t-sub">
                      <text class="t-mkt mkt-label">{{ marketCharFor(p.code, marketFromSecid(p.secid) as any) }}</text>
                      <text class="t-code truncate">{{ p.code }}</text>
                    </view>
                  </view>
                </view>
                <view v-if="posCols.sig" class="td c-sig">
                  <view :class="['act-chip', p.actCls]"><text>{{ p.actText }}</text></view>
                </view>
                <view v-if="posCols.pct" class="td c-pct">
                  <text class="st-num" :class="stTrend(p.pnlPct)">{{ p.price ? fmtPct(p.pnlPct) : '--' }}</text>
                </view>
                <view v-if="posCols.pnl" class="td c-pnl">
                  <text class="st-num" :class="stTrend(p.pnl)">{{ p.price ? fmtSigned(p.pnl) : '--' }}</text>
                </view>
                <view v-if="posCols.cost" class="td c-cost">
                  <text class="st-num">{{ fmtPrice(p.cost) }}</text>
                </view>
                <!-- 现价：中性展示，不着色 —— 着色语义留给「收益率/盈亏」（持仓维度），
                     现价本身与持仓无关，按当日涨跌染色反而与相邻成本列对照困难 -->
                <view v-if="posCols.price" class="td c-price">
                  <text class="st-num">{{ p.price ? fmtPrice(p.price) : '--' }}</text>
                </view>
                <view v-if="posCols.qty" class="td c-qty">
                  <text class="st-num">{{ p.qty ? p.qty.toLocaleString("en-US") : '--' }}</text>
                </view>
              </view>
              </view>
              </view>
            </scroll-view>
            <!-- 排序/列设置控制按钮：与自选表一致，定位覆盖名称列固定表头左上角 -->
            <view class="wl-cols-overlay">
              <view class="th-cols" :class="{ on: posReorderMode || activePanel === 'cols' }">
                <view
                  class="th-ic grip"
                  :class="{ on: posReorderMode }"
                  role="button"
                  aria-label="拖拽排序"
                  @click="togglePosReorder"
                >
                  <OutlineIcon type="grip" :size="28" :color="posReorderMode ? 'var(--primary)' : 'var(--text-3)'" />
                </view>
                <view class="th-ic" :class="{ on: activePanel === 'cols' }" role="button" aria-label="列设置" @click="openCols">
                  <OutlineIcon type="columns" :size="28" :color="activePanel === 'cols' ? 'var(--primary)' : 'var(--text-3)'" />
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 空态：条件必须与表格一致（rows = 按分组筛选后）。
             否则「组内标的被全部移出」时两个条件都不成立 → 整页空白（既无空态也无表格）。
             再按 list.length 区分「完全没自选」与「当前分组暂无」，后者给「查看全部」出口 -->
        <view v-if="mainView === 'watch' && !rows.length" class="empty-wrap anim-fade-up">
          <view class="empty-card glass">
            <view class="empty-ic flex-center">
              <OutlineIcon type="star" :size="60" color="var(--primary)" />
            </view>
            <template v-if="list.length">
              <text class="empty-title">「{{ upDown.currentGroup }}」暂无自选</text>
              <text class="empty-s">该分组内还没有标的，切回「全部」即可查看所有自选股。</text>
              <button class="btn-primary empty-btn" @click="pickGroup('__all__')">查看全部自选</button>
            </template>
            <template v-else>
              <text class="empty-title">还没有自选股</text>
              <text class="empty-s">在「行情」页搜索分析后点击星标加入自选，实时价格与价格预警将同步展示在这里。</text>
              <button class="btn-primary empty-btn" @click="goPickMarket">去行情页选股</button>
            </template>
          </view>
        </view>

        <!-- 自选股表格：全屏铺满 + 固定表头 + 名称列固定(横滑不丢) + 横向滚动 -->
        <view v-if="mainView === 'watch' && rows.length" class="wl-wrap">
        <!-- 拖拽行期间动态关闭 scroll-x/scroll-y：iOS 上滚动容器自身的触摸平移不受行内
             preventDefault 约束，会拖着整张表一起跑；拖拽中锁定滚动、结束即恢复 -->
        <scroll-view class="wl-grid" :scroll-x="!dragKey" :scroll-y="!dragKey">
          <view class="wl-rows">
          <view class="wl-thead">
            <!-- 名称列表头：仅占位(固定列左上角)。排序/列设置按钮已移至滚动容器外的 .wl-cols-overlay，避免横滑 scroll-view 吞掉点击 -->
            <view class="th c-name"></view>
            <view v-if="cols.price" class="th c-price">
              <text class="th-label">最新价</text>
            </view>
            <view v-if="cols.pct" class="th c-pct">
              <text class="th-label">涨跌幅</text>
            </view>
            <view v-if="cols.chg" class="th c-chg">
              <text class="th-label">涨跌额</text>
            </view>
            <view v-if="cols.open" class="th c-open">
              <text class="th-label">今开</text>
            </view>
            <view v-if="cols.amp" class="th c-amp">
              <text class="th-label">振幅</text>
            </view>
            <view v-if="cols.amt" class="th c-amt">
              <text class="th-label">成交额</text>
            </view>
          </view>
          <view class="wl-body">
          <view
            v-for="row in renderRows"
            :key="row.it.code + row.it.market"
            class="tr"
            :class="{ reordering: reorderMode, dragging: dragKey === keyOf(row.it), 'alert-up': alertState[keyOf(row.it)] === 'up', 'alert-down': alertState[keyOf(row.it)] === 'down' }"
            :style="dragKey === keyOf(row.it) ? dragStyle : undefined"
            @click="onItemClick(row.it)"
            @touchstart="onRowPressStart(row.it, $event)"
            @touchmove="onRowPressMove"
            @touchend="onRowPressEnd"
            @touchcancel="onRowPressEnd"
            @mousedown="onRowPressStart(row.it, $event)"
            @mousemove="onRowPressMove"
            @mouseup="onRowPressEnd"
            @mouseleave="onRowPressEnd"
          >
            <!-- 固定列：拖拽手柄(仅整理模式) + 预警点 + 名称 + (市场徽标 + 代码) -->
            <view class="td c-name" :class="{ 'has-handle': reorderMode }">
              <view
                v-if="reorderMode"
                class="drag-handle"
                :class="{ on: dragKey === keyOf(row.it) }"
                role="button"
                aria-label="拖动排序"
                @click.stop
                @touchstart.stop="onDragStart($event, row.it)"
                @touchmove.stop="onDragMove"
                @touchend.stop="onDragEnd"
                @touchcancel.stop="onDragEnd"
                @mousedown.stop="onDragStart($event, row.it)"
              >
                <OutlineIcon type="grip" :size="30" :color="dragKey === keyOf(row.it) ? 'var(--primary)' : 'var(--text-3)'" />
              </view>
              <view class="t-block">
                <text class="t-name truncate">{{ row.it.name || row.it.code }}</text>
                <view class="t-sub">
                  <text class="t-mkt mkt-label">{{ row.mkt }}</text>
                  <text class="t-code truncate">{{ row.it.code }}</text>
                </view>
              </view>
            </view>
            <!-- 最新价（独立数值列） -->
            <view v-if="cols.price" class="td c-price">
              <text class="st-num" :class="pctCls(row.q)">{{ row.q.loading || row.q.error || row.q.price === 0 ? '--' : fmtPrice(row.q.price) }}</text>
            </view>
            <!-- 涨跌幅（独立数值列，与榜单同款样式） -->
            <view v-if="cols.pct" class="td c-pct">
              <text class="st-num" :class="pctCls(row.q)">{{ row.q.loading || row.q.error || row.q.price === 0 ? '--' : fmtPct(row.q.pct) }}</text>
            </view>
            <view v-if="cols.chg" class="td c-chg">
              <text class="st-num" :class="pctCls(row.q)">{{ row.q.loading || row.q.error || row.q.price === 0 ? '--' : fmtSigned(row.q.chg) }}</text>
            </view>
            <view v-if="cols.open" class="td c-open">
              <text class="st-num">{{ row.q.loading || row.q.error || row.q.price === 0 ? '--' : fmtPrice(row.q.open) }}</text>
            </view>
            <view v-if="cols.amp" class="td c-amp">
              <text class="st-num">{{ row.q.loading || row.q.error || row.q.price === 0 ? '--' : ampPct(row.q) }}</text>
            </view>
            <view v-if="cols.amt" class="td c-amt">
              <text class="st-num">{{ row.q.loading || row.q.error || row.q.price === 0 ? '--' : fmtAmount(row.q.amount) }}</text>
            </view>
          </view>
          </view>
          </view>
        </scroll-view>
        <!-- 排序/列设置控制按钮：移出 scroll-x 滚动容器，定位覆盖在名称列固定表头左上角，杜绝横滑吞点击 -->
        <view class="wl-cols-overlay">
          <view class="th-cols" :class="{ on: reorderMode || activePanel === 'cols' }">
            <view
              class="th-ic grip"
              :class="{ on: reorderMode }"
              role="button"
              aria-label="拖拽排序"
              @click="toggleReorder"
            >
              <OutlineIcon type="grip" :size="28" :color="reorderMode ? 'var(--primary)' : 'var(--text-3)'" />
            </view>
            <view class="th-ic" :class="{ on: activePanel === 'cols' }" role="button" aria-label="列设置" @click="openCols">
              <OutlineIcon type="columns" :size="28" :color="activePanel === 'cols' ? 'var(--primary)' : 'var(--text-3)'" />
            </view>
          </view>
        </view>
        </view>

        <!-- 统一底部窗体：固定常驻于菜单栏上方(始终可见)，折叠露出「今日最热」卡片；
             展开后按 activePanel 切换 榜单 / 我的分组 / 显示列 三种内容；
             三套内容共用同一窗体、同一套折叠/展开/铺满手势与动效，避免重复样式与代码 -->
        <PeekSheet ref="sheet" @expand="onSheetExpand" @collapse="onSheetCollapse">
          <template #peek>
            <!-- 持仓视图：底部折叠卡展示「持仓概览」（总市值 / 总盈亏 / 收益率），不复用自选的今日最热 -->
            <view v-if="mainView === 'pos'" class="peek-row" role="button" aria-label="展开持仓概览" @click="openPosSheet">
              <text class="peek-label">持仓概览</text>
              <view class="peek-info">
                <view class="peek-main">
                  <text class="peek-name">持仓 {{ posSummary.count }}</text>
                  <text class="peek-code">市值 ¥{{ fmtAmount(sumValue) }}</text>
                </view>
                <view class="peek-right">
                  <text class="peek-price" :class="trendCls(posSummary.pnl)">{{ posSummary.count ? fmtSigned(posSummary.pnl) : '--' }}</text>
                  <text class="peek-pct" :class="trendCls(posSummary.pnl)">{{ posSummary.count ? fmtPct(posSummary.pnlPct) : '--' }}</text>
                </view>
              </view>
              <OutlineIcon class="peek-caret" type="chevron-up" :size="20" color="var(--text-2)" />
            </view>
            <!-- 自选视图：今日最热 / 今日异动 折叠卡 -->
            <view v-else class="peek-row" role="button" aria-label="展开底部面板">
              <text class="peek-label">{{ peekLabel }}</text>
              <!-- 今日最热 ↔ 今日异动 提醒切换复用 <RollSwap>（与行情页大盘指数切换动画完全一致）；
                   异动仅在「产生时刻起的展示窗口内」切换显示，错过窗口不再出现 -->
              <RollSwap class="peek-roll" :roll-key="anomKey">
                <!-- 今日最热 slide：点击展开榜单面板（PeekSheet 原生折叠→半屏→铺满→下拉收回） -->
                <template v-if="curSlide && curSlide.kind === 'today'">
                  <view v-if="peek" class="peek-info">
                    <view class="peek-main">
                      <text class="peek-name">{{ peek.name }}</text>
                      <text class="peek-code">{{ peek.code }}</text>
                    </view>
                    <view class="peek-right">
                      <text class="peek-price" :class="trendCls(peek.price != null ? peek.chg : null)">{{ peek.price != null ? fmtPrice(peek.price) : '--' }}</text>
                      <text class="peek-pct" :class="trendCls(peek.pct != null ? peek.chg : null)">{{ peek.pct != null ? fmtPct(peek.pct) : '--' }}</text>
                    </view>
                  </view>
                  <text v-else class="peek-empty truncate">今日暂无人气新增</text>
                </template>
                <!-- 异动 slide：点击折叠卡即展开 PeekSheet 至半屏（与今日最热卡一致），异动列表在展开体内展示 -->
                <template v-else-if="curSlide && curSlide.kind === 'anom'">
                  <view class="peek-info">
                    <view class="peek-main">
                      <text class="peek-name">{{ curSlide.rec.name }}</text>
                      <text class="peek-code">{{ curSlide.rec.code }}</text>
                    </view>
                    <view class="peek-right">
                      <text class="anom-tag" :class="ANOMALY_META[curSlide.rec.type].cls">{{ ANOMALY_META[curSlide.rec.type].label }}</text>
                      <text class="peek-price" :class="trendCls(curSlide.rec.chg)">{{ fmtPrice(curSlide.rec.price) }}</text>
                      <text class="peek-pct" :class="trendCls(curSlide.rec.chg)">{{ fmtPct(curSlide.rec.pct) }}</text>
                    </view>
                  </view>
                </template>
              </RollSwap>
              <OutlineIcon class="peek-caret" type="chevron-up" :size="20" color="var(--text-2)" />
            </view>
          </template>
          <template #default>
            <!-- 榜单：今日热榜 / 完整榜单 -->
            <template v-if="activePanel === 'rank'">
              <view class="rs-tabs">
                <view class="rs-tab" :class="{ on: rankTab === 'today' }" @click="rankTab = 'today'">今日热榜</view>
                <view class="rs-tab" :class="{ on: rankTab === 'all' }" @click="rankTab = 'all'">完整榜单</view>
                <view class="rs-ink" :class="{ right: rankTab === 'all' }"><view class="rs-ink-bar" /></view>
              </view>
              <scroll-view class="rs-body" scroll-y>
                <RankView :mode="rankTab" @open-market="onSheetOpenMarket" />
              </scroll-view>
            </template>

            <!-- 今日异动列表：与榜单/分组同窗体（同一 PeekSheet），展开即半屏，上拉铺满、下拉收回，交互完全一致 -->
            <template v-else-if="activePanel === 'anomaly'">
              <view class="panel-head grp-head">
                <text class="sheet-title">今日异动列表</text>
              </view>
              <scroll-view class="anom-body" scroll-y>
                <view
                  v-for="a in anomalyList"
                  :key="a.id"
                  class="anom-item"
                  hover-class="anom-item-hover"
                  role="button"
                  :aria-label="a.name + ' ' + ANOMALY_META[a.type].label"
                  @click="openAnomalyStock(a)"
                >
                  <text class="anom-tag" :class="ANOMALY_META[a.type].cls">{{ ANOMALY_META[a.type].label }}</text>
                  <text class="anom-name truncate">{{ a.name }}</text>
                  <text class="anom-code">{{ a.code }}</text>
                  <view class="anom-nums">
                    <text class="anom-price" :class="a.chg > 0 ? 'up' : a.chg < 0 ? 'down' : ''">{{ fmtPrice(a.price) }}</text>
                    <text class="anom-pct" :class="a.chg > 0 ? 'up' : a.chg < 0 ? 'down' : ''">{{ fmtPct(a.pct) }}</text>
                  </view>
                  <text class="anom-time">{{ fmtAnomTime(a.time) }}</text>
                </view>
                <view v-if="!anomalyList.length" class="anom-empty">暂无异动</view>
              </scroll-view>
            </template>

            <!-- 我的分组：主视图 / 新建 / 移入 / 管理 共用同一内容容器，按 groupView 切换 -->
            <template v-else-if="activePanel === 'group'">
              <view class="grp-head panel-head">
                <text class="sheet-title">{{ groupTitle }}</text>
              </view>
              <scroll-view class="grp-body" scroll-y>
                <!-- 持仓汇总明细：右上角总收益胶囊点击进入（复用分组面板同窗体）。
                     卡片复用行情页全球指数面板的 .idx-item 家族（global.css 共享），
                     「总收益」按指数卡「价格+涨跌幅」的布局拆成 主值+收益率 两段基线对齐 -->
                <template v-if="groupView === 'possum'">
                  <view class="tile-grid possum-grid">
                    <view class="idx-item">
                      <view class="idx-item-head"><text class="idx-item-name">持仓市值</text></view>
                      <view class="idx-item-right"><text class="idx-item-price">{{ fmtAmount(sumValue) }}</text></view>
                    </view>
                    <view class="idx-item">
                      <view class="idx-item-head"><text class="idx-item-name">持仓成本</text></view>
                      <view class="idx-item-right"><text class="idx-item-price">{{ fmtAmount(sumCost) }}</text></view>
                    </view>
                    <view class="idx-item">
                      <view class="idx-item-head"><text class="idx-item-name">总收益</text></view>
                      <view class="idx-item-right">
                        <text class="idx-item-price" :class="trendCls(posSummary.pnl)">{{ fmtSigned(posSummary.pnl) }}</text>
                        <text class="idx-item-pct" :class="trendCls(posSummary.pnl)">{{ fmtPct(posSummary.pnlPct) }}</text>
                      </view>
                    </view>
                    <view class="idx-item">
                      <view class="idx-item-head"><text class="idx-item-name">持仓数</text></view>
                      <view class="idx-item-right"><text class="idx-item-price">{{ posSummary.count }} 只</text></view>
                    </view>
                  </view>
                  <text class="grp-tip">总收益 = Σ（现价 − 成本）× 数量；总收益率口径同自选（仅含已设成本/数量的持仓）。点击行可查看个股报告。</text>
                </template>
                <!-- 主视图：我的分组 + 三个入口 -->
                <template v-else-if="groupView === 'main'">
                  <view class="grp-section">
                    <view
                      v-for="row in groupRows"
                      :key="row.key"
                      class="grp-item"
                      :class="{ active: row.active }"
                      hover-class="grp-item-hover"
                      @click="pickGroup(row.key)"
                    >
                      <text class="grp-label">{{ row.label }}</text>
                      <OutlineIcon v-if="row.active" type="check" :size="30" color="var(--primary)" />
                    </view>
                  </view>
                  <view class="grp-list">
                    <view class="grp-item" role="button" @click="openNewGroup">
                      <OutlineIcon type="plus" :size="28" color="var(--primary)" />
                      <text class="grp-label">新建分组</text>
                    </view>
                    <view class="grp-item" role="button" @click="openMove">
                      <OutlineIcon type="layers" :size="28" color="var(--text-2)" />
                      <text class="grp-label">移入分组</text>
                    </view>
                    <view v-if="groups.length" class="grp-item" role="button" @click="openManage">
                      <OutlineIcon type="gear" :size="28" color="var(--text-2)" />
                      <text class="grp-label">管理分组</text>
                    </view>
                  </view>
                </template>

                <!-- 新建分组：步骤1 命名 -->
                <template v-else-if="groupView === 'new' && newStep === 1">
                  <view class="grp-form">
                    <input class="grp-input" v-model="newName" :focus="groupView === 'new' && newStep === 1" placeholder="请输入分组名" @confirm="newNext" />
                  </view>
                </template>
                <!-- 新建分组：步骤2 选择股票加入 -->
                <template v-else-if="groupView === 'new'">
                  <view class="grp-list">
                    <view v-for="it in list" :key="keyOf(it)" class="grp-item" hover-class="grp-item-hover" @click="newPickStock(it)">
                      <text class="grp-label">{{ it.name || it.code }}</text>
                    </view>
                  </view>
                </template>

                <!-- 移入分组：步骤1 选择股票 -->
                <template v-else-if="groupView === 'move' && !moveStock">
                  <view class="grp-list">
                    <view v-for="it in list" :key="keyOf(it)" class="grp-item" hover-class="grp-item-hover" @click="movePickStock(it)">
                      <text class="grp-label">{{ it.name || it.code }}</text>
                    </view>
                  </view>
                </template>
                <!-- 移入分组：步骤2 选择目标分组 -->
                <template v-else-if="groupView === 'move' && !moveNew">
                  <view class="grp-list">
                    <view class="grp-item" hover-class="grp-item-hover" @click="doMoveTarget('')">
                      <text class="grp-label">默认分组</text>
                      <OutlineIcon v-if="selectedGroup === ''" type="check" :size="30" color="var(--primary)" />
                    </view>
                    <view v-for="g in groups" :key="g" class="grp-item" hover-class="grp-item-hover" @click="doMoveTarget(g)">
                      <text class="grp-label">{{ g }}</text>
                      <OutlineIcon v-if="selectedGroup === g" type="check" :size="30" color="var(--primary)" />
                    </view>
                    <view class="grp-item" hover-class="grp-item-hover" @click="moveNew = true">
                      <OutlineIcon type="plus" :size="28" color="var(--primary)" />
                      <text class="grp-label">新建分组…</text>
                    </view>
                  </view>
                </template>
                <!-- 移入分组：内联新建分组名 -->
                <template v-else-if="groupView === 'move'">
                  <view class="grp-form">
                    <input class="grp-input" v-model="moveNewName" :focus="moveNew" placeholder="请输入新分组名" @confirm="doMoveNew" />
                  </view>
                </template>

                <!-- 管理分组：步骤1 选择分组 -->
                <template v-else-if="groupView === 'manage' && !manageTarget">
                  <view class="grp-list">
                    <view v-for="g in groups" :key="g" class="grp-item" hover-class="grp-item-hover" @click="manageTarget = g; renameName = g; manageDel = false">
                      <text class="grp-label">{{ g }}</text>
                    </view>
                  </view>
                </template>
                <!-- 管理分组：步骤2 重命名 / 删除 -->
                <template v-else-if="groupView === 'manage'">
                  <view class="grp-form">
                    <input class="grp-input" v-model="renameName" :focus="!!manageTarget" placeholder="分组名" @confirm="doManageRename" />
                  </view>
                </template>
              </scroll-view>

              <!-- 底部操作条（仅子视图，无遮罩、无边框线） -->
              <view v-if="groupView === 'new'" class="grp-foot">
                <view class="grp-btn" role="button" @click="groupBack">取消</view>
                <view class="grp-btn primary" role="button" @click="newNext">下一步</view>
              </view>
              <view v-else-if="groupView === 'move' && moveNew" class="grp-foot">
                <view class="grp-btn" role="button" @click="moveNew = false">取消</view>
                <view class="grp-btn primary" role="button" @click="doMoveNew">确定</view>
              </view>
              <view v-else-if="groupView === 'manage' && manageTarget" class="grp-foot">
                <template v-if="!manageDel">
                  <view class="grp-btn danger" role="button" @click="manageDel = true">删除分组</view>
                  <view class="grp-btn primary" role="button" @click="doManageRename">重命名</view>
                </template>
                <template v-else>
                  <view class="grp-btn" role="button" @click="manageDel = false">取消</view>
                  <view class="grp-btn danger" role="button" @click="doManageDelete">确认删除</view>
                </template>
              </view>
            </template>

            <!-- 显示列：标题栏与「我的分组」共用 .grp-head/.sheet-title，复用全局 .panel-head 一套样式 -->
            <template v-else-if="activePanel === 'cols'">
              <view class="grp-head panel-head">
                <text class="sheet-title">显示列</text>
              </view>
              <view class="col-list">
                <view
                  v-for="c in activeColList"
                  :key="c.key"
                  class="col-item"
                  :class="{ off: !activeColOn(c.key) }"
                  role="button"
                  @click="toggleActiveCol(c.key)"
                >
                  <text class="col-name">{{ c.label }}</text>
                  <view class="col-sw" :class="{ on: activeColOn(c.key) }"><view class="col-knob" /></view>
                </view>
              </view>
              <text class="col-tip">设置仅保存在本机，不影响其他设备</text>
            </template>

            <!-- 长按操作菜单：与「我的分组」「显示列」共用同一 PeekSheet 窗体（替代原独立 ActionSheet） -->
            <template v-else-if="activePanel === 'actions'">
              <view class="grp-head panel-head">
                <text class="sheet-title">{{ lpItem ? (lpItem.name || lpItem.code) : '' }}</text>
              </view>
              <view class="grp-list">
                <view class="grp-item" role="button" @click="openPosForm">
                  <OutlineIcon type="portfolio" :size="28" color="var(--text-2)" />
                  <text class="grp-label">设置持仓</text>
                </view>
                <view class="grp-item" role="button" @click="openAlertPanel">
                  <OutlineIcon type="bell" :size="28" color="var(--text-2)" />
                  <text class="grp-label">编辑价格预警</text>
                </view>
                <view class="grp-item" role="button" @click="openMoveFromSheet">
                  <OutlineIcon type="layers" :size="28" color="var(--text-2)" />
                  <text class="grp-label">移入分组</text>
                </view>
                <view class="grp-item" role="button" @click="removeLp">
                  <OutlineIcon type="trash" :size="28" color="#ff3b30" />
                  <text class="grp-label danger">删除自选</text>
                </view>
              </view>
            </template>

            <!-- 编辑价格预警子面板：展示实时价供参考；高于/低于改为选项下方内联输入（替代原 uni-modal 弹窗） -->
            <template v-else-if="activePanel === 'alert'">
              <view class="grp-head panel-head">
                <text class="sheet-title">价格预警</text>
              </view>
              <!-- 实时价参考：进入面板即拉取最新成交价，供用户设定阈值时对照 -->
              <view class="alert-rt">
                <text class="alert-rt-label">当前实时价</text>
                <text class="alert-rt-price" :class="trendCls(alertRT?.chg)">{{ alertRT ? fmtPrice(alertRT.price) : '—' }}</text>
                <text class="alert-rt-sub" :class="trendCls(alertRT?.chg)" v-if="alertRT">{{ fmtSigned(alertRT.chg) }} · {{ fmtPct(alertRT.pct) }}</text>
                <text class="alert-rt-sub" v-else>实时价获取中…</text>
              </view>
              <view class="grp-list">
                <view class="grp-item" :class="{ active: alertEdit === 'above' }" role="button" @click="startEdit('above')">
                  <OutlineIcon type="arrow-up" :size="28" color="var(--text-2)" />
                  <text class="grp-label">设置高于预警<text v-if="aboveVal != null" class="alert-cur"> · ¥{{ fmtPrice(aboveVal) }}</text></text>
                </view>
                <view v-if="alertEdit === 'above'" class="alert-edit">
                  <input class="alert-input" type="digit" v-model="alertInput" :placeholder="alertRT ? ('高于此价提醒（参考 ¥' + fmtPrice(alertRT.price) + '）') : '高于此价提醒，如 12.5'" />
                  <view class="alert-edit-btns">
                    <view class="grp-btn" role="button" @click="alertEdit = null">取消</view>
                    <view class="grp-btn primary" role="button" @click="saveAlert('above')">保存</view>
                  </view>
                </view>
                <view class="grp-item" :class="{ active: alertEdit === 'below' }" role="button" @click="startEdit('below')">
                  <OutlineIcon type="arrow-down" :size="28" color="var(--text-2)" />
                  <text class="grp-label">设置低于预警<text v-if="belowVal != null" class="alert-cur"> · ¥{{ fmtPrice(belowVal) }}</text></text>
                </view>
                <view v-if="alertEdit === 'below'" class="alert-edit">
                  <input class="alert-input" type="digit" v-model="alertInput" :placeholder="alertRT ? ('低于此价提醒（参考 ¥' + fmtPrice(alertRT.price) + '）') : '低于此价提醒，如 12.5'" />
                  <view class="alert-edit-btns">
                    <view class="grp-btn" role="button" @click="alertEdit = null">取消</view>
                    <view class="grp-btn primary" role="button" @click="saveAlert('below')">保存</view>
                  </view>
                </view>
                <view class="grp-item" role="button" @click="clearAlert">
                  <OutlineIcon type="trash" :size="28" color="#ff3b30" />
                  <text class="grp-label danger">清除预警</text>
                </view>
              </view>
            </template>
          </template>
        </PeekSheet>

        <!-- 设置持仓弹窗（共享组件 PositionForm）：长按菜单打开，按 lpItem 现读/写入 costBasis -->
        <PositionForm ref="posFormRef" :secid="lpSecid" @save="saveLpPosition" @clear="clearLpPosition" />

      </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onActivated, onDeactivated, onUnmounted } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import PageHeader from "@/components/PageHeader.vue";
import PeekSheet from "@/components/PeekSheet.vue";
import PositionForm from "@/components/PositionForm.vue";
import RollSwap from "@/components/RollSwap.vue";
import RankView, { preloadRank } from "@/views/RankView.vue";
import { useWatchlist, removeWatch, setItemGroup, setAlerts, renameGroup, deleteGroup, applyGroupOrder, type WatchItem, type PriceAlert } from "@/store/watchlist";
import { userState } from "@/store/user";
import { goTab, openInMarket, navTab } from "@/store/nav";
import { usePageGuard } from "@/store/guard";
import { fetchSnapshot, fetchSnapshots, type SnapResult } from "@/api/quote";
import { fetchStockHeat } from "@/api/heat";
import { resolveSecid, marketCharFor, marketFromSecid } from "@/utils/period";
import { getMarketStatus } from "@/utils/marketStatus";
import { fmtPrice, fmtPct, fmtSigned, fmtAmount, trendCls } from "@/utils/format";
import { anomalies, type AnomalyRecord, ANOMALY_META } from "@/store/anomaly";
import { staleGet, staleSet } from "@/utils/staleCache";
import { analyze } from "@/utils/analyzer";
import { toActionChip } from "@/utils/actionSignal";
import { getKline } from "@/api/sources";
import { listCostSecids, getPosition, setPosition, clearPosition, listPositions, getLastSignal, setLastSignal, positionsVersion, type Position } from "@/utils/costBasis";
import { hydrateCloudPositions } from "@/store/holdingsMirror";
import { saveHolding, dropHolding } from "@/api/holdings";

// 长按操作菜单目标股（统一并入 PeekSheet 面板，替代原先独立的 ActionSheet 弹层）
const sheetExpanded = ref(false);
const lpItem = ref<WatchItem | null>(null);
function onSheetCollapse() {
  // 下拉拖拽收起 / 程序化 collapse() 时复位面板状态（回到榜单），并清空长按目标
  activePanel.value = "rank";
  // 分组面板子视图一并复位：头部返回按钮已移除，若不复位，下次展开会停在
  // 新建/移入/管理/持仓汇总等子视图且无路可退
  groupView.value = "main";
  sheetExpanded.value = false;
  lpItem.value = null;
  // 收起即露出「今日最热」预览卡：此时刷新，保证与展开态「今日热榜」数据一致、不陈旧
  loadPeek();
}

const emit = defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

const wl = useWatchlist();
const list = computed(() => wl.items as WatchItem[]);

// 统一底部窗体 PeekSheet（持久常驻）：折叠露出「今日最热」卡片，展开后按 activePanel
// 切换 榜单 / 我的分组 / 显示列 三种内容；下拉收起时父组件通过 @collapse 复位到 rank。
const sheet = ref<any>(null);
const activePanel = ref<"rank" | "group" | "cols" | "actions" | "alert" | "anomaly">("rank");
const rankTab = ref<"today" | "all">("today");

// 露出卡片预览数据：与折叠态卡片标签「今日最热」一致，始终取「当日（北京时间）新增自选」第 1 名；
// 当日无新增时 peek=null，模板显示「今日暂无人气新增」，绝不兜底完整榜单。
interface PeekRow {
  code: string;
  name: string;
  chg: number;
  pct: number | null;
  price: number | null;
}
const peek = ref<PeekRow | null>(staleGet<PeekRow>("wl:peek"));
async function loadPeek() {
  const heat = await fetchStockHeat(20, true);
  // 刷新容错：热度接口读失败会伪装成空数组——已有旧内容时保留（允许数据延迟），首次为空正常
  if (!heat.length) return;
  const top = heat[0];
  const secid = resolveSecid(top.code, top.market as any);
  try {
    const s = await fetchSnapshot(secid);
    peek.value = { code: top.code, name: top.name, chg: s.chg, pct: s.pct, price: s.price };
    staleSet("wl:peek", peek.value);
  } catch {
    peek.value = { code: top.code, name: top.name, chg: 0, pct: null, price: null };
    staleSet("wl:peek", peek.value);
  }
}

// ===== 今日异动：提醒（按产生时刻的时间窗触发）+ 列表（同窗体面板） =====
// 复用 PeekSheet + .peek-row 同一套底部卡片（与行情页指数卡、自选页热榜卡同源），
// 切换/轮播动画复用 <RollSwap>（与行情页大盘指数切换完全一致：垂直滚动 360ms cubic-bezier(0.22,0.61,0.36,1)）；
// 异动列表作为 PeekSheet 内的独立面板（activePanel='anomaly'），展开即半屏，上拉铺满、下拉收回，交互与其他卡片完全一致。
// 数据严格限定为当前登录账号自选股范围内的异动（剔除已移出自选列表的股票残留记录）。
type AnomSlide =
  | { kind: "today" }
  | { kind: "anom"; rec: AnomalyRecord };
const myCodes = computed(() => new Set(wl.items.map((it) => it.code)));
const anomalyList = computed(() => anomalies.value.filter((a) => myCodes.value.has(a.code)));
// 折叠卡标题随当前 slide 切换：今日最热 ↔ 今日异动
const ANOM_LABEL = "今日异动";
const ANOM_SHOW_MS = 5000; // 提醒展示时长（维持原轮播单条 5s 的展示配置）
const curSlide = ref<AnomSlide>({ kind: "today" });
const peekLabel = computed(() => (curSlide.value.kind === "anom" ? ANOM_LABEL : "今日最热"));
// RollSwap 的 key：今日最热=today，异动=anom:<id>（slide 变化时 key 变化触发垂直滚动切换）
const anomKey = computed(() =>
  curSlide.value.kind === "anom" ? "anom:" + curSlide.value.rec.id : "today"
);
// ===== 提醒时效模型：纯时间驱动，无已读状态 =====
// 异动在 rec.time 产生 → 提醒必须在该时间点触发，持续展示 ANOM_SHOW_MS 后消失：
// - 窗口内（rec.time ≤ 现在 < rec.time + ANOM_SHOW_MS）恒展示该提醒：无论异动产生多久、
//   页面是否刷新，只要此刻仍在窗口内就继续展示（无已读标记可阻断）；
// - 错过窗口（现在 ≥ rec.time + ANOM_SHOW_MS）永不触发：从本地恢复的历史异动不再回放；
// - 多条异动窗口重叠时展示最新一条（延续原轮播「最新优先」原则）。
function activeAnomaly(now: number): AnomalyRecord | null {
  let latest: AnomalyRecord | null = null;
  for (const rec of anomalyList.value) {
    const t = new Date(rec.time).getTime();
    if (Number.isNaN(t) || now < t || now >= t + ANOM_SHOW_MS) continue;
    if (!latest || rec.time > latest.time) latest = rec;
  }
  return latest;
}
function syncAnomReminder() {
  const rec = activeAnomaly(Date.now());
  // 同值跳过：500ms 心跳仅在提醒条目实际变化时才赋值（activeAnomaly 返回的 rec 引用稳定，
  // 「今日」态比较 kind），避免每拍新建对象驱动含大表格的整棵组件树重渲染
  const cur = curSlide.value;
  if (rec ? cur.kind === "anom" && cur.rec === rec : cur.kind === "today") return;
  curSlide.value = rec ? { kind: "anom", rec } : { kind: "today" };
}
let anomTimer: any = null;
function startAnomSync() {
  if (anomTimer) return;
  syncAnomReminder(); // 启动即对齐：挂载/回页时可能正处于某条异动的展示窗口内
  anomTimer = setInterval(syncAnomReminder, 500); // 500ms 对齐触发时刻（列表 ≤50 条，开销可忽略）
}
function stopAnomSync() {
  if (anomTimer) {
    clearInterval(anomTimer);
    anomTimer = null;
  }
  curSlide.value = { kind: "today" };
}
// immediate：挂载时异动列表可能已从本地恢复为非空，必须立即启动对齐定时器，
// 否则 watch 不触发、定时器不启动，窗口内的提醒不会展示。
watch(anomalyList, (list) => (list.length > 0 ? startAnomSync() : stopAnomSync()), {
  immediate: true,
});
function onSheetExpand() {
  // 展开即半屏（PeekSheet 原生行为）
  sheetExpanded.value = true;
  // 仅当用户从折叠态手势展开（activePanel 仍为闲置的 rank）时，才按当前显示的 slide 套用默认面板：
  // 卡片显示今日最热 → 热榜面板；显示异动提醒 → 异动列表面板。
  // 若是 openCols / openGroups 等程序化展开，调用方已先行设定 activePanel（'cols'/'group'），
  // 此处不可覆盖，否则会出现「点设置列却弹出异动列表」的回归。
  if (activePanel.value === "rank") {
    activePanel.value = curSlide.value.kind === "anom" ? "anomaly" : "rank";
  }
}
function openAnomalyStock(a: AnomalyRecord) {
  openInMarket(a.code, "auto");
  goTab("market");
}
function fmtAnomTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 分组筛选：默认展示「全部」（含所有分组），通过右上角「分组」切换；分组名从现有自选派生
const selectedGroup = ref<string>("__all__");
const groups = computed(() => {
  const s = new Set<string>();
  for (const it of list.value) if (it.group) s.add(it.group);
  return Array.from(s).sort();
});
const filteredList = computed(() => {
  const base = list.value;
  if (selectedGroup.value === "__all__") {
    // 「全部」视图：按独立字段 globalOrder 排序（与分组内 order 互不干扰）；
    // 未做过全局拖拽时 globalOrder 为 undefined → 回落到加入时间 created_at，顺序稳定。
    return base.slice().sort((a, b) => {
      const oa = a.globalOrder ?? Infinity;
      const ob = b.globalOrder ?? Infinity;
      if (oa !== ob) return oa - ob;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
  }
  const grp = selectedGroup.value; // "" = 默认分组
  // 单分组视图：按「分组内 order」排序（即加入该分组的时间顺序，move/拖拽可改）
  return base
    .filter((i) => (i.group || "") === grp)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});

// 分组切换面板：统一窗体 PeekSheet 的 group 内容区（与热榜/显示列同窗体）
const groupRows = computed(() => {
  const rows: { label: string; key: string; active: boolean }[] = [
    { label: "全部", key: "__all__", active: selectedGroup.value === "__all__" },
  ];
  // 「移入分组」允许把标的移到「默认分组」，但筛选面板原本只有具名分组 →
  // 移进去后就再也筛不到它（只能在「全部」里翻）。存在无分组标的时补一行「默认分组」。
  if (list.value.some((it) => !it.group)) {
    rows.push({ label: "默认分组", key: "", active: selectedGroup.value === "" });
  }
  for (const g of groups.value) {
    rows.push({ label: g, key: g, active: selectedGroup.value === g });
  }
  return rows;
});
function pickGroup(key: string) {
  selectedGroup.value = key;
  manualOrderGroup.value = null; // 切换分组即令手工顺序失效，renderRows 回落 store default order
  sheet.value?.collapse();
}

// 分组面板多视图：我的分组 / 新建分组 / 移入分组 / 管理分组 / 持仓汇总 共用同一窗体
const groupView = ref<'main' | 'new' | 'move' | 'manage' | 'possum'>('main');
const newStep = ref(1);
const newName = ref('');
const moveStock = ref<WatchItem | null>(null);
const moveNew = ref(false);
const moveNewName = ref('');
const manageTarget = ref('');
const renameName = ref('');
const manageDel = ref(false);

const groupTitle = computed(() => {
  if (groupView.value === 'new') return newStep.value === 1 ? '新建分组' : '选择股票加入';
  if (groupView.value === 'move') return moveStock.value ? '移入分组' : '选择股票';
  if (groupView.value === 'manage') return manageTarget.value ? `管理「${manageTarget.value}」` : '管理分组';
  if (groupView.value === 'possum') return '持仓汇总';
  return '我的分组';
});

// 返回：子视图内优先回退一步，否则回到主视图
function groupBack() {
  if (groupView.value === 'new' && newStep.value === 2) {
    newStep.value = 1;
    return;
  }
  if (groupView.value === 'move' && moveStock.value) {
    moveStock.value = null;
    return;
  }
  if (groupView.value === 'manage' && manageTarget.value) {
    manageTarget.value = '';
    renameName.value = '';
    manageDel.value = false;
    return;
  }
  groupView.value = 'main'; // possum / new / move / manage 均回主视图
}

function openNewGroup() {
  if (!list.value.length) {
    uni.showToast({ title: '请先在行情页添加自选股', icon: 'none' });
    return;
  }
  newStep.value = 1;
  newName.value = '';
  groupView.value = 'new';
}
function openMove() {
  moveStock.value = null;
  moveNew.value = false;
  moveNewName.value = '';
  groupView.value = 'move';
}
function openManage() {
  manageTarget.value = '';
  renameName.value = '';
  manageDel.value = false;
  groupView.value = 'manage';
}

function newNext() {
  const name = newName.value.trim();
  if (!name) {
    uni.showToast({ title: '请输入分组名', icon: 'none' });
    return;
  }
  if (groups.value.includes(name)) {
    uni.showToast({ title: '分组已存在', icon: 'none' });
    return;
  }
  newStep.value = 2;
}
function newPickStock(it: WatchItem) {
  const name = newName.value.trim();
  setItemGroup(it.code, it.market, name);
  // 新建并加入后保持当前视图（不自动切换分组），可在「选择股票加入」中继续添加多只
  uni.showToast({ title: `已创建「${name}」`, icon: 'none' });
  sheet.value?.collapse();
}

function movePickStock(it: WatchItem) {
  moveStock.value = it;
}
function doMoveTarget(grp: string) {
  if (!moveStock.value) return;
  setItemGroup(moveStock.value.code, moveStock.value.market, grp);
  // 移入后保持当前视图（不自动切换分组），避免操作后跳走、打断浏览
  uni.showToast({ title: `已移入${grp || '默认'}`, icon: 'none' });
  sheet.value?.collapse();
}
function doMoveNew() {
  const name = moveNewName.value.trim();
  if (!name) {
    uni.showToast({ title: '请输入分组名', icon: 'none' });
    return;
  }
  if (moveStock.value) {
    setItemGroup(moveStock.value.code, moveStock.value.market, name);
  }
  // 移入后保持当前视图（不自动切换分组）
  uni.showToast({ title: `已移入${name}`, icon: 'none' });
  sheet.value?.collapse();
}

function doManageRename() {
  const v = renameName.value.trim();
  if (!v || !manageTarget.value) return;
  if (v !== manageTarget.value) renameGroup(manageTarget.value, v);
  manageTarget.value = '';
  renameName.value = '';
  manageDel.value = false;
  uni.showToast({ title: '已重命名', icon: 'none' });
}
function doManageDelete() {
  if (!manageTarget.value) return;
  deleteGroup(manageTarget.value);
  if (selectedGroup.value === manageTarget.value) {
    selectedGroup.value = '__all__';
    manualOrderGroup.value = null; // 视图切回全部，手工顺序失效
  }
  manageTarget.value = '';
  renameName.value = '';
  manageDel.value = false;
  uni.showToast({ title: '已删除', icon: 'none' });
}

// 未登录且已配置后端（登录可达）时，进入本页自动跳转登录页（见 onActivated）
const needLogin = computed(() => userState.supabaseEnabled && !userState.loggedIn);

// 全局页面守卫：本页未对游客开放 + 未登录 → 跳转登录页（统一由 src/store/guard.ts 处理，
// 不再在各页 onActivated 重复写跳转逻辑）
usePageGuard("watch");

interface Snap {
  price: number;
  chg: number;
  pct: number;
  preClose?: number;
  open?: number;
  high?: number;
  low?: number;
  amount?: number;
  loading: boolean;
  error?: boolean;
}
const EMPTY: Snap = { price: 0, chg: 0, pct: 0, loading: true };

const quotes = reactive<Record<string, Snap>>({});
// 页面切换 / 实例重建时先回填上次成功行情（stale-while-revalidate），避免短暂 "--" 空态
const staleQ = staleGet<Record<string, Snap>>("wl:quotes");
if (staleQ) Object.assign(quotes, staleQ);
const keyOf = (it: WatchItem) => `${it.code}|${it.market}`;

// 价格预警：上一轮成功价格（用于穿越检测）+ 当前命中行方向（up=突破阈值/红，down=跌破阈值/绿）
const prevPrices = reactive<Record<string, number>>({});
const alertState = ref<Record<string, "up" | "down">>({});

// 自选股实时行情：一次批量拉取全部快照（fetchSnapshots 单请求 + 20s TTL 跨页共享，
// 替代逐只 fetchSnapshot 的 N 并发），填充现价与涨跌幅，并检测价格预警穿越
async function loadQuotes() {
  if (userState.supabaseEnabled && !userState.loggedIn) return;
  const items = list.value;
  if (!items.length) return;
  // 单只代码解析失败（如 market 异常）不应中断整批行情；解析失败置 null，后续按「缺失」处理。
  const secids = items.map((it) => {
    try {
      return resolveSecid(it.code, it.market as any);
    } catch {
      return null;
    }
  });
  // 刷新容错：已有旧快照时不重置为 loading 骨架（避免刷新期间整行数字变 --），
  // 仅置 loading 标记；无旧值时才显示骨架
  for (let i = 0; i < items.length; i++) {
    const k = keyOf(items[i]);
    const old = quotes[k];
    if (!old || !old.price) quotes[k] = { ...EMPTY, loading: true };
    else quotes[k] = { ...old, loading: true };
  }
  // 仅向网关传有效 secid（跳过解析失败项）；结果仍以 secid 为键，下面按原始序号取用并跳过 null。
  const snaps = await fetchSnapshots(secids.filter((s): s is string => !!s));
  for (let i = 0; i < items.length; i++) {
    const k = keyOf(items[i]);
    const old = quotes[k];
    const secid = secids[i];
    const snap = secid ? snaps[secid] : undefined;
    if (snap) {
      quotes[k] = { ...snap, loading: false };
      detectAlert(items[i], snap.price);
    } else if (!old || !old.price) {
      // 刷新容错：读失败保留旧快照（允许数据延迟），仅首次无旧值时才显示错误态
      quotes[k] = { ...EMPTY, loading: false, error: true };
    } else {
      quotes[k] = { ...old, loading: false };
    }
  }
  // 删除自选后回收其行情条目：quotes 只增不删会让键集合随历史自选单调膨胀，
  // 且每轮轮询都把整份（含已删除标的）写回 stale 缓存。按当前 list 重建键集合。
  const alive = new Set(items.map(keyOf));
  for (const k of Object.keys(quotes)) {
    if (!alive.has(k)) {
      delete quotes[k];
      delete prevPrices[k];
    }
  }
  // 保留本次成功快照到 stale 缓存（排除 loading 态）：实例重建时先展示旧数据
  const staleClean: Record<string, Snap> = {};
  for (const k of Object.keys(quotes)) {
    const st = quotes[k];
    if (!st.loading && st.price) staleClean[k] = { ...st };
  }
  staleSet("wl:quotes", staleClean);
  refreshAlertHits();
}

// 穿越检测：与上一轮价格比较，向上突破 / 向下跌破阈值时即时 Toast（H5 无系统推送，仅应用内）
function detectAlert(it: WatchItem, price: number) {
  const a = it.alerts;
  if (!a || !price) return;
  const k = keyOf(it);
  const prev = prevPrices[k];
  if (prev != null && isFinite(prev)) {
    if (a.above != null && prev < a.above && price >= a.above) {
      uni.showToast({ title: `${it.name || it.code} 突破 ${a.above} 元`, icon: "none" });
    }
    if (a.below != null && prev > a.below && price <= a.below) {
      uni.showToast({ title: `${it.name || it.code} 跌破 ${a.below} 元`, icon: "none" });
    }
  }
  prevPrices[k] = price;
}

// 命中状态：列出当前已处于预警区间的行及其方向，驱动对应行闪烁提示（替代原横幅卡片）
function refreshAlertHits() {
  const next: Record<string, "up" | "down"> = {};
  for (const it of list.value) {
    const a = it.alerts;
    if (!a) continue;
    const q = quotes[keyOf(it)];
    const price = q?.price;
    if (!price) continue;
    if (a.above != null && price >= a.above) next[keyOf(it)] = "up";
    else if (a.below != null && price <= a.below) next[keyOf(it)] = "down";
  }
  alertState.value = next;
}

// ===== 持仓信号巡检：已填持仓（=持仓中）的自选标的，产生买/卖信号时在页内常驻卡片提醒 =====
// 信号用真实 analyze() 引擎对日 K 计算（与报告页同源）；去重：记录每只上次信号档，
// 仅信号档发生变化（含首次）才进入提醒卡。卡片常驻展示、点击行跳转个股、手动关闭才消失
//（替代原 uni.showModal：H5 模态观感与应用风格割裂，且易被误触关掉）。
interface SigAlert {
  code: string;
  name: string;
  level: "buy" | "sell";
  price: number;
  pnl: number;
}
const sigAlertList = ref<SigAlert[]>([]);
function dismissSigAlerts() {
  sigAlertList.value = [];
}
function openAlertStock(a: SigAlert) {
  openInMarket(a.code, "auto");
  goTab("market");
}
let scanningSig = false;
async function scanPositionSignals() {
  if (scanningSig) return;
  const costSecids = listCostSecids();
  if (!costSecids.length) {
    sigAlertList.value = [];
    return;
  }
  const nameBySecid = new Map(
    list.value.map((it) => [resolveSecid(it.code, it.market as any) as string, it.name || it.code])
  );
  scanningSig = true;
  try {
    const alerts: SigAlert[] = [];
    for (const secid of costSecids) {
      try {
        const kls = await getKline(secid, "d");
        if (!kls || kls.length < 60) continue;
        const a = analyze(kls, {}, null, kls, null, secid.split(".")[1], "d");
        const lvl = a.signal.level;
        const prev = getLastSignal(secid);
        setLastSignal(secid, lvl);
        // 顺带缓存信号标签供持仓视图复用（同一引擎同一口径，不重复跑 analyze）
        posSigMap.value = { ...posSigMap.value, [secid]: toActionChip(lvl, true) };
        if ((lvl === "buy" || lvl === "sell") && lvl !== prev) {
          const cost = getPosition(secid)?.cost;
          const pnl = cost ? ((a.price - cost) / cost) * 100 : 0;
          alerts.push({
            code: secid.split(".")[1] || secid,
            name: nameBySecid.get(secid) || secid,
            level: lvl as "buy" | "sell",
            price: a.price,
            pnl,
          });
        }
      } catch {
        /* 单只失败不影响其余 */
      }
    }
    // 仅在有新提醒时替换卡片内容；无提醒且用户已手动关闭（当前为空）则不打扰
    if (alerts.length) sigAlertList.value = alerts;
  } finally {
    scanningSig = false;
  }
}


// ===== 自选 / 持仓 两视图：同一 WatchlistView 内切换（底部只有「自选」一个 Tab） =====
// 自选=关注（不含成本语义），持仓=实际持有（成本/数量驱动盈亏），两者不混同；
// 点击左上角品牌区（图标 + swap 提示）在 自选 ↔ 持仓 间切换，本地持久化上次停留视图。
type MainView = "watch" | "pos";
const POS_VIEW_KEY = "wl:mainView";
const mainView = ref<MainView>(uni.getStorageSync(POS_VIEW_KEY) === "pos" ? "pos" : "watch");
// 同步底部 Tab 文案/图标：切到持仓时 watch Tab 显示「持仓」+ portfolio 图标（见 index.vue tabs computed）
navTab.watchView = mainView.value;
function toggleView() {
  mainView.value = mainView.value === "pos" ? "watch" : "pos";
  try {
    uni.setStorageSync(POS_VIEW_KEY, mainView.value);
  } catch (_) {}
  navTab.watchView = mainView.value;
  // 首次进入持仓视图：行情快照复用自选页已有的批量缓存，信号若未扫描过则触发一次巡检
  if (mainView.value === "pos" && (!posSigMap.value || !Object.keys(posSigMap.value).length)) {
    scanPositionSignals();
  }
}

// ===== 持仓视图数据：listPositions() + 行情快照（复用 quotes）+ analyze 信号（复用 sigCache） =====
// 信号即行情页操作建议信号（同一 analyze 引擎对日 K 计算，同一双视角标签）；
// 收益率/盈亏 = (现价−成本)×数量；成本或行情缺失时显示 "--"，不硬造数据
interface PosRow {
  secid: string;
  code: string;
  name: string;
  cost: number;
  qty: number;
  price: number;
  pnl: number;
  pnlPct: number;
  /* 操作信号（持仓视角）：标签与配色类名由 utils/actionSignal 统一产出 */
  actText: string;
  actCls: string;
  /* 所属分组（取自对应自选项，"" = 默认分组）：持仓视图与自选视图共用同一套分组筛选 */
  group: string;
  /* 当日涨跌额与行情装载态：供顶部胶囊统计「当前分组涨/跌家数」，口径与自选视图一致 */
  chg: number;
  loading: boolean;
}
// 信号缓存（secid → {text, cls}）：scanPositionSignals 已对每只持仓算过 analyze，
// 在此顺带缓存信号标签，持仓视图直接复用，不重复跑引擎。
// 标签来自 utils/actionSignal（与行情页信号卡同一份实现）：持仓表内必然已持仓，
// 因此固定走「持仓视角」→ 加仓 / 持有 / 减仓，与行情页设过持仓后看到的标签完全一致。
const posSigMap = ref<Record<string, { text: string; cls: string }>>({});
// 全量持仓行（未按分组筛选）：供「该分组无持仓」空态判断与分组筛选的基集
const posRowsAll = computed<PosRow[]>(() => {
  void positionsVersion.value; // 持仓变更（设置/清除）后立即重算，修复「设了持仓却显示无持仓」
  const out: PosRow[] = [];
  for (const p of listPositions()) {
    const [m, code] = p.secid.split(".");
    const k = list.value.findIndex(
      (it) => resolveSecid(it.code, it.market as any) === p.secid
    );
    const it = k >= 0 ? list.value[k] : null;
    const name = it?.name || code;
    // 与 loadQuotes 使用同一 keyOf(it) 取行情，避免 watch 项 market 字段（如 "auto"）
    // 与 marketFromSecid(secid) 不一致导致查不到行情、价格回落 0、收益率算错。
    const q = it ? quotes[keyOf(it)] : quotes[`${code}|${marketFromSecid(p.secid)}`];
    const price = q?.price || 0;
    const sig = posSigMap.value[p.secid] || toActionChip("wait", true);
    const pnlPct = p.cost && price ? ((price - p.cost) / p.cost) * 100 : 0;
    out.push({
      secid: p.secid,
      code,
      name,
      cost: p.cost,
      qty: p.qty ?? 0,
      price,
      pnl: p.cost && price && p.qty ? (price - p.cost) * p.qty : 0,
      pnlPct,
      actText: sig.text,
      actCls: sig.cls,
      group: it?.group || "",
      chg: q?.chg ?? 0,
      loading: q?.loading ?? true,
    });
  }
  // 持仓拖拽重排：按持久化的 secid 顺序重排；新持仓（不在序列中）落到末尾
  if (posManualOrder.value.length) {
    const idx = new Map(posManualOrder.value.map((k, i) => [k, i]));
    out.sort((a, b) => {
      const ia = idx.get(a.secid);
      const ib = idx.get(b.secid);
      if (ia != null && ib != null) return ia - ib;
      if (ia != null) return -1;
      if (ib != null) return 1;
      return 0;
    });
  }
  return out;
});
// 持仓视图渲染集：与自选视图共用 selectedGroup（顶部同一枚分组胶囊），
// 「全部」不筛选；选定分组时只留该分组内的持仓，保证胶囊上的分组名/涨跌家数与列表一致
const posRows = computed<PosRow[]>(() => {
  if (selectedGroup.value === "__all__") return posRowsAll.value;
  const grp = selectedGroup.value; // "" = 默认分组
  return posRowsAll.value.filter((r) => r.group === grp);
});
// 右上角汇总：总盈亏 = Σ(现价−成本)×数量；总收益率 = 总盈亏 / Σ(成本×数量)（成本加权，口径一致）
const posSummary = computed(() => {
  let pnl = 0;
  let base = 0;
  for (const r of posRows.value) {
    if (r.qty && r.price && r.cost) {
      pnl += (r.price - r.cost) * r.qty;
      base += r.cost * r.qty;
    }
  }
  return { count: posRows.value.length, pnl, pnlPct: base > 0 ? (pnl / base) * 100 : 0 };
});
// 持仓汇总面板：市值 / 成本 供明细展示
const sumValue = computed(() => posRows.value.reduce((s, r) => s + (r.price && r.qty ? r.price * r.qty : 0), 0));
const sumCost = computed(() => posRows.value.reduce((s, r) => s + (r.cost && r.qty ? r.cost * r.qty : 0), 0));
// 点击持仓行：跳转行情页查看该股报告（持仓状态双视角在报告页自动生效）
function openPosStock(p: PosRow) {
  if (lpFired) {
    lpFired = false; // 长按已触发菜单，抑制随后冒泡的 click，避免误开个股
    return;
  }
  openInMarket(p.code, marketFromSecid(p.secid) as any);
  goTab("market");
}
// 持仓行长按：按 secid 回找自选集 WatchItem，复用同一套动作面板（设置持仓/清除持仓/预警等）
function onPosPressStart(p: PosRow, e: any) {
  const it = list.value.find((it) => resolveSecid(it.code, it.market as any) === p.secid) ?? null;
  if (!it) return;
  lpFired = false;
  const pt = pressPt(e);
  lpStartX = pt.x;
  lpStartY = pt.y;
  if (lpTimer != null) clearTimeout(lpTimer);
  lpTimer = setTimeout(() => {
    lpFired = true;
    onRowLongPress(it);
  }, LP_MS);
}
// 右上角总收益胶囊点击：展开抽屉面板（与分组/榜单同窗体）——透出持仓汇总明细
function openPosSheet() {
  if (lpItem.value) lpItem.value = null;
  sheetExpanded.value = true;
  activePanel.value = "group";
  groupView.value = "possum";
  sheet.value?.expand();
}

// 空态按钮：跳转到行情 tab 选股
function goPickMarket() {
  goTab("market");
}

// 分组管理入口：右上角「分组」pill 点击后，复用底部统一窗体（与热榜/显示列同窗体），
// 展开并切到 group 内容区；再次点击则收起（toggle）
function openGroups() {
  if (sheetExpanded.value && activePanel.value === "group") {
    sheet.value?.collapse();
    return;
  }
  groupView.value = "main";
  activePanel.value = "group";
  sheet.value?.expand();
}

// 下拉刷新（页面级 onPullDownRefresh，见 index.vue）：
// index 是注册 page，其 onPullDownRefresh 会路由到当前 tab 视图的 refresh()；
// 自选页此处复载行情。榜单卡片是 fixed 浮层，其拖拽手柄已 stopPropagation，
// 不会把「下拉收起 / 上拉铺满」手势冒泡到页面级刷新，避免误触发 loading。
async function onRefresh() {
  await loadQuotesSafe();
}
defineExpose({ refresh: () => onRefresh() });

// 自动刷新心跳：非后台常驻，离开页面即停
let loadingQuotes = false;
let pollTimer: any = null;
const POLL_MS = 15000;
async function loadQuotesSafe() {
  if (loadingQuotes) return;
  loadingQuotes = true;
  try {
    await loadQuotes();
  } finally {
    loadingQuotes = false;
  }
}
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (needLogin.value || !list.value.length) return;
    // 休市期间个股数据不变：跳过自动刷新（首次加载已完成），开市后下一拍自动恢复
    if (!getMarketStatus().open) return;
    loadQuotesSafe();
  }, POLL_MS);
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

const rows = computed(() =>
  filteredList.value.map((it) => ({
    it,
    q: quotes[keyOf(it)] || EMPTY,
    mkt: marketCharFor(it.code, it.market),
  }))
);

// ===== 列显隐：本地持久化（wl_cols），默认全显 =====
type ColKey = "pct" | "price" | "chg" | "open" | "amp" | "amt";
const COLS_KEY = "wl_cols";
const colDefs: { key: ColKey; label: string }[] = [
  { key: "price", label: "最新价" },
  { key: "pct", label: "涨跌幅" },
  { key: "chg", label: "涨跌额" },
  { key: "open", label: "今开" },
  { key: "amp", label: "振幅" },
  { key: "amt", label: "成交额" },
];
const cols = reactive<Record<ColKey, boolean>>({ pct: true, price: true, chg: true, open: true, amp: true, amt: true });
function loadCols() {
  try {
    const saved = uni.getStorageSync(COLS_KEY);
    if (saved && typeof saved === "object") {
      (Object.keys(cols) as ColKey[]).forEach((k) => {
        if (typeof saved[k] === "boolean") cols[k] = saved[k];
      });
    }
  } catch (_) {}
}
function toggleCol(k: ColKey) {
  cols[k] = !cols[k];
  try {
    uni.setStorageSync(COLS_KEY, { ...cols });
  } catch (_) {}
}
// ===== 持仓视图列显隐：本地持久化（wl_pos_cols），默认全显；与自选「显示列」共用同一面板 =====
type PosColKey = "sig" | "pct" | "pnl" | "cost" | "price" | "qty";
interface ColDef { key: string; label: string }
const POS_COLS_KEY = "wl_pos_cols";
const posColDefs: ColDef[] = [
  { key: "sig", label: "操作" },
  { key: "pct", label: "收益率" },
  { key: "pnl", label: "盈亏" },
  { key: "cost", label: "成本" },
  { key: "price", label: "现价" },
  { key: "qty", label: "数量" },
];
const posCols = reactive<Record<PosColKey, boolean>>({ sig: true, pct: true, pnl: true, cost: true, price: true, qty: true });
function loadPosCols() {
  try {
    const saved = uni.getStorageSync(POS_COLS_KEY);
    if (saved && typeof saved === "object") {
      (Object.keys(posCols) as PosColKey[]).forEach((k) => {
        if (typeof saved[k] === "boolean") posCols[k] = saved[k];
      });
    }
  } catch (_) {}
}
function togglePosCol(k: PosColKey) {
  posCols[k] = !posCols[k];
  try {
    uni.setStorageSync(POS_COLS_KEY, { ...posCols });
  } catch (_) {}
}
// 「显示列」面板按当前视图选择列集与开关：持仓视图用 posColDefs/posCols，自选视图用 colDefs/cols
const activeColList = computed<ColDef[]>(() => (mainView.value === "pos" ? posColDefs : colDefs));
function activeColOn(key: string): boolean {
  return mainView.value === "pos" ? !!posCols[key as PosColKey] : !!cols[key as ColKey];
}
function toggleActiveCol(key: string) {
  if (mainView.value === "pos") togglePosCol(key as PosColKey);
  else toggleCol(key as ColKey);
}
// 列设置入口：复用底部统一窗体，展开并切到 cols 内容区（标题栏与「我的分组」共用）；
// 再次点击则收起（toggle）
function openCols() {
  if (sheetExpanded.value && activePanel.value === "cols") {
    sheet.value?.collapse();
    return;
  }
  activePanel.value = "cols";
  sheet.value?.expand();
}

// ===== 自定义排序（拖拽手柄） =====
const reorderMode = ref(false);
function toggleReorder() {
  reorderMode.value = !reorderMode.value;
  // 进入整理模式：先捕获「当前可见顺序」(可能正处于列排序态) 作为拖拽基准，
  // 再清除列排序——避免「先点表头排序、再拖拽」时列表跳变、拖拽位置不生效。
  if (reorderMode.value) {
    // 不再自动切分组：「全部」视图现已支持全局拖拽重排（applyGroupOrder("__all__")），
    // 保留当前视图即可，避免点击拖拽图标后列表被过滤而「数据变少」的回归。
    manualOrder.value = renderRows.value.map((r) => keyOf(r.it));
  }
}

// ===== 持仓视图自定义排序（与自选同一套拖拽手柄，scope 区分） =====
const POS_ORDER_KEY = "wl_pos_order";
const posReorderMode = ref(false);
const posManualOrder = ref<string[]>([]); // secid 序列（持仓行重排结果）
function loadPosOrder() {
  try {
    const saved = uni.getStorageSync(POS_ORDER_KEY);
    if (Array.isArray(saved)) posManualOrder.value = saved;
  } catch (_) {}
}
function togglePosReorder() {
  posReorderMode.value = !posReorderMode.value;
  if (posReorderMode.value) {
    manualOrder.value = posRows.value.map((p) => p.secid);
  }
}

// 拖拽顺序缓冲（键序列），仅作用于「当前视图」并与 selectedGroup 强绑定，杜绝跨视图互串。
const manualOrder = ref<string[]>([]);
// manualOrder 所属视图；与 selectedGroup 不一致即视为失效，renderRows 回落默认顺序。
const manualOrderGroup = ref<string | null>(null);
// 渲染行：手动顺序（拖拽结果，仅限当前视图）；未拖拽时回落到 store 的 per-view order / globalOrder。
const renderRows = computed(() => {
  // 仅当 manualOrder 属于「当前视图」时才应用：切换分组后 manualOrderGroup 被置空/不匹配，
  // 直接回落到默认顺序（store 的 per-view order / globalOrder 排序），从根上杜绝顺序互串。
  if (manualOrderGroup.value === selectedGroup.value && manualOrder.value.length) {
    const idx = new Map(manualOrder.value.map((k, i) => [k, i]));
    return rows.value
      .slice()
      .sort((a, b) => {
        const ia = idx.get(keyOf(a.it));
        const ib = idx.get(keyOf(b.it));
        if (ia != null && ib != null) return ia - ib;
        if (ia != null) return -1;
        if (ib != null) return 1;
        return 0;
      });
  }
  return rows.value;
});

// 拖拽状态（整理模式下所有视图——含"全部"——均可拖拽重排）
// 体验关键（消除"果冻感"）：被拖行用 translateY 实时粘住手指，锚点自起拖后恒定不重置；
// 跨过半行阈值时其余行一次性换位（干脆利落），被拖行以「残余位移」补齐视觉位置保持连续。
// 旧实现每次换位重置锚点，被拖行瞬移半行越过手指再被追上，来回弹跳。
const dragKey = ref<string | null>(null);
const dragDy = ref(0); // 被拖行相对其自然槽位的位移(px) = 累计位移 - 已换位行数×行高
const dragStyle = computed(() => ({ transform: `translateY(${dragDy.value}px)` }));
let dragStartY = 0;
let rowHpx = 0;
let dragMoved = false;
let dragFromIdx = 0; // 起拖槽位（原始数组下标，恒定）
let dragScope: "watch" | "pos" = "watch"; // 当前拖拽所属视图（自选 / 持仓）
function dragPtY(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}
// 鼠标拖拽期间把 move/up 挂到 window：行换位后手柄已移走，指针不必停留其上
// （旧实现 mousemove/mouseleave 绑在手柄上，换位即触发 mouseleave 误结束、行弹回）。
function onWinMouseUp() {
  onDragEnd();
}
function bindWinDrag() {
  try {
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onWinMouseUp);
  } catch (_) {}
}
function unbindWinDrag() {
  try {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onWinMouseUp);
  } catch (_) {}
}
onUnmounted(unbindWinDrag);
// 统一拖拽起点：按 scope 用对应视图的展示顺序初始化拖拽缓冲，避免跨视图互串。
function beginDrag(e: any, scope: "watch" | "pos", key: string) {
  dragScope = scope;
  dragKey.value = key;
  dragStartY = dragPtY(e);
  manualOrder.value = scope === "pos" ? posRows.value.map((p) => p.secid) : rows.value.map((r) => keyOf(r.it));
  manualOrderGroup.value = scope === "pos" ? null : selectedGroup.value;
  dragFromIdx = manualOrder.value.indexOf(key);
  dragDy.value = 0;
  dragMoved = false;
  try {
    const info: any = (uni as any).getWindowInfo ? (uni as any).getWindowInfo() : uni.getSystemInfoSync();
    const w = info.windowWidth || 375;
    rowHpx = (w / 750) * 96; // .td 行高 96rpx → px（与热榜 .rk-row min-height:96rpx 对齐）
  } catch (_) {
    rowHpx = 50;
  }
  if (!(e.touches && e.touches.length)) bindWinDrag(); // 鼠标拖拽：监听挂 window（触摸事件始终派发到起拖元素，无需）
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onDragStart(e: any, it: WatchItem) {
  beginDrag(e, "watch", keyOf(it));
}
function onPosDragStart(e: any, p: PosRow) {
  beginDrag(e, "pos", p.secid);
}
function onDragMove(e: any) {
  if (!dragKey.value) return;
  const dy = dragPtY(e) - dragStartY; // 自起拖点的累计位移
  if (Math.abs(dy) > 4) dragMoved = true;
  const arr = manualOrder.value;
  let cur = arr.indexOf(dragKey.value);
  if (cur < 0) return;
  let to = dragFromIdx + Math.round(dy / rowHpx);
  to = Math.max(0, Math.min(arr.length - 1, to));
  if (to !== cur) {
    const next = arr.slice();
    const [m] = next.splice(cur, 1);
    next.splice(to, 0, m);
    manualOrder.value = next;
    cur = to;
  }
  // 残余位移：自然槽位(cur) 已含换位跃迁 ±行高，补齐后被拖行视觉位置连续粘指
  dragDy.value = dy - (cur - dragFromIdx) * rowHpx;
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onDragEnd() {
  if (!dragKey.value) return;
  unbindWinDrag();
  const scope = dragScope;
  dragKey.value = null;
  dragDy.value = 0;
  // 拖拽结束后持久化重排结果：单分组按组内 order 持久化；"全部"视图按全局 order 持久化
  // （applyGroupOrder 内部按 group 是否为 "__all__" 区分两种重排范围）；持仓视图按 secid 序列持久化。
  if (dragMoved) {
    if (scope === "pos") {
      posManualOrder.value = manualOrder.value.slice();
      try {
        uni.setStorageSync(POS_ORDER_KEY, posManualOrder.value);
      } catch (_) {}
    } else {
      applyGroupOrder(selectedGroup.value, manualOrder.value);
    }
  }
}

// ===== iOS 橡皮筋守卫：表格横/纵向滚到边后继续朝外拉，Safari 会把整表往回弹（用户反馈）。
// Safari 16+ 由上面的 overscroll-behavior:none 抑制；旧版 iOS 不支持该 CSS，
// 这里在「对应轴滚到边缘 + 该轴意图明显(|位移|占优)」时 preventDefault 兜底，双保险。
let guardLastX = 0;
let guardLastY = 0;
function wlGuardStart(e: TouchEvent) {
  const t = (e.target as HTMLElement | null);
  if (!(t && t.closest && t.closest(".wl-grid"))) return;
  const p = e.touches[0];
  if (p) {
    guardLastX = p.clientX;
    guardLastY = p.clientY;
  }
}
function wlGuardMove(e: TouchEvent) {
  const tgt = e.target as HTMLElement | null;
  if (!(tgt && tgt.closest && tgt.closest(".wl-grid"))) return;
  const p = e.touches[0];
  if (!p) return;
  const dx = p.clientX - guardLastX;
  const dy = p.clientY - guardLastY;
  guardLastX = p.clientX;
  guardLastY = p.clientY;
  // closest 自内向外：先命中真正滚动着的内层 .uni-scroll-view
  const scroller = tgt.closest(".uni-scroll-view") as HTMLElement | null;
  if (!scroller) return;
  // 仅在对应轴真正可滚动时守卫（内容不溢出时拦默认动作毫无意义，还会误伤另一轴联动）
  const hasH = scroller.scrollWidth > scroller.clientWidth + 1;
  const hasV = scroller.scrollHeight > scroller.clientHeight + 1;
  const outwardH =
    hasH &&
    ((scroller.scrollLeft <= 0 && dx < 0) ||
      (scroller.scrollLeft >= scroller.scrollWidth - scroller.clientWidth - 1 && dx > 0));
  const outwardV =
    hasV &&
    ((scroller.scrollTop <= 0 && dy < 0) ||
      (scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1 && dy > 0));
  const dominantH = Math.abs(dx) > Math.abs(dy);
  if (((outwardH && dominantH) || (outwardV && !dominantH)) && e.cancelable) {
    e.preventDefault();
  }
}
onMounted(() => {
  document.addEventListener("touchstart", wlGuardStart, { passive: true });
  document.addEventListener("touchmove", wlGuardMove, { passive: false });
});
onUnmounted(() => {
  document.removeEventListener("touchstart", wlGuardStart);
  document.removeEventListener("touchmove", wlGuardMove);
});

// 顶部右侧：当前分组名（默认「全部」）+ 当前分组内实时涨/跌个股个数（随行情刷新）。
// 自选 / 持仓共用同一枚胶囊，故统计源随视图切换（始终等于胶囊下方正在渲染的那张表），
// 口径统一为「当日涨跌额 chg 的正负」，不掺入持仓盈亏，避免两页含义分叉。
const upDown = computed(() => {
  const g = selectedGroup.value;
  // "" = 默认分组（与「全部」是两回事，胶囊上必须区分开）
  const currentGroup = g === "__all__" ? "全部" : g || "默认分组";
  let up = 0;
  let down = 0;
  if (mainView.value === "pos") {
    for (const r of posRows.value) {
      if (r.loading) continue;
      if (r.chg > 0) up++;
      else if (r.chg < 0) down++;
    }
  } else {
    for (const r of rows.value) {
      if (r.q.loading) continue;
      if (r.q.chg > 0) up++;
      else if (r.q.chg < 0) down++;
    }
  }
  return { currentGroup, counts: { up, down } };
});

// 表格数值列配色：缺失/加载中 → 灰色(st-flat，仅用于 "--" 占位)；真实 0 涨跌 →
// 不加涨跌色（回落到 .st-num 的 --text 黑色，与行情页全球指数面板 0% 中性色一致）；
// 仅当价格/涨跌幅/涨跌额均有值且 chg 非零时才显示红/绿。
function pctCls(q: Snap): string {
  if (q.loading || q.price == null || q.pct == null || q.chg == null) return "st-flat";
  const t = trendCls(q.chg);
  return t === "up" ? "st-up" : t === "down" ? "st-down" : "";
}
// 持仓表格数值列配色：直接返回带 st- 前缀的类名（与 .st-up/.st-down/.st-flat 对齐），
// 修复此前用裸 trendCls（up/down/flat）导致持仓表不上色的 bug；缺失/零值回落灰色。
function stTrend(v: number | null | undefined): string {
  const t = trendCls(v);
  return t === "up" ? "st-up" : t === "down" ? "st-down" : "st-flat";
}
// 振幅%（(最高-最低)/昨收）
function ampPct(q: Snap): string {
  if (q.loading || !q.preClose || q.preClose === 0 || q.high == null || q.low == null) return "--";
  return (((q.high - q.low) / q.preClose) * 100).toFixed(2) + "%";
}

// 榜单弹层：点击热榜股票跳转行情页并收起弹层
function onSheetOpenMarket(p: { code: string; market: string }) {
  sheet.value?.collapse();
  emit("open-market", p);
}

onMounted(() => {
  loadCols();
  loadPosCols();
  loadPosOrder();
  if (!needLogin.value) loadQuotesSafe();
  loadPeek();
  preloadRank("today"); // 预加载今日热榜：展开榜单面板零等待（与 RankView 共用同一装载代码）
  // 已登录时以云端持仓簿为准重铺本地缓存（跨设备 / 刷新后图标与盈亏收口到真实数据）
  if (userState.loggedIn) hydrateCloudPositions();
  scanPositionSignals(); // 持仓信号巡检：进入自选页即检测一次
});
onActivated(() => {
  loadQuotesSafe();
  startPolling();
  loadPeek(); // 回到本页即刷新「今日最热」预览，避免展示过期的空态
  preloadRank("today"); // 切回本页同样预热（preloadRank 内置 60s 节流）
  // onDeactivated 已停提醒对齐：回页后须重启，否则窗口内的异动提醒不再展示
  if (anomalyList.value.length > 0) startAnomSync();
  scanPositionSignals(); // 回页再巡检一次（kline 缓存命中，开销可忽略）
});
onDeactivated(stopPolling);
onDeactivated(stopAnomSync);
onUnmounted(() => {
  stopPolling();
  stopAnomSync();
});
watch(
  () => userState.loggedIn,
  (li) => {
    if (li) {
      // 登录后以云端持仓簿为准重铺本地缓存（含跨设备恢复），并巡检信号
      hydrateCloudPositions().then(() => scanPositionSignals());
      loadQuotesSafe();
      startPolling();
    } else {
      stopPolling();
    }
  }
);
watch(
  () => list.value.map(keyOf).join(","),
  () => loadQuotesSafe()
);

// ===== 自选股表格交互：点击行打开个股；长按行弹出操作菜单（删除/移分组/预警） =====
function onItemClick(it: WatchItem) {
  if (reorderMode.value) return; // 整理顺序模式下禁用点击跳转
  if (lpFired) {
    lpFired = false; // 长按已触发菜单，抑制随后冒泡的 click，避免误开个股
    return;
  }
  emit("open-market", { code: it.code, market: it.market });
}

// 自定义长按检测：手指/指针按下启动计时，移动超过阈值即取消（左/右拖拽横滑滚动时
// 会触发移动，从而不会误判为长按），解决「拖拽滚动误触发长按」的手势冲突。
let lpTimer: any = null;
let lpStartX = 0;
let lpStartY = 0;
let lpFired = false;
const LP_MS = 500;
const LP_MOVE = 10;
function pressPt(e: any): { x: number; y: number } {
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (t) return { x: t.clientX, y: t.clientY };
  return { x: e.clientX || 0, y: e.clientY || 0 };
}
function onRowPressStart(it: WatchItem, e: any) {
  if (reorderMode.value) return; // 整理模式下禁用长按菜单（拖拽手柄另行处理）
  lpFired = false;
  const p = pressPt(e);
  lpStartX = p.x;
  lpStartY = p.y;
  if (lpTimer != null) clearTimeout(lpTimer);
  const target = it;
  lpTimer = setTimeout(() => {
    lpFired = true;
    onRowLongPress(target);
  }, LP_MS);
}
function onRowPressMove(e: any) {
  if (lpTimer == null) return;
  const p = pressPt(e);
  if (Math.abs(p.x - lpStartX) > LP_MOVE || Math.abs(p.y - lpStartY) > LP_MOVE) {
    clearTimeout(lpTimer);
    lpTimer = null;
  }
}
function onRowPressEnd() {
  if (lpTimer != null) {
    clearTimeout(lpTimer);
    lpTimer = null;
  }
}

function doRemove(it: WatchItem) {
  removeWatch(it.code, it.market);
  uni.showToast({ title: "已移除", icon: "none" });
}

// 长按行：统一进入 PeekSheet 的 actions 面板（与「我的分组」「显示列」同窗体），不再使用独立 ActionSheet
function onRowLongPress(it: WatchItem) {
  lpItem.value = it;
  activePanel.value = "actions";
  sheet.value?.expand();
}

// 长按菜单「设置持仓」：共享 PositionForm 弹窗，按 lpItem 的 secid 现读/写入 costBasis。
// 保存/清除即刷新行情（成本变化 → 收益率/盈亏列即时重算），与行情页设置持仓全链路同步
const posFormRef = ref<any>(null);
const lpSecid = computed(() => {
  const it = lpItem.value;
  if (!it) return "";
  return (resolveSecid(it.code, it.market as any) as string) || "";
});
function openPosForm() {
  if (!lpSecid.value) return;
  posFormRef.value?.open();
}
async function saveLpPosition(p: Position) {
  if (!lpSecid.value) return;
  setPosition(lpSecid.value, p);
  // 已登录：同步写回云端持仓簿（以 code 为主键 upsert），刷新/换设备后仍可恢复
  if (userState.loggedIn) {
    const it = lpItem.value ?? list.value.find((x) => resolveSecid(x.code, x.market as any) === lpSecid.value);
    await saveHolding({
      code: lpSecid.value.split(".")[1] || lpSecid.value,
      name: it?.name || lpSecid.value.split(".")[1] || "",
      cost: p.cost,
      shares: p.qty ?? 0,
    });
  }
  lpItem.value = null;
  loadQuotesSafe();
  scanPositionSignals();
  uni.showToast({ title: "持仓已保存", icon: "none" });
}
async function clearLpPosition() {
  if (!lpSecid.value) return;
  clearPosition(lpSecid.value);
  // 已登录：同步删除云端持仓簿对应行
  if (userState.loggedIn) {
    await dropHolding(lpSecid.value.split(".")[1] || lpSecid.value);
  }
  lpItem.value = null;
  loadQuotesSafe();
  scanPositionSignals();
  uni.showToast({ title: "已清除持仓", icon: "none" });
}
// 价格预警：实时价参考（进入面板即拉取最新成交价）+ 选项下方内联输入（替代原 uni-modal 弹窗）
const alertRT = ref<SnapResult | null>(null);
const alertEdit = ref<"above" | "below" | null>(null);
const alertInput = ref<string>("");
// 当前已设阈值（响应式读取长按目标股，保存后随 lpItem 同步刷新）
const aboveVal = computed(() => lpItem.value?.alerts?.above ?? null);
const belowVal = computed(() => lpItem.value?.alerts?.below ?? null);

// 长按菜单「编辑价格预警」：进入 alert 子面板并实时拉取当前价
async function loadAlertRT() {
  const it = lpItem.value;
  if (!it) return;
  try {
    const secid = resolveSecid(it.code, it.market as any);
    alertRT.value = await fetchSnapshot(secid); // 实时成交价，缓存 20s，确保为最新
  } catch {
    alertRT.value = null;
  }
}
function openAlertPanel() {
  if (!lpItem.value) return;
  activePanel.value = "alert";
  alertEdit.value = null;
  alertRT.value = null;
  loadAlertRT();
}
// 点击「设置高于/低于预警」：在选项下方动态展开内联输入框（再次点击收起）
function startEdit(dir: "above" | "below") {
  alertEdit.value = alertEdit.value === dir ? null : dir;
  const cur = dir === "above" ? aboveVal.value : belowVal.value;
  alertInput.value = cur != null ? String(cur) : "";
}
// 保存阈值：解析输入并写回；同时刷新本地 lpItem 使已设值即时回显
function saveAlert(dir: "above" | "below") {
  const it = lpItem.value;
  if (!it) return;
  const a = it.alerts || {};
  const v = parseFloat(alertInput.value);
  const next: PriceAlert = { ...a };
  next[dir] = isFinite(v) ? v : null;
  const merged = next.above == null && next.below == null ? undefined : next;
  setAlerts(it.code, it.market, merged);
  lpItem.value = { ...it, alerts: merged };
  // 设置后即时重算命中态：若当前价已满足阈值，该行立即开始提示（与清除行为对称）
  refreshAlertHits();
  alertEdit.value = null;
  uni.showToast({ title: "已保存", icon: "none" });
}
// 清除预警：直接生效并即时回显
function clearAlert() {
  const it = lpItem.value;
  if (!it) return;
  setAlerts(it.code, it.market, undefined);
  lpItem.value = { ...it, alerts: undefined };
  // 清除后即时重算命中态：store 内存 alerts 已清空 → 该行不再进入命中集合，闪烁立即停止
  // （无需等待下一次行情轮询 / 云端往返，修复「清除了预警还在闪烁」的问题）
  refreshAlertHits();
  alertEdit.value = null;
  uni.showToast({ title: "已清除预警", icon: "none" });
}
// 长按菜单「移入分组」：复用「我的分组」面板的移入流程（已选定目标股，直接进入选择目标分组步骤）
function openMoveFromSheet() {
  const it = lpItem.value;
  if (!it) return;
  moveStock.value = it;
  moveNew.value = false;
  moveNewName.value = "";
  groupView.value = "move";
  activePanel.value = "group";
}
// 长按菜单「删除自选」：移除后直接收起底部面板（collapse 会复位 activePanel / lpItem / sheetExpanded），
// 否则删除后 actions 面板仍停留在已删除的个股上，看起来「没关掉」。
function removeLp() {
  if (!lpItem.value) return;
  doRemove(lpItem.value);
  sheet.value?.collapse();
}
</script>

<style scoped>
@import "../styles/stock-table.css";
/* 页面 = 顶部固定头部 + 可滚动内容区（flex 纵向布局，头部天然不随滚动） */
.wl-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.wl {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 内容区底边精确落在「今日最热」卡片顶沿：卡片固定位于菜单栏上方，
     距视口底 = 菜单栏110rpx + 卡片76rpx + 安全区 = 186rpx+safe。
     这样表格(scroll-view) 高度 = 顶栏底 → 卡片顶，末行紧贴卡片、无预留空白。 */
  padding: 0 0 calc(env(safe-area-inset-bottom) + 186rpx);
}

/* ===== 头部（固定不随滚动；与社区 CommunityView 视觉一致，外壳已迁出至 PageHeader.vue） ===== */
/* 实时涨/跌个股数：并入分组按钮，故去独立背景，仅以细分隔线区分于分组名 */
.ud-pill {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-left: 4rpx;
  padding-left: 12rpx;
  border-left: 1rpx solid var(--border);
}
.ud-item {
  display: flex;
  align-items: center;
  gap: 4rpx;
}
.ud-num {
  font-size: var(--font-md); /* 与分组面板 .grp-label 字号一致（28rpx） */
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.ud-num.up {
  color: var(--up);
}
.ud-num.down {
  color: var(--down);
}
.ud-num.flat {
  color: var(--text-2);
}
/* 「分组 / 我的」胶囊：与社区共用视觉；头像 48rpx + 字 26rpx 与新顶部栏协调 */
.cm-me {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 6rpx 18rpx 6rpx 6rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
}
.cm-avatar {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  overflow: hidden;
  flex: none;
  /* flex-center 已提升至全局 .flex-center */
}
.cm-name {
  font-size: var(--font-md); /* 与分组面板 .grp-label 字号一致（28rpx） */
  font-weight: 400;
  color: var(--text);
  max-width: 140rpx;
  /* 截断属性已提升至全局 .truncate */
}

/* ===== 价格预警命中：对应行闪烁提示（替代原横幅卡片） =====
   up = 突破阈值（红/涨），down = 跌破阈值（绿/跌），与 A 股配色一致。
   - 左侧常驻一道彩色竖条，便于一眼定位预警行；
   - 整行覆盖一层柔和脉冲底色（::after 置于置顶且穿透点击，含固定名称列），呼吸式提示不刺眼。 */
.tr.alert-up,
.tr.alert-down {
  position: relative;
}
.tr.alert-up::before,
.tr.alert-down::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6rpx;
  z-index: 3;
  pointer-events: none;
}
.tr.alert-up::before {
  background: var(--up);
}
.tr.alert-down::before {
  background: var(--down);
}
.tr.alert-up::after,
.tr.alert-down::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  animation: rowTint 1.9s ease-in-out infinite;
}
.tr.alert-up::after {
  background: rgba(255, 59, 48, 0.12);
}
.tr.alert-down::after {
  background: rgba(7, 193, 96, 0.12);
}
@keyframes rowTint {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

/* ===== 持仓信号提醒卡 ===== */
.pos-alert {
  margin: 0 24rpx 16rpx;
  padding: 16rpx 20rpx;
  background: var(--card);
  border: 1rpx solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.pa-head {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 10rpx;
}
.pa-title {
  flex: 1;
  font-size: var(--font-sm);
  color: var(--text);
}
.pa-close {
  flex: none;
  padding: 6rpx;
}
.pa-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 12rpx 4rpx;
  border-top: 1rpx solid var(--border);
}
.pa-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--text);
}
.pa-lv {
  flex: none;
  font-size: var(--font-xs);
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
}
.pa-lv.buy {
  color: var(--up);
  background: rgba(239, 35, 42, 0.12);
}
.pa-lv.sell {
  color: var(--down);
  background: rgba(9, 176, 122, 0.12);
}
.pa-meta {
  flex: none;
  font-size: var(--font-xs);
  color: var(--text-2);
}
/* 预警命中列表的盈亏百分比：trendCls 返回 up/down/flat，需显式着色 */
.pa-meta.up { color: var(--up); }
.pa-meta.down { color: var(--down); }
.pa-meta.flat { color: var(--text-2); }

/* ===== 空态 ===== */
.empty-wrap {
  padding: 40rpx 24rpx 0;
}
.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 56rpx 40rpx;
  margin: 0 12rpx;
}
.empty-ic {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: var(--primary-soft);
  margin-bottom: 6rpx;
  /* flex-center 已提升至全局 .flex-center */
}
/* 全局 .empty-s 已含字号/颜色/居中，此处仅补页面特有内距 */
.empty-s { padding: 0 20rpx; }
.empty-btn {
  margin-top: 18rpx;
  padding: 0 56rpx;
}

/* ===== 自选股表格：全屏铺满 + 固定表头 + 名称列固定(横滑不丢) + 横向滚动 ===== */
.wl-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: var(--bg-2);
}
/* 横/纵向到边均不再橡皮筋：真正滚动的是 uni-scroll-view 内层元素，overscroll-behavior 必须打在它上
   （Safari 16+ 生效；更旧 iOS 由下方 JS 边缘守卫兜底） */
.wl-grid :deep(.uni-scroll-view) {
  overscroll-behavior: none;
}
/* 表格外层：相对定位容器，承载滚动表格 + 列控制浮层；列控制按钮已移出 scroll-x 容器 */
.wl-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 排序/列设置控制按钮浮层：脱离 scroll-x 滚动容器，固定在名称列固定表头左上角，
   杜绝横滑 scroll-view 吞掉点击（openCols 与 openGroups 同机制，后者在 scroll-view 外即可正常弹出） */
.wl-cols-overlay {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 30;
  width: 200rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  padding: 0 16rpx 0 18rpx;
  background: var(--bg-2);
  pointer-events: none;
}
.wl-cols-overlay .th-ic {
  pointer-events: auto;
}
/* scroll-view 真实内容容器：H5 下为 .uni-scroll-view-content，组件默认 height:100%。
   这里改 height:auto + min-height:100% 并设为纵向 flex：
   - 内容不足一屏：容器撑满视口高，数据行从顶部依次排列，空白自然落在末行与底部卡片之间；
   - 内容超一屏：容器随内容增高，由外层 scroll-view 滚动，滚到底时末行停在卡片上方。 */
.wl-grid :deep(.uni-scroll-view-content) {
  height: auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.wl-thead,
.tr {
  flex: none;
  display: flex;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
}
/* 行容器：填满内容区高度，使滚动区域高度稳定 */
.wl-rows {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 数据行包裹层：占据表头以下、卡片顶沿以上的全部空间；行从顶部依次排列，
   不足一屏时空白自然落在末行下方（不再把首行顶到容器底部）。 */
.wl-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 表头：实色背景（--bg-2 是 #ffffff/暗主题 #0a1322，纯色而非透明），保证清晰对比 */
.wl-thead {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg-2);
  /* 表头上下边框，样式与底部今日最热卡片边框一致（1rpx solid var(--border)） */
  border-top: 1rpx solid var(--border);
  border-bottom: 1rpx solid var(--border);
}
.th {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 72rpx;
  padding: 0 16rpx;
  /* 表头统一规范（与热榜榜单表头 .rk-thead .rh 共用同一套 token）：
     font-md(28rpx) / 400 / --text-2 —— 字号比正文大一号、颜色用次级文本(淡一点)，全站表格表头保持一致 */
  font-size: var(--font-md);
  font-weight: 400;
  color: var(--text-2);
  text-align: right;
  cursor: pointer;
  position: relative;
}
/* 表头名称列：与数据列同为固定列（左上角最高层级），背景同数据行；左内边距与顶部栏一致(18rpx) */
.th.c-name {
  justify-content: flex-start;
  text-align: left;
  position: sticky;
  left: 0;
  z-index: 6;
  background: var(--bg-2);
  padding: 0 16rpx 0 18rpx;
}
/* 表头标签：不参与排序，无点击选中态（label 仅只读文本） */
.th-label {
  white-space: nowrap;
  letter-spacing: 0.5rpx;
}
.tr {
  background: var(--bg-2);
}
.tr:active {
  background: var(--card-2);
}
.tr:active .c-name {
  background: var(--card-2);
}
.td {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4rpx;
  min-height: 96rpx;
  padding: 0 18rpx;
  overflow: hidden;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
/* 固定名称列：横向滚动时始终可见 + 内容左对齐；左padding与顶部栏一致(18rpx) */
.c-name {
  position: sticky;
  left: 0;
  z-index: 2;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 6rpx;
  width: 160rpx;
  padding: 0 10rpx 0 18rpx;
  text-align: left;
  background: var(--bg-2);
}
/* 列宽（合计 > 屏宽 → 横向滚动）。最新价/涨跌幅/涨跌额/今开/振幅 五列严格等宽(150rpx) */
.c-pct  { width: 150rpx; }
.c-price { width: 150rpx; }
.c-chg  { width: 150rpx; }
.c-open { width: 150rpx; }
.c-amp  { width: 150rpx; }
.c-amt  { width: 200rpx; }
/* 持仓表格复用自选表格体系，新增列（操作/收益率/盈亏/成本/现价/数量）沿用 150rpx 等宽规范 */
.c-sig  { width: 150rpx; }
.c-pnl  { width: 150rpx; }
.c-cost { width: 150rpx; }
.c-qty  { width: 150rpx; }
/* 名称列内部 */
.t-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  min-width: 0;
}
.t-name {
  font-size: var(--font-md);
  font-weight: 400;
  color: var(--text);
  max-width: 144rpx;
  line-height: 1.25;
  /* 截断属性已提升至全局 .truncate */
}
.t-sub {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin-top: 4rpx;
}
.t-mkt {
  flex: none;
  /* 布局属性已提升至全局 .mkt-label */
}
.t-code {
  font-size: var(--font-xs);
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  max-width: 80rpx;
  /* 截断属性已提升至全局 .truncate */
}
/* ===== 分组切换面板：与「头像设置」BottomSheet 头部共用同一套 .panel-head 样式 ===== */
/* grp-head 直接复用全局 .panel-head（padding 6rpx 28rpx 16rpx + 下框线），
   与 .bs-head 完全一致：居中标题 + 相同头部高度(72rpx)，消除重复多写一套样式。
   标题排版复用全局 .sheet-title（font-md / 500 / text-2）：容器内普通流式文本，
   由 .panel-head 的 align-items/justify-content 居中。原左上角返回按钮(grp-back)已移除
   ——各面板均一步可达，收起窗体即复位（onSheetCollapse），与其它展开页保持一致的无返回样式。 */
.grp-head {
  justify-content: center;
  height: 72rpx;
}
.grp-body {
  flex: 1;
  min-height: 0;
  padding: 6rpx 0;
}
/* scroll-view 真实内容容器：H5 下为 .uni-scroll-view-content，组件默认 height:100%。
   改用 height:auto：内容不足一屏时（如仅一个「分组名」输入框）容器按内容高度撑开，
   由外层 scroll-view 在真正溢出时才滚动，避免内容很少却仍出现滚动条的视觉问题；
   内容超一屏时容器随内容增高，正常滚动。与 .wl-grid 同款修复保持一致。 */
.grp-body :deep(.uni-scroll-view-content) {
  height: auto;
}
.grp-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-height: 88rpx;
  padding: 0 26rpx;
  cursor: pointer;
  transition: background 0.12s ease;
}
.grp-item:active,
.grp-item-hover {
  background: var(--card-2);
}
/* 我的分组列表：仅此区块底部保留一条分隔线，其余边框全部取消 */
.grp-section {
  border-bottom: 1rpx solid var(--border);
}
.grp-list {
  padding: 6rpx 0;
}
.grp-label {
  flex: 1;
  font-size: var(--font-md);
  color: var(--text);
}
.grp-label.danger {
  color: #ff3b30;
}
.grp-item.active .grp-label {
  color: var(--primary);
}
/* 价格预警：实时价参考条 */
.alert-rt {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  padding: 14rpx 26rpx;
  margin: 4rpx 20rpx 10rpx;
  background: var(--card-2);
  border-radius: 14rpx;
}
.alert-rt-label {
  font-size: var(--font-sm);
  color: var(--text-2);
}
.alert-rt-price {
  font-size: var(--font-lg);
  color: var(--text);
}
.alert-rt-price.up { color: var(--up); }
.alert-rt-price.down { color: var(--down); }
.alert-rt-price.flat { color: var(--text); }
.alert-rt-sub {
  margin-left: auto;
  font-size: var(--font-sm);
  color: var(--text-3);
}
.alert-rt-sub.up { color: var(--up); }
.alert-rt-sub.down { color: var(--down); }
.alert-rt-sub.flat { color: var(--text-3); }
/* 已设阈值回显（选项标题内联） */
.alert-cur {
  color: var(--text-2);
  font-size: var(--font-sm);
}
/* 选项下方动态内联输入区（替代原 uni-modal 弹窗） */
.alert-edit {
  padding: 0 26rpx 16rpx;
}
.alert-input {
  height: 84rpx;
  padding: 0 20rpx;
  background: var(--card-2);
  border-radius: 14rpx;
  font-size: var(--font-md);
  color: var(--text);
}
.alert-edit-btns {
  display: flex;
  gap: 16rpx;
  margin-top: 14rpx;
}
/* 文本输入框（新建 / 重命名 / 移动内联新建） */
.grp-input {
  height: 84rpx;
  margin: 16rpx 26rpx;
  padding: 0 20rpx;
  background: var(--card-2);
  border-radius: 14rpx;
  font-size: var(--font-md);
  color: var(--text);
}
/* 底部操作条（取消 / 确定等）：无边框线，纯间距区分 */
.grp-foot {
  flex: none;
  display: flex;
  gap: 16rpx;
  padding: 16rpx 26rpx calc(env(safe-area-inset-bottom) + 16rpx);
}
.grp-btn {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  border-radius: 999rpx;
  font-size: var(--font-md);
  /* 幽灵按钮：描边 + 主色字，与绿色 primary 按钮视觉协调，比灰底更有品质感 */
  color: var(--primary);
  background: transparent;
  border: 2rpx solid var(--primary);
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, opacity 0.12s ease;
}
.grp-btn:active {
  background: rgba(7, 193, 96, 0.08);
}
.grp-btn.primary {
  color: #fff;
  background: var(--primary);
  border-color: var(--primary);
}
.grp-btn.primary:active {
  background: var(--primary-dark, #06a752);
  border-color: var(--primary-dark, #06a752);
}
.grp-btn.danger {
  color: var(--danger);
  background: transparent;
  border: 2rpx solid var(--danger);
}
.grp-btn.danger:active {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}

/* ===== 展开态：榜单面板（外壳与拖拽手柄由 PeekSheet 统一提供） ===== */
.rs-tabs {
  position: relative;
  flex: none;
  display: flex;
  padding: 6rpx 24rpx 8rpx;
  border-bottom: 1rpx solid var(--border);
}
.rs-tab {
  flex: 1;
  text-align: center;
  font-size: var(--font-md);
  color: var(--text-2);
  padding: 2rpx 0;
  cursor: pointer;
  transition: color 0.2s ease;
}
.rs-tab.on {
  color: var(--primary);
}
.rs-ink {
  position: absolute;
  left: 24rpx;
  bottom: -1rpx;
  width: calc(50% - 24rpx);
  display: flex;
  justify-content: center;
  transition: transform 0.28s var(--ease-out);
}
.rs-ink.right {
  transform: translateX(100%);
}
.rs-ink-bar {
  width: 46rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: var(--primary);
}
.rs-body {
  flex: 1;
  min-height: 0;
  padding: 4rpx 0 0;
}
/* 弹窗内 scroll-view 内容铺满高度并竖向排列，使榜单 loading 在弹窗区域内垂直居中 */
.rs-body :deep(.uni-scroll-view-content) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ===== 名称表头工具图标（拖拽 / 列设置：共用灰底轨道，各自为独立分段，点击高亮对应一侧） ===== */
.th-cols {
  display: inline-flex;
  align-items: center;
  gap: 2rpx;
  margin-left: 6rpx;
  padding: 2rpx;
  border-radius: 8rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  transition: background 0.18s ease, border-color 0.18s ease;
}
/* 激活态：拖拽排序中 或 列设置面板打开时，整条轨道泛绿，提示当前所处工具模式 */
.th-cols.on {
  background: var(--primary-soft);
  border-color: var(--primary-soft);
}
.th-ic {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  border-radius: 6rpx;
  cursor: pointer;
  transition: background 0.18s ease, box-shadow 0.18s ease;
}
/* 按下：该侧抬起为高亮分段（浅浮起 + 主色图标），仅高亮被点击的一侧 */
.th-ic:active {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--shadow-primary-1);
}
.th-ic:active :deep(.outline-icon) {
  color: var(--primary) !important;
}
/* 当前激活的分段（拖拽排序中 / 列设置面板打开）：常驻绿色实心、图标反白，
   两个分段共用同一套高亮，确保两种工具在视觉表现上完全对齐 */
.th-cols.on .th-ic.on {
  background: var(--primary);
}
.th-cols.on .th-ic.on :deep(.outline-icon) {
  color: #fff !important;
}

/* ===== 行内拖动手柄（常驻，仅单分组视图显示） ===== */
.drag-handle {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 56rpx;
  margin-left: -6rpx;
  cursor: grab;
  touch-action: none;
}
.drag-handle:active {
  cursor: grabbing;
}
.tr.reordering .td {
  cursor: grabbing;
}
.tr.dragging {
  background: var(--primary-soft);
  /* 被拖行"浮起"：跟随手指的 translateY 由内联样式逐帧驱动，这里禁止任何 transform 过渡，
     否则每次换位补位移会与过渡叠加产生回弹（果冻感）；阴影/层级给出抬升反馈 */
  position: relative;
  z-index: 6;
  box-shadow: var(--shadow-2);
  transition: box-shadow 0.15s ease;
}
.tr.dragging .c-name {
  background: var(--primary-soft);
}

/* ===== 列设置面板（与热榜/分组同款统一窗体 PeekSheet，无遮罩；标题栏复用 .grp-head/.sheet-title） ===== */
.col-list {
  margin-top: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.col-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-height: 88rpx;
  padding: 0 26rpx;
  cursor: pointer;
  transition: background 0.12s ease;
}
.col-item:active {
  background: var(--card-2);
}
.col-item.off {
  opacity: 0.55;
}
.col-name {
  flex: 1;
  font-size: var(--font-md);
  color: var(--text);
}
.col-sw {
  position: relative;
  width: 80rpx;
  height: 44rpx;
  border-radius: 999rpx;
  background: var(--border);
  transition: background 0.2s ease;
}
.col-sw.on {
  background: var(--primary);
}
.col-knob {
  position: absolute;
  top: 4rpx;
  left: 4rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}
.col-sw.on .col-knob {
  transform: translateX(36rpx);
}
.col-tip {
  margin-top: 16rpx;
  font-size: var(--font-xs);
  color: var(--text-3);
  text-align: center;
}

/* ===== 今日异动：类型标签 + 扁平列表（与列设置/分组面板同一设计语言） ===== */
/* 类型标签：统一字号胶囊，涨红/跌绿/放量橙（ANOMALY_META.cls 复用全局涨跌配色） */
.anom-tag {
  flex: none;
  font-size: var(--font-sm);
  line-height: 1;
  padding: 5rpx 12rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  color: var(--text-2);
  white-space: nowrap;
}
.anom-tag.up {
  background: rgba(239, 35, 42, 0.12);
  color: var(--up);
}
.anom-tag.down {
  background: rgba(9, 176, 122, 0.12);
  color: var(--down);
}
.anom-tag.warn {
  background: rgba(255, 153, 0, 0.14);
  color: #e6930a;
}
/* 列表内标签：字号与股票名称一致（底部卡片用全局 --font-sm） */
.anom-item .anom-tag {
  font-size: var(--font-md);
  padding: 6rpx 14rpx;
}

.anom-body {
  flex: 1;
  min-height: 0;
  padding: 4rpx 0 16rpx;
}
/* 扁平行：全宽、无边框、按压泛灰（同 col-item/grp-item）。统一字号 */
.anom-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-height: 88rpx;
  padding: 0 26rpx;
  cursor: pointer;
  transition: background 0.12s ease;
}
.anom-item-hover {
  background: var(--card-2);
}
.anom-name {
  flex: 0 1 auto;
  min-width: 0;
  font-size: var(--font-md);
  color: var(--text);
}
.anom-code {
  flex: none;
  font-size: var(--font-md);
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.anom-nums {
  flex: none;
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 10rpx;
  font-variant-numeric: tabular-nums;
}
.anom-price {
  font-size: var(--font-md);
}
.anom-pct {
  font-size: var(--font-md);
}
.anom-time {
  flex: none;
  margin-left: 6rpx;
  font-size: var(--font-md);
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
/* 涨跌配色：涨=红(--up) / 跌=绿(--down)，平盘不着色 */
.anom-price.up,
.anom-pct.up { color: var(--up); }
.anom-price.down,
.anom-pct.down { color: var(--down); }
.anom-empty {
  padding: 60rpx 0;
  text-align: center;
  color: var(--text-3);
  font-size: var(--font-md);
}

/* ===== 持仓视图 ===== */
.pos-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 持仓表格已完全复用自选表格 .wl-grid 体系（.wl-thead/.tr/.td/.c-name/.act-chip），
   原 .pos-table/.pos-thead/.pos-row/.pos-cell-* 等 bespoke 死样式已移除，避免样式与自选页不一致。 */
/* 操作标签（持仓表「操作」列）：小圆角方块，配色与行情页信号卡（ReportView .signal-card）
   完全同源——cls 用引擎档位，色值一一对应（buy红/sell绿/hold蓝/watch橙/wait中性），
   标签文字仍是持仓感知的动作（加仓/持有/减仓），跨页面视觉语义统一 */
.act-chip {
  display: inline-flex;
  align-items: center;
  height: 40rpx;
  padding: 0 14rpx;
  border-radius: 8rpx;
  font-size: var(--font-sm);
  line-height: 1;
  white-space: nowrap;
  background: var(--card-2);
  color: var(--text-2);
}
.act-chip.buy {
  color: var(--up);
  background: rgba(239, 35, 42, 0.1);
}
.act-chip.sell {
  color: var(--down);
  background: rgba(9, 176, 122, 0.12);
}
.act-chip.hold {
  color: #2563eb;
  background: rgba(59, 130, 246, 0.1);
}
.act-chip.watch {
  color: #c87f00;
  background: rgba(255, 159, 28, 0.12);
}
.act-chip.wait {
  color: var(--text-3);
  background: var(--card-2);
}

/* 持仓汇总面板：复用 global.css 的 .tile-grid/.idx-item 指标卡家族（与行情页指数面板同款），
   本地仅补面板内边距（与 grp-tip 等内容区的 26rpx 边距约定一致） */
.possum-grid {
  padding: 6rpx 26rpx 0;
}
.grp-tip {
  display: block;
  margin: 18rpx 26rpx 6rpx;
  font-size: var(--font-xs);
  color: var(--text-3);
  line-height: 1.5;
}
</style>