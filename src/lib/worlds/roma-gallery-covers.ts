import type { RomaModuleKey } from "@/lib/rome/modules";

/** Curated Unsplash wide stills for Roma catalog cards (see next.config remotePatterns). */
export const ROMA_GALLERY_COVERS: Record<
  RomaModuleKey,
  { url: string; alt: string }
> = {
  roma_gladiator_uprising: {
    url: "https://images.unsplash.com/photo-1552832230-c0197dd311b7?w=1200&q=80",
    alt: "The Colosseum in Rome at dusk",
  },
  roma_senate_intrigue: {
    url: "https://images.unsplash.com/photo-1555993539-1732b0258235?w=1200&q=80",
    alt: "Ancient Roman columns and forum ruins",
  },
  roma_legion_frontier: {
    url: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1200&q=80",
    alt: "Roman legion reenactors in armor",
  },
  roma_pompeii_mystery: {
    url: "https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=1200&q=80",
    alt: "Mount Vesuvius above the Bay of Naples",
  },
  roma_catacomb_cult: {
    url: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&q=80",
    alt: "A narrow stone tunnel lit by warm torchlight",
  },
};
