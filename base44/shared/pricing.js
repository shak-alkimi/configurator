// Canonical pricing constants. FRONTEND-ONLY IMPORT.
//
// PRIOR ASSUMPTION (proved wrong 2026-05-25, root cause of tasks #11 + #98):
// This file was originally meant to be shared between the frontend and the
// Base44 Deno functions. It is NOT. Per memory:alkimi-base44-sync, Base44's
// Deno bundler cannot resolve relative imports out of base44/shared/, so
// `import ... from '../../shared/pricing.js'` in any function silently fails
// the draft deploy and production serves stale/broken — every call 500s.
//
// CURRENT USAGE:
//   - src/components/calculator/constants.jsx — imports from here (via Vite,
//     which resolves fine).
//   - base44/functions/exportProjectPDF/entry.ts — INLINES this content.
//   - base44/functions/exportProjectCSV/entry.ts — INLINES this content.
//
// AUDIT (AGENTS.md Alkimi-specific trigger): edits here MUST be mirrored to
// both Deno function copies. Duplication is the cost of the platform
// limitation. Do NOT add new Deno function imports from this file.
//
// Plain ES module so the Vite-side import resolves cleanly. Don't add JSX,
// TypeScript syntax, or Node-only APIs.

export const TAPE_SPECS = {
  "300lm (3.0w/ft)": {
    price_per_foot: 10,
    watts_per_foot: 3.0,
    lumens_per_foot: 300,
  },
  "360lm (3.6w/ft)": {
    price_per_foot: 11,
    watts_per_foot: 3.6,
    lumens_per_foot: 360,
  },
  "600lm (6.0w/ft)": {
    price_per_foot: 12,
    watts_per_foot: 6.0,
    lumens_per_foot: 600,
  },
};

export const CHANNEL_SPECS = {
  corner: { price_per_foot: 10, clips_per_4ft: 4 },
  surface: { price_per_foot: 8, clips_per_4ft: 4 },
  none: { price_per_foot: 0, clips_per_4ft: 0 },
};

// Keyed by max wattage so a project's actual driver mix can be priced correctly.
export const DRIVER_SPECS = {
  60: { max_watts: 60, price: 55, name: "60W Driver" },
  96: { max_watts: 96, price: 65, name: "96W Driver" },
};

// Default driver used when a project has no explicit driver list (fallback only).
export const DEFAULT_DRIVER_MAX_WATTS = 96;

// Load drivers to 80% capacity when sizing the fallback count.
export const DRIVER_LOAD_FACTOR = 0.8;

// 4 clips per 4-ft channel section.
export const CLIPS_PER_SECTION = 4;
// Clips ship in sets of 12.
export const CLIPS_PER_SET = 12;
export const CLIP_SET_PRICE = 15;

// 16' 4" per spool of tape — one tape-to-tape connector per spool join.
export const SPOOL_LENGTH_FEET = 16 + (4 / 12);

// 10% of subtotal applied as shipping.
export const SHIPPING_RATE = 0.10;
