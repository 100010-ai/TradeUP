import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home" | "heart" | "plus" | "swap" | "user" | "search" | "filter" | "grid"
  | "phone" | "computer" | "gamepad" | "sneaker" | "watch" | "collectible" | "package"
  | "arrowUp" | "arrowLeft" | "arrowRight" | "chevronRight" | "close" | "star"
  | "wallet" | "inventory" | "trophy" | "bot" | "tag" | "history" | "trend"
  | "check" | "info" | "sparkles" | "message" | "send" | "more" | "edit" | "list";

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

const p: Record<IconName, ReactNode> = {
  home: <><path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/></>,
  heart: <path d="M20.5 9.2c0 5-8.5 10.1-8.5 10.1S3.5 14.2 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8Z"/>,
  plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  swap: <><path d="M5 7h12"/><path d="m14 4 3 3-3 3"/><path d="M19 17H7"/><path d="m10 14-3 3 3 3"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></>,
  filter: <><path d="M4 7h16"/><path d="M7 12h10"/><path d="M10 17h4"/></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></>,
  phone: <><rect x="7" y="2.8" width="10" height="18.4" rx="2.3"/><path d="M10 5h4M10.5 18.5h3"/></>,
  computer: <><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M10 16l-.5 4M14 16l.5 4"/></>,
  gamepad: <><path d="M8 8h8c3.2 0 5.2 2.4 5 5.4l-.3 3.5c-.2 2.5-3.2 3.3-4.6 1.2l-1.2-1.8H9.1l-1.2 1.8c-1.4 2.1-4.4 1.3-4.6-1.2L3 13.4C2.8 10.4 4.8 8 8 8Z"/><path d="M7 11v4M5 13h4"/><circle cx="16.5" cy="11.5" r=".8" fill="currentColor" stroke="none"/><circle cx="18.5" cy="14" r=".8" fill="currentColor" stroke="none"/></>,
  sneaker: <><path d="M4 14c2.7 0 4.7-1.1 6.2-3.3l1.3-2 2.1 3.3c.8 1.2 2 1.9 3.5 2.1l2.1.3c1.2.2 1.8.9 1.8 2.1v1.2H4c-1.1 0-2-.9-2-2 0-.9.7-1.7 2-1.7Z"/><path d="M9.7 11.4 12 13M7.7 13l2 1.2"/></>,
  watch: <><rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6 10 2h4l1 4M9 18l1 4h4l1-4"/><path d="M12 9v3l2 1"/></>,
  collectible: <><rect x="5" y="3" width="12" height="17" rx="2"/><path d="m9 8 3-2 3 2-1 3 1 3-3 2-3-2 1-3-1-3Z"/><path d="M17 6h2v14H9"/></>,
  package: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
  arrowUp: <><path d="M12 20V5"/><path d="m6 11 6-6 6 6"/></>,
  arrowLeft: <><path d="M20 12H5"/><path d="m11 6-6 6 6 6"/></>,
  arrowRight: <><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></>,
  chevronRight: <path d="m9 5 7 7-7 7"/>,
  close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 9h14M16 12h5v4h-5a2 2 0 1 1 0-4Z"/></>,
  inventory: <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 5V3h8v2M8 10h8M8 14h5"/></>,
  trophy: <><path d="M8 4h8v5c0 3-1.5 5-4 5s-4-2-4-5V4Z"/><path d="M8 6H4v2c0 2 1.4 3.5 4 3.5M16 6h4v2c0 2-1.4 3.5-4 3.5M12 14v4M8 21h8M9 18h6"/></>,
  bot: <><rect x="4" y="6" width="16" height="13" rx="4"/><path d="M12 3v3M9 12h.01M15 12h.01M9 16h6"/></>,
  tag: <><path d="M3 10V4h6l11 11-6 6L3 10Z"/><circle cx="7" cy="8" r="1"/></>,
  history: <><path d="M4 12a8 8 0 1 0 2.2-5.5L4 9"/><path d="M4 4v5h5M12 8v5l3 2"/></>,
  trend: <><path d="m4 17 5-5 4 3 7-8"/><path d="M15 7h5v5"/></>,
  check: <path d="m5 12 4 4 10-10"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  sparkles: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14ZM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6L19 12Z"/></>,
  message: <><path d="M4 5.5h16v11H9l-5 4v-15Z"/><path d="M8 10h8M8 13h5"/></>,
  send: <><path d="m3 11 17-8-6 18-3-7-8-3Z"/><path d="m11 14 9-11"/></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  edit: <><path d="m4 17-.8 3.8L7 20l11-11-3-3L4 17Z"/><path d="m13.5 7.5 3 3"/></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></>,
};

export function categoryIconName(categoryId: string): IconName {
  if (categoryId === "phones") return "phone";
  if (categoryId === "computers") return "computer";
  if (categoryId === "consoles") return "gamepad";
  if (categoryId === "sneakers") return "sneaker";
  if (categoryId === "watches") return "watch";
  if (categoryId === "collectibles") return "collectible";
  return "package";
}

export default function Icon({ name, size = 22, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>{p[name]}</svg>;
}
