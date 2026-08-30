export type CosmeticKind = "frame" | "name_style" | "title" | "profile_theme";
export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";

export type CosmeticItem = {
  id: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  stars_price: number;
  rarity: CosmeticRarity;
  style_key: string;
  sort_order: number;
};

export type EquippedCosmetics = {
  frame_id: string | null;
  name_style_id: string | null;
  title_id: string | null;
  profile_theme_id: string | null;
};

export type StoreSnapshot = {
  catalog: CosmeticItem[];
  owned: Array<{ cosmetic_id: string; acquired_at: string }>;
  equipped: EquippedCosmetics | null;
  purchases: Array<{ id: string; cosmetic_id: string; stars_amount: number; status: string; created_at: string; paid_at: string | null }>;
};

export const emptyEquipped: EquippedCosmetics = { frame_id: null, name_style_id: null, title_id: null, profile_theme_id: null };

export function styleFor(catalog: CosmeticItem[], id: string | null | undefined) {
  return catalog.find((item) => item.id === id)?.style_key ?? "";
}

export function titleFor(catalog: CosmeticItem[], id: string | null | undefined) {
  return catalog.find((item) => item.id === id)?.name ?? "";
}

export function rarityLabel(rarity: CosmeticRarity) {
  return rarity === "legendary" ? "Легендарная" : rarity === "epic" ? "Эпическая" : rarity === "rare" ? "Редкая" : "Обычная";
}

export function kindLabel(kind: CosmeticKind) {
  return kind === "frame" ? "Рамки" : kind === "name_style" ? "Имя" : kind === "title" ? "Титулы" : "Темы";
}
