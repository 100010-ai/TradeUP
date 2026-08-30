"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BOT_URL, BOT_USERNAME, type PlayerProfile, type SessionCounts, type TelegramUser } from "@/lib/product";

type SessionState = "checking" | "verified" | "browser" | "unavailable" | "error";
type BootstrapPayload = { ok?: boolean; user?: TelegramUser; profile?: PlayerProfile; starterGranted?: number; counts?: SessionCounts; favoriteIds?: string[]; error?: string };
type ActionResult = Record<string, unknown> & { ok?: boolean; error?: string; profile?: PlayerProfile };
type ChatThreadShape = { buyer_id?: unknown; seller_id?: unknown; last_sender_id?: unknown; last_message_at?: unknown; buyer_read_at?: unknown; seller_read_at?: unknown };

type TelegramSessionContextValue = {
  state: SessionState;
  user: TelegramUser | null;
  profile: PlayerProfile | null;
  counts: SessionCounts;
  favoriteIds: Set<string>;
  starterGranted: number;
  unreadChats: number;
  botUsername: string;
  botUrl: string;
  refresh: () => Promise<void>;
  refreshUnreadChats: () => Promise<void>;
  callAction: (action: string, payload?: Record<string, unknown>) => Promise<ActionResult>;
  callChatAction: (action: string, payload?: Record<string, unknown>) => Promise<ActionResult>;
  openBot: () => void;
};

const defaultCounts: SessionCounts = { inventory: 0, listings: 0, favorites: 0 };
const TelegramSessionContext = createContext<TelegramSessionContextValue | null>(null);

function getInitData() { return typeof window !== "undefined" ? window.Telegram?.WebApp?.initData ?? "" : ""; }
function countUnread(result: ActionResult) {
  const profileId = typeof result.profileId === "string" ? result.profileId : "";
  const threads = Array.isArray(result.threads) ? result.threads as ChatThreadShape[] : [];
  if (!profileId) return 0;
  return threads.filter((thread) => {
    if (thread.last_sender_id === profileId || typeof thread.last_message_at !== "string") return false;
    const readAt = thread.buyer_id === profileId ? thread.buyer_read_at : thread.seller_read_at;
    return typeof readAt !== "string" || new Date(thread.last_message_at).getTime() > new Date(readAt).getTime();
  }).length;
}

export function TelegramSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>("checking");
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [counts, setCounts] = useState<SessionCounts>(defaultCounts);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [starterGranted, setStarterGranted] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);

  const openBot = useCallback(() => { window.location.href = BOT_URL; }, []);
  const request = useCallback(async (url: string, action: string, payload: Record<string, unknown> = {}) => {
    const initData = getInitData();
    if (!initData) throw new Error("telegram_required");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, action, payload }), cache: "no-store" });
    const result = (await response.json()) as ActionResult;
    if (!response.ok || !result.ok) throw new Error(result.error ?? "request_failed");
    return result;
  }, []);

  const refresh = useCallback(async () => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) { setState("browser"); return; }
    webApp.ready(); webApp.expand();
    if (!webApp.initData) { setState("unavailable"); return; }
    try {
      const response = await fetch("/api/auth/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: webApp.initData }), cache: "no-store" });
      const payload = (await response.json()) as BootstrapPayload;
      if (!response.ok || !payload.ok || !payload.user || !payload.profile) throw new Error(payload.error ?? "telegram_auth_failed");
      setUser(payload.user); setProfile(payload.profile); setCounts(payload.counts ?? defaultCounts); setFavoriteIds(new Set(payload.favoriteIds ?? [])); setStarterGranted(Number(payload.starterGranted ?? 0)); setState("verified");
    } catch { setState("error"); }
  }, []);

  const refreshUnreadChats = useCallback(async () => {
    if (!getInitData()) return;
    try { setUnreadChats(countUnread(await request("/api/chat", "threads"))); } catch { /* non-critical badge */ }
  }, [request]);

  const callAction = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const result = await request("/api/game", action, payload);
    if (result.profile) setProfile(result.profile);
    if (action === "toggle_favorite" && typeof result.favorite === "boolean" && typeof payload.listingId === "string") {
      setFavoriteIds((current) => { const next = new Set(current); if (result.favorite) next.add(payload.listingId as string); else next.delete(payload.listingId as string); return next; });
    }
    if (["create_listing", "cancel_listing", "buy_listing"].includes(action)) await refresh();
    return result;
  }, [refresh, request]);

  const callChatAction = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const result = await request("/api/chat", action, payload);
    if (action === "threads") setUnreadChats(countUnread(result));
    if (["mark_read", "send_message"].includes(action)) void refreshUnreadChats();
    return result;
  }, [refreshUnreadChats, request]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (state !== "verified") return;
    void refreshUnreadChats();
    const timer = window.setInterval(() => void refreshUnreadChats(), 15000);
    return () => window.clearInterval(timer);
  }, [state, refreshUnreadChats]);

  const value = useMemo<TelegramSessionContextValue>(() => ({ state, user, profile, counts, favoriteIds, starterGranted, unreadChats, botUsername: BOT_USERNAME, botUrl: BOT_URL, refresh, refreshUnreadChats, callAction, callChatAction, openBot }), [state, user, profile, counts, favoriteIds, starterGranted, unreadChats, refresh, refreshUnreadChats, callAction, callChatAction, openBot]);
  return <TelegramSessionContext.Provider value={value}>{children}</TelegramSessionContext.Provider>;
}

export function useTelegramSession() {
  const value = useContext(TelegramSessionContext);
  if (!value) throw new Error("useTelegramSession must be used inside TelegramSessionProvider");
  return value;
}
