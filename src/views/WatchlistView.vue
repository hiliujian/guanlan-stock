<template>
  <view class="wl-page">
    <!-- 头部：与社区共用 PageHeader，移出 scroll-view 以保证 H5 上始终吸顶 -->
    <PageHeader brand-text="自选" brand-icon="star">
      <template #right>
        <view class="cm-me" role="button" aria-label="分组切换" @click="openGroups">
          <view class="cm-avatar flex-center" style="background: linear-gradient(135deg, var(--primary), var(--primary-dark, #06a050));">
            <OutlineIcon type="layers" :size="24" color="#fff" />
          </view>
          <text class="cm-name truncate">{{ upDown.currentGroup }}</text>
          <!-- 当前分组内实时涨/跌个数（随行情实时刷新）：并入分组按钮，避免割裂 -->
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
      <BackgroundFX />

        <!-- 价格预警：命中行在自选表格内闪烁红/绿提示（见 .tr.alert-up/.alert-down），
             不再使用独立横幅卡片；清除预警请在长按菜单「编辑价格预警」中操作。 -->

        <!-- 空态 -->
        <view v-if="!list.length" class="empty-wrap anim-fade-up">
          <view class="empty-card glass">
            <view class="empty-ic flex-center">
              <OutlineIcon type="star" :size="60" color="var(--primary)" />
            </view>
            <text class="empty-title">还没有自选股</text>
            <text class="empty-s">在「行情」页搜索分析后点击星标加入自选，实时价格与价格预警将同步展示在这里。</text>
            <button class="btn-primary empty-btn" @click="goPickMarket">去行情页选股</button>
          </view>
        </view>

        <!-- 自选股表格：全屏铺满 + 固定表头 + 名称列固定(横滑不丢) + 横向滚动 -->
        <scroll-view v-if="rows.length" class="wl-grid" scroll-x scroll-y>
          <view class="wl-rows">
          <view class="wl-thead">
            <view class="th c-name">
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
            <view v-if="cols.price" class="th c-price" :class="{ active: sortKey === 'price' }" @click="toggleSort('price')">
              <text class="th-label">最新价</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'price' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'price' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.pct" class="th c-pct" :class="{ active: sortKey === 'pct' }" @click="toggleSort('pct')">
              <text class="th-label">涨跌幅</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'pct' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'pct' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.chg" class="th c-chg" :class="{ active: sortKey === 'chg' }" @click="toggleSort('chg')">
              <text class="th-label">涨跌额</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'chg' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'chg' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.open" class="th c-open" :class="{ active: sortKey === 'open' }" @click="toggleSort('open')">
              <text class="th-label">今开</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'open' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'open' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.amp" class="th c-amp" :class="{ active: sortKey === 'amp' }" @click="toggleSort('amp')">
              <text class="th-label">振幅</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'amp' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'amp' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.amt" class="th c-amt" :class="{ active: sortKey === 'amt' }" @click="toggleSort('amt')">
              <text class="th-label">成交额</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'amt' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'amt' && sortDir === 'desc' }" />
              </view>
            </view>
          </view>
          <view class="wl-body">
          <view
            v-for="row in renderRows"
            :key="row.it.code + row.it.market"
            class="tr"
            :class="{ reordering: reorderMode, dragging: dragKey === keyOf(row.it), 'alert-up': alertState[keyOf(row.it)] === 'up', 'alert-down': alertState[keyOf(row.it)] === 'down' }"
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
                @mousemove.stop="onDragMove"
                @mouseup.stop="onDragEnd"
                @mouseleave.stop="onDragEnd"
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
              <text class="st-num" :class="pctCls(row.q)">{{ row.q.loading ? '--' : fmtPrice(row.q.price) }}</text>
            </view>
            <!-- 涨跌幅（独立数值列，与榜单同款样式） -->
            <view v-if="cols.pct" class="td c-pct">
              <text class="st-num" :class="pctCls(row.q)">{{ row.q.loading ? '--' : fmtPct(row.q.pct) }}</text>
            </view>
            <view v-if="cols.chg" class="td c-chg">
              <text class="st-num" :class="pctCls(row.q)">{{ row.q.loading ? '--' : fmtSigned(row.q.chg) }}</text>
            </view>
            <view v-if="cols.open" class="td c-open">
              <text class="st-num">{{ row.q.loading ? '--' : fmtPrice(row.q.open) }}</text>
            </view>
            <view v-if="cols.amp" class="td c-amp">
              <text class="st-num">{{ row.q.loading ? '--' : ampPct(row.q) }}</text>
            </view>
            <view v-if="cols.amt" class="td c-amt">
              <text class="st-num">{{ row.q.loading ? '--' : fmtAmount(row.q.amount) }}</text>
            </view>
          </view>
          </view>
          </view>
        </scroll-view>

        <!-- 统一底部窗体：固定常驻于菜单栏上方(始终可见)，折叠露出「今日最热」卡片；
             展开后按 activePanel 切换 榜单 / 我的分组 / 显示列 三种内容；
             三套内容共用同一窗体、同一套折叠/展开/铺满手势与动效，避免重复样式与代码 -->
        <PeekSheet ref="sheet" @expand="sheetExpanded = true" @collapse="onSheetCollapse">
          <template #peek>
            <view class="peek-row" role="button" aria-label="展开底部面板">
              <text class="peek-label">今日最热</text>
              <!-- 热股切换时整块信息向上滚动切换（与行情页大盘卡统一特效），以 code 为 key -->
              <RollSwap class="peek-roll" :roll-key="peek?.code ?? ''">
                <template v-if="peek">
                  <view class="peek-info">
                    <view class="peek-main">
                      <text class="peek-name">{{ peek.name }}</text>
                      <text class="peek-code">{{ peek.code }}</text>
                    </view>
                    <view class="peek-right">
                      <text class="peek-price" :class="peek.price != null ? (peek.chg >= 0 ? 'up' : 'down') : ''">{{ peek.price != null ? fmtPrice(peek.price) : '--' }}</text>
                      <text class="peek-pct" :class="peek.pct != null ? (peek.chg >= 0 ? 'up' : 'down') : ''">{{ peek.pct != null ? fmtPct(peek.pct) : '--' }}</text>
                    </view>
                  </view>
                </template>
                <text v-else class="peek-empty truncate">今日暂无人气新增</text>
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

            <!-- 我的分组：主视图 / 新建 / 移入 / 管理 共用同一内容容器，按 groupView 切换 -->
            <template v-else-if="activePanel === 'group'">
              <view class="grp-head panel-head">
                <view v-if="groupView !== 'main'" class="grp-back" role="button" aria-label="返回" @click="groupBack"><OutlineIcon type="arrow-left" :size="32" color="var(--text-2)" /></view>
                <text class="sheet-title">{{ groupTitle }}</text>
              </view>
              <scroll-view class="grp-body" scroll-y>
                <!-- 主视图：我的分组 + 三个入口 -->
                <template v-if="groupView === 'main'">
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
                      <OutlineIcon v-if="selectedGroup === '__all__'" type="check" :size="30" color="var(--primary)" />
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
                  v-for="c in colDefs"
                  :key="c.key"
                  class="col-item"
                  :class="{ off: !cols[c.key] }"
                  role="button"
                  @click="toggleCol(c.key)"
                >
                  <text class="col-name">{{ c.label }}</text>
                  <view class="col-sw" :class="{ on: cols[c.key] }"><view class="col-knob" /></view>
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
                <view class="grp-back" role="button" aria-label="返回" @click="activePanel = 'actions'"><OutlineIcon type="arrow-left" :size="32" color="var(--text-2)" /></view>
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
      </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onActivated, onDeactivated, onUnmounted } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import PageHeader from "@/components/PageHeader.vue";
