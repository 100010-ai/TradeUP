import Link from "next/link";
import AppShell from "@/components/app-shell";
import Icon from "@/components/icon";

export default function NotFound() {
  return (
    <AppShell>
      <div className="routeStatePage">
        <Icon name="search" size={32} />
        <h1>Такой страницы нет</h1>
        <p>Похоже, ссылка устарела или адрес был набран неправильно.</p>
        <div className="routeStateActions">
          <Link className="inlineAction primary" href="/">На рынок</Link>
        </div>
      </div>
    </AppShell>
  );
}
