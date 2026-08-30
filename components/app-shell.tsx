"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTelegramSession } from "@/components/telegram-session";
import { rubles } from "@/lib/product";

const navItems = [
  { href: "/", label: "Рынок", icon: "⌂" },
  { href: "/favorites", label: "Избранное", icon: "♡" },
  { href: "/sell", label: "Продать", icon: "+", primary: true },
  { href: "/deals", label: "Сделки", icon: "⇄" },
  { href: "/profile", label: "Профиль", icon: "◉" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const session = useTelegramSession();
  const initial = session.user?.first_name?.trim().charAt(0).toUpperCase() || "T";

  return (
    <div className="appRoot">
      <header className="appHeader">
        <Link href="/" className="brandLockup" aria-label="TradeUP">
          <span className="brandWord">Trade</span><span className="brandUp">UP</span>
          <span className="brandDot" />
        </Link>

        <div className="headerActions">
          {session.profile ? (
            <Link href="/profile" className="balanceButton">
              <span>Баланс</span>
              <strong>{rubles(session.profile.balance)}</strong>
            </Link>
          ) : (
            <button className="connectButton" type="button" onClick={session.openBot}>
              {session.state === "checking" ? "Подключаем…" : "Войти"}
            </button>
          )}
          <Link href="/profile" className="avatarButton" aria-label="Профиль">
            {session.profile?.photo_url ? (
              <img src={session.profile.photo_url} alt="" />
            ) : (
              <span>{initial}</span>
            )}
          </Link>
        </div>
      </header>

      {session.state !== "verified" && session.state !== "checking" && (
        <div className="sessionStrip">
          <div>
            <strong>TradeUP работает внутри Telegram</strong>
            <span>
              {session.state === "error"
                ? "Проверь TELEGRAM_BOT_TOKEN в Vercel. Рынок можно смотреть без входа."
                : `Открой @${session.botUsername}, чтобы покупать и продавать.`}
            </span>
          </div>
          <button type="button" onClick={session.openBot}>Открыть</button>
        </div>
      )}

      <main className="pageCanvas">{children}</main>

      <nav className="bottomBar" aria-label="Навигация">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${item.primary ? "bottomItem sellNav" : "bottomItem"} ${active ? "active" : ""}`}
            >
              <span className="bottomIcon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