import PeekSheet from "@/components/PeekSheet.vue";
import RollSwap from "@/components/RollSwap.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import RankView from "@/views/RankView.vue";
import { useWatchlist, removeWatch, setItemGroup, setAlerts, renameGroup, deleteGroup, applyGroupOrder, type WatchItem, type PriceAlert } from "@/store/watchlist";
import { userState } from "@/store/user";
import { goTab } from "@/store/nav";
import { usePageGuard } from "@/store/guard";
import { fetchSnapshot, type SnapResult } from "@/api/quote";
import { fetchStockHeat } from "@/api/heat";
import { resolveSecid, marketCharFor } from "@/utils/period";
import { getMarketStatus } from "@/utils/marketStatus";
import { fmtPrice, fmtPct, fmtSigned, fmtAmount, trendCls } from "@/utils/format";

// 长按操作菜单目标股（统一并入 PeekSheet 面板，替代原先独立的 ActionSheet 弹层）
const sheetExpanded = ref(false);
const lpItem = ref<WatchItem | null>(null);
function onSheetCollapse() {
  // 下拉拖拽收起 / 程序化 collapse() 时复位面板状态（回到榜单），并清空长按目标
  activePanel.value = "rank";
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
const activePanel = ref<"rank" | "group" | "cols" | "actions" | "alert">("rank");
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
const peek = ref<PeekRow | null>(null);
async function loadPeek() {
  const heat = await fetchStockHeat(20, true);
  if (!heat.length) {
    peek.value = null;
    return;
  }
  const top = heat[0];
  const secid = resolveSecid(top.code, top.market as any);
  try {
    const s = await fetchSnapshot(secid);
    peek.value = { code: top.code, name: top.name, chg: s.chg, pct: s.pct, price: s.price };
  } catch {
    peek.value = { code: top.code, name: top.name, chg: 0, pct: null, price: null };
  }
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
  for (const g of groups.value) {
    rows.push({ label: g, key: g, active: selectedGroup.value === g });
  }
  return rows;
});
function pickGroup(key: string) {
  selectedGroup.value = key;
  manualOrderGroup.value = null; // 切换视图即令手工顺序失效，renderRows 回落 displayRows
  sheet.value?.collapse();
}

