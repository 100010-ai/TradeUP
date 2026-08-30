import AppShell from "@/components/app-shell";
import SellNewCenter from "@/components/sell-new-center";

export default async function SellNewPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item } = await searchParams;
  return <AppShell><SellNewCenter itemId={typeof item === "string" ? item : null} /></AppShell>;
}
