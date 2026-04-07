/**
 * High-converting interest segments for targeting in Vietnam.
 * Based on common successful personas in Fashion, Tech, and Beauty.
 */
export const VIETNAM_TARGETING_PRESETS = {
  FASHION_ACTIVE: {
    name: "VN Fashion Active",
    geo_locations: { countries: ["VN"] },
    age_min: 18,
    age_max: 45,
    flexible_spec: [
      {
        interests: [
          { id: "6003133611319", name: "Fashion" },
          { id: "6003117565882", name: "Shopping" },
          { id: "6003254924765", name: "Dresses" },
        ],
      },
    ],
  },
  TECH_GADGETS: {
    name: "VN Tech Savvy",
    geo_locations: { countries: ["VN"] },
    age_min: 22,
    age_max: 40,
    flexible_spec: [
      {
        interests: [
          { id: "6002890530752", name: "Technology" },
          { id: "6003131013774", name: "Gadgets" },
          { id: "6002932824641", name: "Smartphones" },
        ],
      },
    ],
  },
  BEAUTY_COSMETICS: {
    name: "VN Beauty Care",
    geo_locations: { countries: ["VN"] },
    age_min: 18,
    age_max: 35,
    flexible_spec: [
      {
        interests: [
          { id: "6003131012974", name: "Beauty" },
          { id: "6003111012774", name: "Cosmetics" },
          { id: "6003131013174", name: "Skin Care" },
        ],
      },
    ],
  },
};

/**
 * Common placement rules for the Vietnam market to optimize CPC.
 * Optimization #7: Removing Audience Network which often has high invalid click rates.
 */
export const OPTIMIZED_PLACEMENTS = {
  publisher_platforms: ["facebook", "instagram", "messenger"],
  facebook_positions: ["feed", "story", "marketplace", "video_feeds"],
  instagram_positions: ["stream", "story", "explore", "reels"],
  device_platforms: ["mobile", "desktop"],
};
