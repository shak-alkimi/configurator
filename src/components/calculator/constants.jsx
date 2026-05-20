// Pricing constants for tape light calculations.
//
// Source of truth lives in `base44/shared/pricing.js` so the Base44 server
// functions (Deno) and the frontend (Vite) read the same values. Do not edit
// the prices/specs here — edit them in pricing.js and they will flow through.

export {
  TAPE_SPECS,
  CHANNEL_SPECS,
  DRIVER_SPECS,
  DEFAULT_DRIVER_MAX_WATTS,
  DRIVER_LOAD_FACTOR,
  CLIPS_PER_SECTION,
  CLIPS_PER_SET,
  CLIP_SET_PRICE,
  SPOOL_LENGTH_FEET,
  SHIPPING_RATE,
} from "../../../base44/shared/pricing.js";
