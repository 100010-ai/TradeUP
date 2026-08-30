export type MarketListing = {
  id: string;
  title: string;
  description: string;
  price: number | string;
  views: number;
  created_at: string;
  updated_at: string;
  seller_id: string;
  seller_first_name: string;
  seller_username: string | null;
  seller_photo_url: string | null;
  seller_rating: number;
  seller_deals_count: number;
  condition: number;
  item_type_id: string;
  item_name: string;
  brand: string | null;
  category_id: string;
  category_name: string;
  base_value: number | string;
  volatility: number | string;
  image_url: string | null;
  image_source_url: string | null;
  image_credit: string | null;
  image_license: string | null;
};

export type PlayerProfile = {
  id: string;
  username: string | null;
  first_name: string;
  photo_url: string | null;
  balance: number | string;
  rating: number;
  deals_count: number;
  total_profit: number | string;
  is_online: boolean;
  last_seen_at: string;
};

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export type SessionCounts = {
  inventory: number;
  listings: number;
  favorites: number;
};

export type InventoryItem = {
  id: string;
  condition: number;
  acquired_price: number | string;
  acquired_at: string;
  is_locked: boolean;
  item_types: {
    id: string;
    name: string;
    brand: string | null;
    category_id: string;
    base_value: number | string;
    volatility: number | string;
    image_url: string | null;
  } | null;
};

export type LiveInventoryListing = {
  id: string;
  inventory_item_id: string;
  title: string;
  description: string;
  price: number | string;
  status: string;
  created_at: string;
};

export const BOT_USERNAME = "TradeUpGame_Bot";
export const BOT_URL = `https://t.me/${BOT_USERNAME}?startapp=market`;

export const categoryMeta: Record<string, { icon: string; short: string }> = {
  phones: { icon: "📱", short: "Смартфоны" },
  computers: { icon: "💻", short: "Техника" },
  consoles: { icon: "🎮", short: "Консоли" },
  sneakers: { icon: "👟", short: "Кроссовки" },
  watches: { icon: "⌚", short: "Часы" },
  collectibles: { icon: "🃏", short: "Коллекционное" },
};

export const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const compactNumber = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });

export function rubles(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return `${money.format(Number.isFinite(number) ? number : 0)} ₽`;
}

export function percent(value: number, withPlus = true) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${withPlus && safe > 0 ? "+" : ""}${safe.toFixed(Math.abs(safe) >= 10 ? 0 : 1)}%`;
}

export function relativeDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "только что";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} дн назад`;
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function conditionLabel(condition: number) {
  if (condition >= 96) return "Как новый";
  if (condition >= 88) return "Отличное";
  if (condition >= 76) return "Хорошее";
  if (condition >= 60) return "Нормальное";
  return "Уставшее";
}

export function estimateFairValue(baseValue: number | string, condition: number) {
  const base = Number(baseValue);
  if (!Number.isFinite(base)) return 0;
  return Math.round(base * (0.68 + Math.min(100, Math.max(1, condition)) / 100 * 0.32));
}

export function dealDelta(price: number | string, baseValue: number | string, condition: number) {
  const fair = estimateFairValue(baseValue, condition);
  if (fair <= 0) return 0;
  return ((Number(price) - fair) / fair) * 100;
}

export function sellerLevel(rating: number) {
  if (rating >= 1800) return "Магнат";
  if (rating >= 1500) return "Дилер";
  if (rating >= 1250) return "Перекуп";
  if (rating >= 1100) return "Хваткий";
  return "Новичок";
}
