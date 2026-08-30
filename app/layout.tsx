import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { TelegramSessionProvider } from "@/components/telegram-session";
import "./globals.css";
import "./product-plus.css";
import "./dark-redesign.css";

export const metadata: Metadata = {
  title: { default: "TradeUP", template: "%s · TradeUP" },
  description: "Онлайн-игра про виртуальное перекупство. Покупай дешевле, продавай дороже и расти на живом рынке игроков.",
  applicationName: "TradeUP",
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0d0f0d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head><Script src="https://telegram.org/js/telegram-web-app.js?63" strategy="beforeInteractive" /></head>
      <body><TelegramSessionProvider>{children}</TelegramSessionProvider></body>
    </html>
  );
}
