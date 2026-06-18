import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Conlearn",
    short_name: "Conlearn",
    description: "Your AI personal teaching assistant for study planning, practice, and notes.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0a0f",
    theme_color: "#0a0a0f",
    icons: [
      {
        src: "/conlearn-logo.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
