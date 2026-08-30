import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TradeUP",
    short_name: "TradeUP",
    description: "Онлайн-игра про виртуальное перекупство",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f4",
    theme_color: "#f6f6f4",
    orientation: "portrait",
  };
}