// 分组面板多视图：我的分组 / 新建分组 / 移入分组 / 管理分组 共用同一窗体
const groupView = ref<'main' | 'new' | 'move' | 'manage'>('main');
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
  groupView.value = 'main';
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
const keyOf = (it: WatchItem) => `${it.code}|${it.market}`;

// 价格预警：上一轮成功价格（用于穿越检测）+ 当前命中行方向（up=突破阈值/红，down=跌破阈值/绿）
const prevPrices = reactive<Record<string, number>>({});
const alertState = ref<Record<string, "up" | "down">>({});

// 自选股实时行情：批量拉取快照（与行情页同口径），填充现价与涨跌幅，并检测价格预警穿越
async function loadQuotes() {
  if (userState.supabaseEnabled && !userState.loggedIn) return;
  const tasks = list.value.map(async (it) => {
    const k = keyOf(it);
    quotes[k] = { ...EMPTY, loading: true };
    try {
      const secid = resolveSecid(it.code, it.market as any);
      const snap = await fetchSnapshot(secid);
      quotes[k] = { ...snap, loading: false };
      detectAlert(it, snap.price);
    } catch {
      quotes[k] = { ...EMPTY, loading: false, error: true };
    }
  });
  await Promise.allSettled(tasks);
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
    sortKey.value = "";
  }
}

