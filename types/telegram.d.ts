export {};

type TelegramWebAppUser = {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
};

type TelegramInset = { top: number; bottom: number; left: number; right: number };
type TelegramEventCallback = (...args: unknown[]) => void;
type TelegramInvoiceStatus = "paid" | "cancelled" | "failed" | "pending";
type TelegramHapticFeedback = {
  impactOccurred?(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred?(type: "error" | "success" | "warning"): void;
  selectionChanged?(): void;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    auth_date?: number;
    start_param?: string;
  };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  isFullscreen?: boolean;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
  HapticFeedback?: TelegramHapticFeedback;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast?(version: string): boolean;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  openTelegramLink?(url: string): void;
  openLink?(url: string, options?: { try_instant_view?: boolean }): void;
  openInvoice?(url: string, callback?: (status: TelegramInvoiceStatus) => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent?(eventType: string, callback: TelegramEventCallback): void;
  offEvent?(eventType: string, callback: TelegramEventCallback): void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}
