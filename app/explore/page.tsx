import { Suspense } from "react";
import AppShell from "@/components/app-shell";
import ExploreCenter from "@/components/explore-center";

export default function ExplorePage(){
  return <AppShell><Suspense fallback={<div className="depthLoading"><i/><i/><i/></div>}><ExploreCenter/></Suspense></AppShell>;
}
