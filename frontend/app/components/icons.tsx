import type { CSSProperties, ReactNode, SVGProps } from "react";

export type IconName =
  | "logo"
  | "dashboard"
  | "monitor"
  | "recipe"
  | "builder"
  | "wand"
  | "runs"
  | "exports"
  | "settings"
  | "search"
  | "bell"
  | "plus"
  | "chevronDown"
  | "chevronRight"
  | "chevronLeft"
  | "chevronUpDown"
  | "arrowRight"
  | "arrowUpRight"
  | "arrowUp"
  | "arrowDown"
  | "external"
  | "check"
  | "checkCircle"
  | "alert"
  | "info"
  | "x"
  | "more"
  | "filter"
  | "sort"
  | "download"
  | "refresh"
  | "play"
  | "pause"
  | "clock"
  | "calendar"
  | "link"
  | "globe"
  | "database"
  | "layers"
  | "records"
  | "flask"
  | "cursor"
  | "pointer"
  | "box"
  | "treeNode"
  | "code"
  | "copy"
  | "file"
  | "csv"
  | "json"
  | "key"
  | "shield"
  | "user"
  | "team"
  | "mail"
  | "bolt"
  | "diff"
  | "trash"
  | "edit"
  | "eye"
  | "spark"
  | "bookmark"
  | "github"
  | "slack"
  | "zap"
  | "star"
  | "hash"
  | "lock"
  | "webhook"
  | "grid"
  | "list"
  | "arrowsHV"
  | "trend"
  | "card"
  | "cube"
  | "api";

