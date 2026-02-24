// Shared constants for tape light calculations

export const TAPE_SPECS = {
  "2w": { 
    price_per_foot: 10, 
    watts_per_foot: 2.0, 
    lumens_per_foot: 200 
  },
  "4w": { 
    price_per_foot: 12, 
    watts_per_foot: 4.0, 
    lumens_per_foot: 400 
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

export const SPOOL_LENGTH_FEET = 16 + (4 / 12); // 16'4" per spool