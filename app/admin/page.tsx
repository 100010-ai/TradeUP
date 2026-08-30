import type { Metadata } from "next";
import AdminDashboardV2 from "@/components/admin-dashboard-v2";

export const metadata: Metadata = { title: "Admin · TradeUP", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminDashboardV2 />;
}
