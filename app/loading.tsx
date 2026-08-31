import AppShell from "@/components/app-shell";

export default function Loading() {
  return (
    <AppShell>
      <div className="routeStatePage" role="status" aria-live="polite">
        <span className="routeSpinner" aria-hidden="true" />
        <h1>Загружаем TradeUP</h1>
        <p>Подтягиваем рынок и твои данные.</p>
      </div>
    </AppShell>
  );
}
