// Shared constants for tape light calculations

export const TAPE_SPECS = {
  "2w": { 
    price_per_foot: 10, 
    watts_per_foot: 2.5, 
    lumens_per_foot: 200 
  },
  "4w": { 
    price_per_foot: 12, 
    watts_per_foot: 5.0, 
    lumens_per_foot: 400 
  },
  "3w": { 
    price_per_foot: 10, 
    watts_per_foot: 3.0, 
    lumens_per_foot: 300 
  },
  "6w": { 
    price_per_foot: 12, 
    watts_per_foot: 6.0, 
    lumens_per_foot: 600 
  }
};

export const CHANNEL_SPECS = {
  corner: { 
    price_per_foot: 10, 
    clips_per_4ft: 4 
  },
  recessed: { 
    price_per_foot: 12, 
    clips_per_4ft: 4 
  },
  surface: { 
    price_per_foot: 8, 
    clips_per_4ft: 4 
  },
  none: { 
    price_per_foot: 0, 
    clips_per_4ft: 0 
  }
};

export const DRIVER_SPECS = [
  { max_watts: 96, price: 65, name: "96W Driver" }
];

export const DRIVER_LOAD_FACTOR = 0.8; // Load drivers to 80% capacity
export const CLIPS_PER_SECTION = 4; // 4 clips per 4' section
export const CLIPS_PER_SET = 12; // Clips come in sets of 12
export const CLIP_SET_PRICE = 15; // $15 per set
export const SPOOL_LENGTH_FEET = 16 + (4 / 12); // 16'4" per spool
export const SHIPPING_RATE = 0.10; // 10% of subtotal