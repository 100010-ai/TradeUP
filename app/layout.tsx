import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./telegram.css";

export const metadata: Metadata = {
  title: "TradeUP",
  description: "Онлайн-игра про виртуальное перекупство",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f4f2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js?63"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
