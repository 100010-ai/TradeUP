"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { emptyEquipped, kindLabel, rarityLabel, styleFor, titleFor, type CosmeticItem, type CosmeticKind, type EquippedCosmetics, type StoreSnapshot } from "@/lib/cosmetics";

type StoreResult = Record<string, unknown> & { ok?: boolean; error?: string };
type Tab = "all" | CosmeticKind;

function getInitData() { return window.Telegram?.WebApp?.initData ?? ""; }

async function storeAction(action: string, payload: Record<string, unknown> = {}) {
  const initData = getInitData();
  if (!initData) throw new Error("telegram_required");
  const response = await fetch("/api/store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, action, payload }),
    cache: "no-store",
  });
  const result = await response.json() as StoreResult;
  if (!response.ok || !result.ok) throw new Error(result.error ?? "store_failed");
  return result;
}

function CosmeticVisual({ item }: { item: CosmeticItem }) {
  if (item.kind === "frame") return <div className={`cosmeticFrameSample ${item.style_key}`}><span>TU</span></div>;
  if (item.kind === "name_style") return <div className={`cosmeticNameSample ${item.style_key}`}>TradeUP</div>;
  if (item.kind === "title") return <div className={`cosmeticTitleSample ${item.style_key}`}>{item.name}</div>;
  return <div className={`cosmeticThemeSample ${item.style_key}`}><i/><span>TradeUP</span><small>профиль</small></div>;
}

