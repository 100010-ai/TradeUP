import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TradeUP",
    short_name: "TradeUP",
    description: "Онлайн-рынок виртуального перекупства",
    start_url: "/",
    display: "standalone",
    background_color: "#11110f",
    theme_color: "#11110f",
    orientation: "portrait",
  };
}
