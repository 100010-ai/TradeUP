"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/icon";
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const session = useTelegramSession();
  const initial = session.user?.first_name?.trim().charAt(0).toUpperCase() || "T";
  const flowMode = pathname.startsWith("/messages/") || pathname.startsWith("/sell/new");

  return (
    <div className={`appRoot ${flowMode ? "flowMode" : ""}`}>
      {!flowMode && <header className="appHeader">
        <Link prefetch={false} href="/" className="brandLockup" aria-label="TradeUP"><span className="brandWord">Trade</span><span className="brandUp">UP</span></Link>
        <div className="headerActions">
          {session.profile ? <Link prefetch={false} href="/profile" className="balanceButton"><strong>{rubles(session.profile.balance)}</strong></Link> : <button className="connectButton" type="button" onClick={session.openBot}>{session.state === "checking" ? "..." : "Войти"}</button>}
          <Link prefetch={false} href="/profile" className="avatarButton" aria-label="Профиль">{session.profile?.photo_url ? <img src={session.profile.photo_url} alt="" decoding="async" /> : <span>{initial}</span>}</Link>
        </div>
      </header>}

      {session.state !== "verified" && session.state !== "checking" && !flowMode && <div className="sessionStrip"><span>Покупки и чаты доступны в Telegram</span><button type="button" onClick={session.openBot}>Открыть</button></div>}

      <main className={flowMode ? "pageCanvas flowCanvas" : "pageCanvas"}>{children}</main>

      {!flowMode && <nav className="bottomBar" aria-label="Навигация">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <Link prefetch={false} key={item.href} href={item.href} className={`bottomItem ${active ? "active" : ""}`}>
            <span className="bottomIcon"><Icon name={item.icon} size={21} /></span><span>{item.label}</span>
            {item.href === "/messages" && session.unreadChats > 0 && <i className="navUnread">{Math.min(session.unreadChats, 9)}</i>}
          </Link>;
        })}
      </nav>}
    </div>
  );
}
