import AppShell from "@/components/app-shell";
import ChatThread from "@/components/chat-thread";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><ChatThread id={id} /></AppShell>;
}
