"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BOT_URL,
  BOT_USERNAME,
  type PlayerProfile,
  type SessionCounts,
  type TelegramUser,
} from "@/lib/product";

type SessionState = "checking" | "verified" | "browser" | "unavailable" | "error";

type BootstrapPayload = {
  ok?: boolean;
  user?: TelegramUser;
  profile?: PlayerProfile;
  starterGranted?: number;
  counts?: SessionCounts;
  favoriteIds?: string[];
  error?: string;
};

type ActionResult = Record<string, unknown> & {
  ok?: boolean;
  error?: string;
  profile?: PlayerProfile;
};

type TelegramSessionContextValue = {
  state: SessionState;
  user: TelegramUser | null;
  profile: PlayerProfile | null;
  counts: SessionCounts;
  favoriteIds: Set<string>;
  starterGranted: number;
  botUsername: string;
  botUrl: string;
  refresh: () => Promise<void>;
  callAction: (action: string, payload?: Record<string, unknown>) => Promise<ActionResult>;
  openBot: () => void;
};

const defaultCounts: SessionCounts = { inventory: 0, listings: 0, favorites: 0 };
const TelegramSessionContext = createContext<TelegramSessionContextValue | null>(null);

function getInitData() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp?.initData ?? "" : "";
}

export function TelegramSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>("checking");
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [counts, setCounts] = useState<SessionCounts>(defaultCounts);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [starterGranted, setStarterGranted] = useState(0);

  const openBot = useCallback(() => {
    window.location.href = BOT_URL;
  }, []);

  const refresh = useCallback(async () => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      setState("browser");
      return;
    }

    webApp.ready();
    webApp.expand();

    if (!webApp.initData) {
      setState("unavailable");
      return;
    }

    try {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
        cache: "no-store",
      });
      const payload = (await response.json()) as BootstrapPayload;
      if (!response.ok || !payload.ok || !payload.user || !payload.profile) {
        throw new Error(payload.error ?? "telegram_auth_failed");
      }

      setUser(payload.user);
      setProfile(payload.profile);
      setCounts(payload.counts ?? defaultCounts);
      setFavoriteIds(new Set(payload.favoriteIds ?? []));
      setStarterGranted(Number(payload.starterGranted ?? 0));
      setState("verified");
    } catch {
      setState("error");
    }
  }, []);

  const callAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      const initData = getInitData();
      if (!initData) {
        throw new Error("telegram_required");
      }

      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, action, payload }),
        cache: "no-store",
      });
      const result = (await response.json()) as ActionResult;
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "game_action_failed");
      }

      if (result.profile) setProfile(result.profile);
      if (action === "toggle_favorite" && typeof result.favorite === "boolean" && typeof payload.listingId === "string") {
        setFavoriteIds((current) => {
          const next = new Set(current);
          if (result.favorite) next.add(payload.listingId as string);
          else next.delete(payload.listingId as string);
          return next;
        });
      }
      if (["create_listing", "cancel_listing", "buy_listing"].includes(action)) {
        await refresh();
      }
      return result;
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<TelegramSessionContextValue>(
    () => ({
      state,
      user,
      profile,
      counts,
      favoriteIds,
      starterGranted,
      botUsername: BOT_USERNAME,
      botUrl: BOT_URL,
      refresh,
      callAction,
      openBot,
    }),
    [state, user, profile, counts, favoriteIds, starterGranted, refresh, callAction, openBot],
  );

  return <TelegramSessionContext.Provider value={value}>{children}</TelegramSessionContext.Provider>;
}

export function useTelegramSession() {
  const value = useContext(TelegramSessionContext);
  if (!value) throw new Error("useTelegramSession must be used inside TelegramSessionProvider");
  return value;
}
