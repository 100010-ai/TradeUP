"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon, { type IconName } from "@/components/icon";
import { type PhoneNotification, useTelegramSession } from "@/components/telegram-session";

function iconFor(type: string): IconName {
  if (type === "message" || type === "support") return "message";
  if (type === "offer") return "swap";
  if (type === "purchase" || type === "sale") return "tag";
  return "bell";
}

function relativeTime(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60_000) return "сейчас";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} мин`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч`;
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default function NotificationLayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const session = useTelegramSession();
  const [items, setItems] = useState<PhoneNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState<PhoneNotification | null>(null);
  const baselineId = useRef<string | null>(null);
  const newestSeenAt = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    if (session.state !== "verified") return;
    setLoading(true);
    setLoadError(false);
    try {
      const result = await session.callNotificationAction("list");
      setItems(Array.isArray(result.notifications) ? result.notifications as PhoneNotification[] : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [session.state, session.callNotificationAction]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    const latest = session.latestNotification;
    if (!latest) return;
    const createdAt = new Date(latest.created_at).getTime();

    if (baselineId.current === null) {
      baselineId.current = latest.id;
      if (Number.isFinite(createdAt)) newestSeenAt.current = createdAt;
      return;
    }
    if (baselineId.current === latest.id) return;
    baselineId.current = latest.id;

    if (!Number.isFinite(createdAt) || createdAt <= newestSeenAt.current) return;
    newestSeenAt.current = createdAt;

    setToast(latest);
    try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); } catch { /* optional */ }
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5_500);
  }, [session.latestNotification]);

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);

  async function openNotification(item: PhoneNotification) {
    if (!item.read_at) {
      void session.callNotificationAction("mark_read", { notificationId: item.id });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
    }
    setToast(null);
    onClose();
    if (item.href?.startsWith("/")) router.push(item.href);
  }

  async function markAll() {
    await session.callNotificationAction("mark_all").catch(() => undefined);
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
  }

  return <>
    {toast && !open && (
      <button className="phoneNotificationToast" type="button" onClick={() => void openNotification(toast)} aria-label={`${toast.title}. ${toast.body}`}>
        <span className="phoneNotificationApp"><Icon name={iconFor(toast.type)} size={17}/></span>
        <span className="phoneNotificationCopy"><span className="phoneNotificationMeta"><b>TradeUP</b><time>сейчас</time></span><strong>{toast.title}</strong><small>{toast.body}</small></span>
      </button>
    )}

    {open && (
      <div id="tradeup-notification-center" className="notificationCenter" role="dialog" aria-modal="true" aria-labelledby="tradeup-notification-title">
        <header className="notificationCenterHeader">
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Закрыть уведомления"><Icon name="arrowLeft" size={22}/></button>
          <strong id="tradeup-notification-title">Уведомления</strong>
          <button type="button" className="notificationReadAll" disabled={session.unreadNotifications === 0 || loading} onClick={() => void markAll()}>Прочитать все</button>
        </header>
        <div className="notificationCenterBody" aria-live="polite">
          {loading && <div className="notificationLoading" aria-label="Загрузка уведомлений"><i/><i/><i/></div>}
          {!loading && loadError && (
            <div className="notificationEmpty">
              <Icon name="info" size={30}/><strong>Не удалось обновить</strong><span>Проверь соединение и попробуй ещё раз.</span>
              <button type="button" className="inlineAction" onClick={() => void load()}>Повторить</button>
            </div>
          )}
          {!loading && !loadError && items.length === 0 && <div className="notificationEmpty"><Icon name="bell" size={30}/><strong>Пока тихо</strong><span>Сообщения, предложения и сделки появятся здесь.</span></div>}
          {!loading && !loadError && items.map((item) => (
            <button type="button" key={item.id} className={item.read_at ? "notificationRow" : "notificationRow unread"} onClick={() => void openNotification(item)}>
              <span className="notificationTypeIcon"><Icon name={iconFor(item.type)} size={18}/></span>
              <span className="notificationRowText"><span><strong>{item.title}</strong><time dateTime={item.created_at}>{relativeTime(item.created_at)}</time></span><small>{item.body}</small></span>
              {!item.read_at && <i className="notificationUnreadDot" aria-hidden="true"/>}
            </button>
          ))}
        </div>
      </div>
    )}
  </>;
}
