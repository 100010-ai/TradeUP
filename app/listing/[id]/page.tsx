import AppShell from "@/components/app-shell";
import ListingDetail from "@/components/listing-detail";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><ListingDetail id={id} /></AppShell>;
}
