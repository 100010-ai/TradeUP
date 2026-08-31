"use client";

import Link from "next/link";
import AppShell from "@/components/app-shell";
import Icon from "@/components/icon";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppShell>
      <div className="routeStatePage" role="alert">
        <Icon name="info" size={32} />
        <h1>Что-то не загрузилось</h1>
        <p>Данные не потерялись. Можно повторить запрос или вернуться на рынок.</p>
        <div className="routeStateActions">
          <button type="button" className="inlineAction primary" onClick={reset}>Повторить</button>
          <Link className="inlineAction" href="/">На рынок</Link>
        </div>
      </div>
    </AppShell>
  );
}
