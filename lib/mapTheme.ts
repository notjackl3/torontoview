/**
 * Map base-style palettes. "satellite" keeps the existing dusky-realistic look
 * the renderers were originally tuned for; "light" is an Apple Maps-inspired
 * scheme — warm cream ground, soft gray roads with white centerlines, sage
 * parks, pale-blue water. The palette is applied uniformly by the layer
 * renderers so toggling the base style stays visually coherent.
 */

export type MapStyle = "satellite" | "light";

export interface MapThemePalette {
  ground: number;
  sky: { top: number; bottom: number };
  fog: number;
  road: {
    arterial: number;
    secondary: number;
    tertiary: number;
    residential: number;
    centerLine: number;
  };
  park: {
    park: number;
    golf: number;
    cemetery: number;
    openSpace: number;
    agriculture: number;
    fallback: number;
  };
  water: {
    shallow: number;
    mid: number;
    deep: number;
    sun: number;
    line: number;
  };
  tree: {
    /** Multiplier applied to existing per-species foliage tint (0..1+). */
    foliageLightness: number;
  };
  zoning: {
    /** Mesh opacity for zoning polygons. */
    opacity: number;
  };
}

export const MAP_THEMES: Record<MapStyle, MapThemePalette> = {
  satellite: {
    ground: 0xece7dc,
    sky: { top: 0xcadbe9, bottom: 0xeeece2 },
    fog: 0xece7dc,
    road: {
      arterial: 0x6a6a6a,
      secondary: 0x7a7a7a,
      tertiary: 0x8a8a8a,
      residential: 0x9a9a9a,
      centerLine: 0xf5f1e0,
    },
    park: {
      park: 0x2f7a3a,
      golf: 0x4ea061,
      cemetery: 0x5a6b4a,
      openSpace: 0x4a7349,
      agriculture: 0x7a8a3a,
      fallback: 0x3d8a4a,
    },
    water: {
      shallow: 0x5d92b0,
      mid: 0x568dab,
      deep: 0x4f88a6,
      sun: 0xfff1c8,
      line: 0x6aa0bc,
    },
    tree: { foliageLightness: 1.0 },
    zoning: { opacity: 0.5 },
  },
  light: {
    // Apple-Maps style: warm beige ground (the "block fill"), bright white
    // road ribbons that pop against it, sage parks, pale lake-blue water.
    // Roads must be LIGHTER than the ground, not darker — otherwise on a
    // cream background they read as faint smudges and the network looks
    // "broken" between visible buildings.
    ground: 0xece1c6,
    sky: { top: 0xc7dcec, bottom: 0xf5f0e6 },
    fog: 0xf0eadd,
    road: {
      // Mid cool greys — they read against the warm beige the way the sage
      // parks do, and because the material is unlit (see roadRenderer) the
      // color is exactly what you see regardless of sun angle. Avoids the
      // morning-sun blowout that pure-white asphalt suffered from.
      arterial: 0x9ea4ad,
      secondary: 0xacb1ba,
      tertiary: 0xbabec6,
      residential: 0xc7cad1,
      centerLine: 0xf5f1e0,
    },
    park: {
      // Soft sage/mint family. Lighter than satellite mode but saturated enough
      // to read against the cream ground from any altitude.
      park: 0xc6deb6,
      golf: 0xb8d6a4,
      cemetery: 0xcad9bd,
      openSpace: 0xcfe2c0,
      agriculture: 0xdde2a8,
      fallback: 0xc9dfb8,
    },
    water: {
      // Pale lake blue — closer to Apple's water surface in light mode.
      shallow: 0xb8d5e6,
      mid: 0xacccdf,
      deep: 0xa2c3d9,
      sun: 0xfffbe8,
      line: 0x9cc3da,
    },
    tree: { foliageLightness: 1.18 },
    // Zoning sits at renderOrder 9999 with depthTest off so it always draws
    // on top of parks/water where they overlap. Opacity stays high enough
    // that the zone color is the dominant read but the cream ground hints
    // through (so the layer feels like an overlay, not a flat fill).
    zoning: { opacity: 0.72 },
  },
};

export function getTheme(style: MapStyle | undefined): MapThemePalette {
  return MAP_THEMES[style === "light" ? "light" : "satellite"];
}
