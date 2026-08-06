export interface ActionSheetItem {
  /** 展示文案 */
  label: string;
  /** 透传标识（可在 select 回调里使用，如分组名 / 索引） */
  key?: string | number;
  /** 左侧图标（OutlineIcon 的 type） */
  icon?: string;
  /** 是否高亮为当前选中项 */
  active?: boolean;
  /** 强调样式：primary=微信绿、danger=红色 */
  accent?: "primary" | "danger";
}