export default function CosmeticsStore() {
  const session = useTelegramSession();
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [preview, setPreview] = useState<CosmeticItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (session.state !== "verified") { setLoading(false); return; }
    try {
      const result = await storeAction("list");
      setSnapshot({
        catalog: Array.isArray(result.catalog) ? result.catalog as CosmeticItem[] : [],
        owned: Array.isArray(result.owned) ? result.owned as StoreSnapshot["owned"] : [],
        equipped: result.equipped && typeof result.equipped === "object" ? result.equipped as EquippedCosmetics : null,
        purchases: Array.isArray(result.purchases) ? result.purchases as StoreSnapshot["purchases"] : [],
      });
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить магазин");
    } finally { setLoading(false); }
  }

  useEffect(() => { if (session.state === "verified") void load(); else if (["browser","unavailable","error"].includes(session.state)) setLoading(false); }, [session.state]);

  const catalog = snapshot?.catalog ?? [];
  const owned = useMemo(() => new Set((snapshot?.owned ?? []).map((item) => item.cosmetic_id)), [snapshot?.owned]);
  const equipped = snapshot?.equipped ?? emptyEquipped;
  const visible = tab === "all" ? catalog : catalog.filter((item) => item.kind === tab);
  const effective = { ...equipped };
  if (preview) {
    if (preview.kind === "frame") effective.frame_id = preview.id;
    if (preview.kind === "name_style") effective.name_style_id = preview.id;
    if (preview.kind === "title") effective.title_id = preview.id;
    if (preview.kind === "profile_theme") effective.profile_theme_id = preview.id;
  }
  const frameStyle = styleFor(catalog, effective.frame_id);
  const nameStyle = styleFor(catalog, effective.name_style_id);
  const themeStyle = styleFor(catalog, effective.profile_theme_id);
  const equippedTitle = titleFor(catalog, effective.title_id);

  function isEquipped(item: CosmeticItem) {
    return item.kind === "frame" ? equipped.frame_id === item.id : item.kind === "name_style" ? equipped.name_style_id === item.id : item.kind === "title" ? equipped.title_id === item.id : equipped.profile_theme_id === item.id;
  }

  async function equip(item: CosmeticItem) {
    setBusyId(item.id); setMessage(null);
    try {
      const result = await storeAction("equip", { kind: item.kind, cosmeticId: isEquipped(item) ? null : item.id });
      setSnapshot((current) => current ? { ...current, equipped: result.equipped as EquippedCosmetics } : current);
      setPreview(null);
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
    } catch { setMessage("Не удалось изменить оформление"); }
    finally { setBusyId(null); }
  }

  async function confirm(purchaseId: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const confirmed = await storeAction("confirm_purchase", { purchaseId });
        if (confirmed.ok) { await load(); return true; }
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "payment_not_settled" || attempt === 2) throw error;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 900));
    }
    return false;
  }

  async function buy(item: CosmeticItem) {
    if (busyId) return;
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.openInvoice) { setMessage("Обнови Telegram, чтобы оплачивать покупки звёздами"); return; }
    setBusyId(item.id); setMessage(null);
    try {
      const prepared = await storeAction("prepare_purchase", { cosmeticId: item.id });
      const invoiceLink = typeof prepared.invoiceLink === "string" ? prepared.invoiceLink : "";
      const purchaseId = typeof prepared.purchaseId === "string" ? prepared.purchaseId : "";
      if (!invoiceLink || !purchaseId) throw new Error("invoice_create_failed");
      webApp.HapticFeedback?.impactOccurred?.("light");
      webApp.openInvoice(invoiceLink, (status) => {
        if (status === "cancelled") { setBusyId(null); return; }
        if (status === "failed") { setMessage("Telegram не провёл платёж"); setBusyId(null); return; }
        if (status === "paid" || status === "pending") {
          setMessage(status === "pending" ? "Платёж обрабатывается…" : "Подтверждаем покупку…");
          void confirm(purchaseId).then((ok) => {
            if (ok) {
              setMessage("Готово. Косметика добавлена в коллекцию");
              webApp.HapticFeedback?.notificationOccurred?.("success");
            } else setMessage("Платёж ещё обрабатывается. Открой магазин через несколько секунд");
          }).catch(() => setMessage("Платёж прошёл, но выдача ещё подтверждается")).finally(() => setBusyId(null));
        }
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "store_failed";
      setMessage(code === "payment_webhook_conflict" ? "Платёжный обработчик бота занят другой интеграцией" : code === "already_owned" ? "Эта косметика уже у тебя" : "Не удалось открыть оплату");
      setBusyId(null);
    }
  }

  if (session.state !== "verified" && !loading) return <div className="flatAuth"><Icon name="sparkles" size={32}/><strong>Магазин доступен в Telegram</strong><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;

  return <div className="cosmeticStore">
    <header className="cosmeticStoreHeader">
      <div><span>TradeUP Style</span><h1>Оформление</h1><p>Только косметика. Никаких бонусов к экономике.</p></div>
      <div className="starsOnlyBadge"><Icon name="star" size={15}/><span>Stars only</span></div>
    </header>

    <section className={`cosmeticLivePreview ${themeStyle}`}>
      <div className={`cosmeticLiveAvatar ${frameStyle}`}>{session.profile?.photo_url ? <img src={session.profile.photo_url} alt=""/> : session.profile?.first_name?.charAt(0).toUpperCase() ?? "T"}</div>
      <div className="cosmeticLiveIdentity"><div><strong className={nameStyle}>{session.profile?.first_name ?? "TradeUP"}</strong>{equippedTitle && <span>{equippedTitle}</span>}</div><small>{session.profile?.username ? `@${session.profile.username}` : "Твой профиль"}</small></div>
      <button type="button" onClick={() => setPreview(null)} disabled={!preview}>Сбросить preview</button>
    </section>

    <nav className="cosmeticTabs" aria-label="Категории косметики">
      {([['all','Всё'],['frame','Рамки'],['name_style','Имя'],['title','Титулы'],['profile_theme','Темы']] as const).map(([id,label]) => <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
    </nav>

    {message && <div className="cosmeticStoreNotice">{message}</div>}
    {loading && <div className="cosmeticStoreLoading"><i/><i/><i/><i/></div>}

    {!loading && <div className="cosmeticGrid">{visible.map((item) => {
      const has = owned.has(item.id), active = isEquipped(item), busy = busyId === item.id;
      return <article className={`cosmeticItem rarity-${item.rarity}`} key={item.id}>
        <button type="button" className="cosmeticPreviewButton" onClick={() => setPreview(item)} aria-label={`Предпросмотр ${item.name}`}><CosmeticVisual item={item}/><span className="cosmeticRarity">{rarityLabel(item.rarity)}</span></button>
        <div className="cosmeticItemCopy"><div><strong>{item.name}</strong><small>{kindLabel(item.kind)}</small></div><p>{item.description}</p></div>
        {has ? <button type="button" className={active ? "cosmeticAction equipped" : "cosmeticAction"} onClick={() => void equip(item)} disabled={busy}>{busy ? "…" : active ? <><Icon name="check" size={15}/>Надето</> : "Надеть"}</button> : <button type="button" className="cosmeticAction buy" onClick={() => void buy(item)} disabled={Boolean(busyId)}>{busy ? "Открываем…" : <><Icon name="star" size={15}/>{item.stars_price}</>}</button>}
      </article>;
    })}</div>}
  </div>;
}