// 拖拽顺序缓冲（键序列），仅作用于「当前视图」并与 selectedGroup 强绑定，杜绝跨视图互串。
const manualOrder = ref<string[]>([]);
// manualOrder 所属视图；与 selectedGroup 不一致即视为失效，renderRows 回落 displayRows（store 的 per-view 排序）。
const manualOrderGroup = ref<string | null>(null);
// 渲染行：列排序优先；否则按手动顺序（仅限当前视图的拖拽结果）
const renderRows = computed(() => {
  if (sortKey.value) return displayRows.value;
  // 仅当 manualOrder 属于「当前视图」时才应用：切换分组后 manualOrderGroup 被置空/不匹配，
  // 直接回落到 displayRows（store 的 per-view order / globalOrder 排序），从根上杜绝顺序互串。
  if (manualOrderGroup.value === selectedGroup.value && manualOrder.value.length) {
    const idx = new Map(manualOrder.value.map((k, i) => [k, i]));
    return displayRows.value
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
  return displayRows.value;
});

// 拖拽状态（整理模式下所有视图——含"全部"——均可拖拽重排）
const dragKey = ref<string | null>(null);
let dragStartY = 0;
let rowHpx = 0;
let dragMoved = false;
function dragPtY(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}
function onDragStart(e: any, it: WatchItem) {
  if (sortKey.value) sortKey.value = ""; // 拖拽即自定义顺序，清除列排序
  dragKey.value = keyOf(it);
  dragStartY = dragPtY(e);
  // 以「当前视图」展示顺序初始化拖拽缓冲，并标记所属视图——保证只影响当前视图、不串入其它分组。
  manualOrder.value = displayRows.value.map((r) => keyOf(r.it));
  manualOrderGroup.value = selectedGroup.value;
  dragMoved = false;
  try {
    const info: any = (uni as any).getWindowInfo ? (uni as any).getWindowInfo() : uni.getSystemInfoSync();
    const w = info.windowWidth || 375;
    rowHpx = (w / 750) * 96; // .td 行高 96rpx → px（与热榜 .rk-row min-height:96rpx 对齐）
  } catch (_) {
    rowHpx = 50;
  }
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onDragMove(e: any) {
  if (!dragKey.value) return;
  const dy = dragPtY(e) - dragStartY;
  if (Math.abs(dy) > 4) dragMoved = true;
  const arr = manualOrder.value;
  const from = arr.indexOf(dragKey.value);
  if (from < 0) return;
  let to = from + Math.round(dy / rowHpx);
  to = Math.max(0, Math.min(arr.length - 1, to));
  if (to !== from) {
    const next = arr.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    manualOrder.value = next;
    dragStartY = dragPtY(e); // 锚点重置，下一步以新位置为基准
  }
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onDragEnd() {
  if (!dragKey.value) return;
  dragKey.value = null;
  // 拖拽结束后持久化重排结果：单分组按组内 order 持久化；"全部"视图按全局 order 持久化
  // （applyGroupOrder 内部按 group 是否为 "__all__" 区分两种重排范围）。
  if (dragMoved) {
    applyGroupOrder(selectedGroup.value, manualOrder.value);
  }
}

// 表头排序：点击列头切换 升/降序；null(加载中) 始终排末尾（名称列固定，不参与排序）
type SortKey = "pct" | "price" | "chg" | "open" | "amp" | "amt" | "";
const sortKey = ref<SortKey>("");
const sortDir = ref<"asc" | "desc">("desc");
function toggleSort(key: SortKey) {
  if (!key) return;
  if (sortKey.value === key) sortDir.value = sortDir.value === "desc" ? "asc" : "desc";
  else {
    sortKey.value = key;
    sortDir.value = "desc";
  }
}
function sortVal(q: Snap, k: Exclude<SortKey, "">): number | null {
  if (q.loading) return null;
  switch (k) {
    case "pct": return q.pct ?? null;
    case "price": return q.price ?? null;
    case "chg": return q.chg ?? null;
    case "open": return q.open ?? null;
    case "amp":
      return q.high != null && q.low != null && q.preClose ? ((q.high - q.low) / q.preClose) * 100 : null;
    case "amt": return q.amount ?? null;
  }
  return null;
}
const displayRows = computed(() => {
  const arr = rows.value;
  const k = sortKey.value;
  if (!k) return arr;
  const dir = sortDir.value === "desc" ? -1 : 1;
  return [...arr].sort((a, b) => {
    let cmp = 0;
    const va = sortVal(a.q, k);
    const vb = sortVal(b.q, k);
    if (va == null && vb == null) cmp = 0;
    else if (va == null) cmp = 1;
    else if (vb == null) cmp = -1;
    else cmp = va - vb;
    return cmp * dir;
  });
});

// 顶部右侧：当前分组名（默认「全部」）+ 当前分组内实时涨/跌个股个数（随行情刷新）
const upDown = computed(() => {
  const g = selectedGroup.value;
  const currentGroup = !g || g === "__all__" ? "全部" : g;
  let up = 0;
  let down = 0;
  for (const r of rows.value) {
    if (r.q.loading) continue;
    if (r.q.chg > 0) up++;
    else if (r.q.chg < 0) down++;
  }
  return { currentGroup, counts: { up, down } };
});

// 表格数值列配色：复用全局 trendCls 统一规则——缺失/零值一律灰色(st-flat)，
// 仅当价格/涨跌幅/涨跌额均有值且 chg 非零时才显示红/绿，避免 "--" 占位符被着色。
function pctCls(q: Snap): string {
  if (q.loading || q.price == null || q.pct == null || q.chg == null) return "st-flat";
  return trendCls(q.chg) === "up" ? "st-up" : "st-down";
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
  if (!needLogin.value) loadQuotesSafe();
  loadPeek();
});
onActivated(() => {
  loadQuotesSafe();
  startPolling();
  loadPeek(); // 回到本页即刷新「今日最热」预览，避免展示过期的空态
});
onDeactivated(stopPolling);
onUnmounted(() => {
  stopPolling();
});
watch(
  () => userState.loggedIn,
  (li) => {
    if (li) {
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
/* 表头可排序：箭头指示 + 激活态高亮 */
.th-label {
  white-space: nowrap;
  letter-spacing: 0.5rpx;
}
/* 排序激活：主色文字 + 顶部小色块提示（脱离上下小箭头，用更直观的方式） */
.th.active {
  color: var(--primary);
  font-weight: 700;
}
.th.active::before {
  content: "";
  position: absolute;
  top: 0;
  right: 14rpx;
  left: 14rpx;
  height: 4rpx;
  border-radius: 0 0 4rpx 4rpx;
  background: linear-gradient(90deg, var(--primary), var(--primary-dark, #06a050));
}
.th.c-name.active::before {
  right: 16rpx;
  left: 16rpx;
}
/* 排序指示器：双箭头加粗，未激活态透明灰、激活态主色 */
.sort-ic {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  gap: 3rpx;
  margin-left: 6rpx;
  width: 14rpx;
}
.sort-ic .ar {
  width: 0;
  height: 0;
  border-left: 5rpx solid transparent;
  border-right: 5rpx solid transparent;
  transition: border-color 0.18s ease;
}
.sort-ic .ar.up {
  border-bottom: 6rpx solid var(--text-3);
}
.sort-ic .ar.dn {
  border-top: 6rpx solid var(--text-3);
}
.th:hover .sort-ic .ar.up,
.th:hover .sort-ic .ar.dn {
  border-bottom-color: var(--text-2);
  border-top-color: var(--text-2);
}
.th.active .sort-ic .ar.up.on {
  border-bottom-color: var(--primary);
}
.th.active .sort-ic .ar.dn.on {
  border-top-color: var(--primary);
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
  width: 200rpx;
  padding: 0 10rpx 0 18rpx;
  text-align: left;
  background: var(--bg-2);
}
/* 列宽（合计 > 屏宽 → 横向滚动）。涨跌幅/最新价/涨跌额/今开 四列等宽(150rpx) */
.c-pct  { width: 150rpx; }
.c-price { width: 150rpx; }
.c-chg  { width: 150rpx; }
.c-open { width: 150rpx; }
.c-amp  { width: 120rpx; }
.c-amt  { width: 200rpx; }
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
  max-width: 160rpx;
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
  max-width: 92rpx;
  /* 截断属性已提升至全局 .truncate */
}
/* ===== 分组切换面板：与「头像设置」BottomSheet 头部共用同一套 .panel-head 样式 ===== */
/* grp-head 直接复用全局 .panel-head（padding 6rpx 28rpx 16rpx + 下框线），
   与 .bs-head 完全一致：居中标题 + 相同头部高度(72rpx)，消除重复多写一套样式；
   position:relative 仅为承载绝对定位的返回按钮(grp-back)，不影响标题居中 */
.grp-head {
  position: relative;
  justify-content: center;
  height: 72rpx;
}
/* 标题排版复用全局 .sheet-title（font-md / 500 / text-2），与 .bs-head 标题完全一致；
   不再绝对定位——改为容器内普通流式文本，由 .panel-head 的 align-items/justify-content 居中。
   返回按钮经 .grp-back 绝对定位浮于左侧，标题仍可精确居中于整窗头部（保留原诉求） */
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
/* 返回按钮绝对浮于头部左侧（与 .panel-head 28rpx 内边距对齐），不占 flex 空间，
   保证标题仍精确居中于整窗头部（无论有无返回按钮，标题位置一致），与 BottomSheet 头部机制统一 */
.grp-back {
  position: absolute;
  left: 28rpx;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.12s ease;
}
.grp-back:active {
  background: var(--card-2);
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
  font-weight: 600;
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
  font-weight: 500;
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
  margin: 0 24rpx;
  padding: 6rpx 0 8rpx;
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
  left: 0;
  bottom: -1rpx;
  width: 50%;
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
</style>