"use client";

/* Telegram profile photos can come from arbitrary remote hosts. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/icon";
import NotificationLayer from "@/components/notification-layer";
import { useTelegramSession } from "@/components/telegram-session";
import { rubles } from "@/lib/product";

type NavItem = { href: string; label: string; icon: IconName };

const navItems: readonly NavItem[] = [
  { href: "/", label: "Рынок", icon: "search" },
  { href: "/favorites", label: "Избранное", icon: "heart" },
  { href: "/sell", label: "Объявления", icon: "list" },
  { href: "/messages", label: "Чаты", icon: "message" },
  { href: "/profile", label: "Профиль", icon: "user" },
];

function compactBadge(value: number) {
  return value > 9 ? "9+" : String(Math.max(0, value));
}

function ProfileAvatar({ src, initial }: { src?: string | null; initial: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <span>{initial}</span>;
  return <img src={src} alt="" decoding="async" onError={() => setFailed(true)} />;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const session = useTelegramSession();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);
  const initial = session.user?.first_name?.trim().charAt(0).toUpperCase() || "T";
  const flowMode = pathname.startsWith("/messages/") || pathname.startsWith("/sell/new");
  const balanceLabel = session.profile ? rubles(session.profile.balance) : "";

  useEffect(() => setNotificationsOpen(false), [pathname]);

  const sessionMessage = session.state === "browser"
    ? "Покупки и чаты доступны внутри Telegram"
    : session.state === "unavailable" || session.state === "error"
      ? "Telegram-сессия временно недоступна"
      : "Покупки и чаты доступны в Telegram";

  return (
    <div className={`appRoot ${flowMode ? "flowMode" : ""}`}>
      <NotificationLayer open={notificationsOpen} onClose={closeNotifications} />

      {!flowMode && (
        <header className="appHeader">
          <Link prefetch={false} href="/" className="brandLockup" aria-label="TradeUP, на рынок">
            <span className="brandWord">Trade</span><span className="brandUp">UP</span>
          </Link>
          <div className="headerActions">
            {session.state === "verified" && (
              <button
                type="button"
                className="notificationBell"
                aria-label={session.unreadNotifications > 0 ? `Уведомления, непрочитанных: ${session.unreadNotifications}` : "Уведомления"}
                aria-expanded={notificationsOpen}
                aria-controls="tradeup-notification-center"
                onClick={() => setNotificationsOpen(true)}
              >
                <Icon name="bell" size={20} />
                {session.unreadNotifications > 0 && <i aria-hidden="true">{compactBadge(session.unreadNotifications)}</i>}
              </button>
            )}
            {session.profile ? (
              <Link prefetch={false} href="/profile" className="balanceButton" aria-label={`Баланс: ${balanceLabel}`}>
                <strong>{balanceLabel}</strong>
              </Link>
            ) : (
              <button className="connectButton" type="button" onClick={session.openBot} disabled={session.state === "checking"}>
                {session.state === "checking" ? "Проверяем…" : "Войти"}
              </button>
            )}
            <Link prefetch={false} href="/profile" className="avatarButton" aria-label="Открыть профиль">
              <ProfileAvatar src={session.profile?.photo_url} initial={initial} />
            </Link>
          </div>
        </header>
      )}

      {session.state !== "verified" && session.state !== "checking" && !flowMode && (
        <div className="sessionStrip" role="status">
          <span>{sessionMessage}</span>
          <button type="button" onClick={session.openBot}>Открыть</button>
        </div>
      )}

      <main className={flowMode ? "pageCanvas flowCanvas" : "pageCanvas"}>{children}</main>

      {!flowMode && (
        <nav className="bottomBar" aria-label="Основная навигация">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                prefetch={false}
                key={item.href}
                href={item.href}
                className={`bottomItem ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="bottomIcon"><Icon name={item.icon} size={21} /></span>
                <span>{item.label}</span>
                {item.href === "/messages" && session.unreadChats > 0 && (
                  <i className="navUnread" aria-label={`Непрочитанных чатов: ${session.unreadChats}`}>{compactBadge(session.unreadChats)}</i>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
