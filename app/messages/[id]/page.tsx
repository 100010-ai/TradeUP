import AppShell from "@/components/app-shell";
import ChatThread from "@/components/chat-thread";
import SystemChatThread from "@/components/system-chat-thread";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "tradeup" || id === "support") return <AppShell><SystemChatThread channel={id}/></AppShell>;
  return <AppShell><ChatThread id={id} /></AppShell>;
}