const PATHS: Record<IconName, ReactNode> = {
  logo: (
    <>
      <path d="M4 7.5L12 3.5L20 7.5V16.5L12 20.5L4 16.5V7.5Z" />
      <path d="M4 7.5L12 11.5L20 7.5" />
      <path d="M12 11.5V20.5" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.4" />
      <rect x="14" y="3" width="7" height="5" rx="1.4" />
      <rect x="14" y="12" width="7" height="9" rx="1.4" />
      <rect x="3" y="16" width="7" height="5" rx="1.4" />
    </>
  ),
  monitor: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12C5 7 8 5 12 5C16 5 19 7 21 12C19 17 16 19 12 19C8 19 5 17 3 12Z" />
    </>
  ),
  recipe: (
    <>
      <path d="M5 4H15L19 8V20H5V4Z" />
      <path d="M15 4V8H19" />
      <path d="M8 12H16" />
      <path d="M8 15.5H13" />
    </>
  ),
  builder: (
    <>
      <path d="M14.5 3L21 9.5L9.5 21H3V14.5L14.5 3Z" />
      <path d="M13 4.5L19.5 11" />
    </>
  ),
  wand: (
    <>
      <path d="M14 4L20 10" />
      <path d="M3 21L15 9" />
      <path d="M18 3L19 5L21 6L19 7L18 9L17 7L15 6L17 5L18 3Z" fill="currentColor" />
    </>
  ),
  runs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="currentColor" />
    </>
  ),
  exports: (
    <>
      <path d="M12 14V4" />
      <path d="M8 8L12 4L16 8" />
      <path d="M4 14V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V14" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15A1.65 1.65 0 0 0 19 16.7L19.06 16.76A2 2 0 1 1 16.24 19.58L16.18 19.52A1.65 1.65 0 0 0 14.46 19.16A1.65 1.65 0 0 0 13.5 20.67V20.83A2 2 0 0 1 9.5 20.83V20.74A1.65 1.65 0 0 0 8.42 19.23A1.65 1.65 0 0 0 6.7 19.59L6.64 19.65A2 2 0 1 1 3.82 16.83L3.88 16.77A1.65 1.65 0 0 0 4.24 15.05A1.65 1.65 0 0 0 2.73 14.09H2.57A2 2 0 1 1 2.57 10.09H2.66A1.65 1.65 0 0 0 4.17 9.01A1.65 1.65 0 0 0 3.81 7.29L3.75 7.23A2 2 0 1 1 6.57 4.41L6.63 4.47A1.65 1.65 0 0 0 8.35 4.83H8.42A1.65 1.65 0 0 0 9.42 3.33V3.17A2 2 0 1 1 13.42 3.17V3.26A1.65 1.65 0 0 0 14.42 4.77A1.65 1.65 0 0 0 16.14 4.41L16.2 4.35A2 2 0 1 1 19.02 7.17L18.96 7.23A1.65 1.65 0 0 0 18.6 8.95V9.02A1.65 1.65 0 0 0 20.11 10.02H20.27A2 2 0 0 1 20.27 14.02H20.18A1.65 1.65 0 0 0 18.67 15.02" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20L16.5 16.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8C6 4.7 8.7 2 12 2C15.3 2 18 4.7 18 8V13L20 16H4L6 13V8Z" />
      <path d="M9 19C9 20.7 10.3 22 12 22C13.7 22 15 20.7 15 19" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5V19" />
      <path d="M5 12H19" />
    </>
  ),
  chevronDown: <path d="M6 9L12 15L18 9" />,
  chevronRight: <path d="M9 6L15 12L9 18" />,
  chevronLeft: <path d="M15 6L9 12L15 18" />,
  chevronUpDown: (
    <>
      <path d="M8 9L12 5L16 9" />
      <path d="M16 15L12 19L8 15" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12H19" />
      <path d="M13 5L20 12L13 19" />
    </>
  ),
  arrowUpRight: (
    <>
      <path d="M7 17L17 7" />
      <path d="M9 7H17V15" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M12 19V5" />
      <path d="M5 12L12 5L19 12" />
    </>
  ),
  arrowDown: (
    <>
      <path d="M12 5V19" />
      <path d="M5 12L12 19L19 12" />
    </>
  ),
  external: (
    <>
      <path d="M14 4H20V10" />
      <path d="M20 4L10 14" />
      <path d="M18 14V19C18 19.6 17.6 20 17 20H5C4.4 20 4 19.6 4 19V7C4 6.4 4.4 6 5 6H10" />
    </>
  ),
  check: <path d="M5 12L10 17L20 7" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12L11 15L16 9" />
    </>
  ),
  alert: (
    <>
      <path d="M12 9V13" />
      <circle cx="12" cy="16.5" r="0.5" fill="currentColor" stroke="none" />
      <path d="M10.3 3.9L2.8 17.1C2.2 18.1 3 19.5 4.2 19.5H19.8C21 19.5 21.8 18.1 21.2 17.1L13.7 3.9C13.1 2.9 11 2.9 10.3 3.9Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8V8.5" />
      <path d="M12 11V16" />
    </>
  ),
  x: (
    <>
      <path d="M6 6L18 18" />
      <path d="M18 6L6 18" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  filter: <path d="M3 5H21L14 13V20L10 18V13L3 5Z" />,
  sort: (
    <>
      <path d="M8 4V20" />
      <path d="M5 17L8 20L11 17" />
      <path d="M16 4V20" />
      <path d="M13 7L16 4L19 7" />
    </>
  ),
  download: (
    <>
      <path d="M12 4V16" />
      <path d="M7 11L12 16L17 11" />
      <path d="M4 20H20" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12A8 8 0 0 1 17 6.3L20 9" />
      <path d="M20 4V9H15" />
      <path d="M20 12A8 8 0 0 1 7 17.7L4 15" />
      <path d="M4 20V15H9" />
    </>
  ),
  play: <path d="M7 5V19L19 12L7 5Z" fill="currentColor" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7V12L15 14" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9H21" />
      <path d="M8 3V7" />
      <path d="M16 3V7" />
    </>
  ),
  link: (
    <>
      <path d="M10 14C11.4 15.4 13.6 15.4 15 14L19 10C20.4 8.6 20.4 6.4 19 5C17.6 3.6 15.4 3.6 14 5L13 6" />
      <path d="M14 10C12.6 8.6 10.4 8.6 9 10L5 14C3.6 15.4 3.6 17.6 5 19C6.4 20.4 8.6 20.4 10 19L11 18" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12H21" />
      <path d="M12 3C14.5 6 15.5 9 15.5 12C15.5 15 14.5 18 12 21" />
      <path d="M12 3C9.5 6 8.5 9 8.5 12C8.5 15 9.5 18 12 21" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="2.5" />
      <path d="M4 5V12C4 13.4 7.6 14.5 12 14.5C16.4 14.5 20 13.4 20 12V5" />
      <path d="M4 12V19C4 20.4 7.6 21.5 12 21.5C16.4 21.5 20 20.4 20 19V12" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3L2 8L12 13L22 8L12 3Z" />
      <path d="M2 13L12 18L22 13" />
      <path d="M2 18L12 23L22 18" />
    </>
  ),
  records: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9H21" />
      <path d="M9 4V20" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3V8.5L4.5 17.5C3.8 18.8 4.7 20.5 6.2 20.5H17.8C19.3 20.5 20.2 18.8 19.5 17.5L15 8.5V3" />
      <path d="M8 3H16" />
      <path d="M6.8 14H17.2" />
    </>
  ),
  cursor: <path d="M4 4L12 22L14 14L22 12L4 4Z" />,
  pointer: <path d="M9 3V13L12 11L14 18L17 16.5L15 9.5L18 9L9 3Z" fill="currentColor" />,
  box: <rect x="3" y="3" width="18" height="18" rx="2" />,
  treeNode: (
    <>
      <rect x="2" y="9" width="6" height="6" rx="1" />
      <rect x="16" y="3" width="6" height="6" rx="1" />
      <rect x="16" y="15" width="6" height="6" rx="1" />
      <path d="M8 12H12V6H16" />
      <path d="M12 12V18H16" />
    </>
  ),
  code: (
    <>
      <path d="M9 7L4 12L9 17" />
      <path d="M15 7L20 12L15 17" />
      <path d="M13 4L11 20" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4C3.4 15 3 14.6 3 14V4C3 3.4 3.4 3 4 3H14C14.6 3 15 3.4 15 4V5" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7C5.9 3 5 3.9 5 5V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V8L14 3Z" />
      <path d="M14 3V8H19" />
    </>
  ),
  csv: (
    <>
      <path d="M14 3H7C5.9 3 5 3.9 5 5V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V8L14 3Z" />
      <path d="M14 3V8H19" />
      <path d="M8 13H16" />
      <path d="M8 17H13" />
    </>
  ),
  json: (
    <>
      <path d="M14 3H7C5.9 3 5 3.9 5 5V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V8L14 3Z" />
      <path d="M14 3V8H19" />
      <path d="M9 13C9 12.4 9.4 12 10 12" />
      <path d="M10 18C9.4 18 9 17.6 9 17V15" />
      <path d="M15 13C15 12.4 14.6 12 14 12" />
      <path d="M14 18C14.6 18 15 17.6 15 17V15" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="16" r="3" />
      <path d="M10 14L21 3" />
      <path d="M17 7L20 10" />
    </>
  ),
  shield: <path d="M12 3L20 6V12C20 16.5 16.5 20 12 21C7.5 20 4 16.5 4 12V6L12 3Z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21C4 16.5 7.5 14 12 14C16.5 14 20 16.5 20 21" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="9" r="3.5" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3 20C3 16 5.7 14 9 14C12.3 14 15 16 15 20" />
      <path d="M15 14C17.5 14 21 15.5 21 19.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7L12 13L21 7" />
    </>
  ),
  bolt: <path d="M13 3L4 14H11L10 21L20 9H13L13 3Z" />,
  diff: (
    <>
      <path d="M5 4V15" />
      <circle cx="5" cy="18" r="2.5" />
      <path d="M19 9V20" />
      <circle cx="19" cy="6" r="2.5" />
      <path d="M13 4H17C18.1 4 19 4.9 19 6" />
      <path d="M11 20H7C5.9 20 5 19.1 5 18" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6H20" />
      <path d="M6 6V19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V6" />
      <path d="M9 6V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V6" />
      <path d="M10 11V17" />
      <path d="M14 11V17" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20H20" />
      <path d="M14 4L20 10L9 21H3V15L14 4Z" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12C4 7.5 7.5 5 12 5C16.5 5 20 7.5 22 12C20 16.5 16.5 19 12 19C7.5 19 4 16.5 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  spark: <path d="M12 3L13.5 10L20 12L13.5 14L12 21L10.5 14L4 12L10.5 10L12 3Z" />,
  bookmark: <path d="M6 3H18V21L12 17L6 21V3Z" />,
  github: (
    <path
      d="M12 2C6.5 2 2 6.6 2 12.3C2 16.9 4.9 20.7 8.9 22C9.4 22.1 9.6 21.8 9.6 21.5C9.6 21.3 9.6 20.5 9.6 19.7C6.7 20.4 6.1 18.3 6.1 18.3C5.7 17.2 5 16.9 5 16.9C4.1 16.2 5.1 16.2 5.1 16.2C6.1 16.3 6.7 17.3 6.7 17.3C7.6 18.9 9.1 18.5 9.7 18.2C9.8 17.5 10.1 17 10.4 16.7C8.1 16.5 5.7 15.6 5.7 11.7C5.7 10.6 6.1 9.7 6.7 9C6.6 8.7 6.2 7.7 6.8 6.2C6.8 6.2 7.7 5.9 9.6 7.2C10.4 6.9 11.2 6.8 12 6.8C12.8 6.8 13.6 6.9 14.4 7.2C16.3 5.9 17.2 6.2 17.2 6.2C17.8 7.7 17.4 8.7 17.3 9C17.9 9.7 18.3 10.6 18.3 11.7C18.3 15.6 15.9 16.5 13.6 16.7C14 17.1 14.3 17.8 14.3 18.9C14.3 20.4 14.3 21.3 14.3 21.5C14.3 21.8 14.5 22.1 15 22C19 20.7 22 16.9 22 12.3C22 6.6 17.5 2 12 2Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  slack: (
    <>
      <rect x="3" y="10" width="3" height="6" rx="1.5" />
      <rect x="10" y="3" width="3" height="6" rx="1.5" />
      <rect x="10" y="17" width="3" height="4" rx="1.5" />
      <rect x="18" y="8" width="3" height="6" rx="1.5" />
      <rect x="14" y="10" width="6" height="3" rx="1.5" />
      <rect x="3" y="6" width="6" height="3" rx="1.5" />
      <rect x="17" y="14" width="4" height="3" rx="1.5" />
    </>
  ),
  zap: <path d="M13 2L4 13H11L9 22L20 11H13L13 2Z" fill="currentColor" stroke="none" />,
  star: <path d="M12 3L14.5 9L21 9.5L16 13.5L17.5 20L12 16.5L6.5 20L8 13.5L3 9.5L9.5 9L12 3Z" />,
  hash: (
    <>
      <path d="M4 9H20" />
      <path d="M4 15H20" />
      <path d="M10 3L8 21" />
      <path d="M16 3L14 21" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7C8 4.8 9.8 3 12 3C14.2 3 16 4.8 16 7V10" />
    </>
  ),
  webhook: (
    <>
      <path d="M9 17C9 18.7 7.7 20 6 20C4.3 20 3 18.7 3 17C3 15.3 4.3 14 6 14" />
      <path d="M15 4C13.5 3 11.5 3 10 4C8 5.5 7.5 8 8.5 10" />
      <path d="M18 11C19.5 12 20.5 14 20 16C19 18.5 16.5 19.5 14 18.5" />
      <circle cx="6" cy="17" r="1" fill="currentColor" />
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="18" cy="13" r="1" fill="currentColor" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  list: (
    <>
      <path d="M8 6H21" />
      <path d="M8 12H21" />
      <path d="M8 18H21" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </>
  ),
  arrowsHV: (
    <>
      <path d="M2 12H22" />
      <path d="M5 9L2 12L5 15" />
      <path d="M19 9L22 12L19 15" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17L9 11L13 15L21 6" />
      <path d="M15 6H21V12" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10H21" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3L21 8V16L12 21L3 16V8L12 3Z" />
      <path d="M3 8L12 13L21 8" />
      <path d="M12 13V21" />
    </>
  ),
  api: (
    <>
      <path d="M8 4L4 8L8 12" />
      <path d="M16 12L20 16L16 20" />
      <path d="M14 7L10 17" />
    </>
  )
};

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.6,
  style,
  ...rest
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
} & Omit<SVGProps<SVGSVGElement>, "name" | "style">) {
  const node = PATHS[name];
  if (!node) return null;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      {...rest}
    >
      {node}
    </svg>
  );
}
