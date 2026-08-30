import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { TelegramSessionProvider } from "@/components/telegram-session";
import "./globals.css";
import "./product-plus.css";
import "./dark-redesign.css";
import "./avito-flat.css";
import "./flat-extras.css";
import "./no-panels.css";

export const metadata: Metadata = {
  title: { default: "TradeUP", template: "%s · TradeUP" },
  description: "Онлайн-рынок виртуального перекупства между игроками.",
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
  themeColor: "#0f0f0e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><head><Script src="https://telegram.org/js/telegram-web-app.js?63" strategy="beforeInteractive" /></head><body><TelegramSessionProvider>{children}</TelegramSessionProvider></body></html>;
}
