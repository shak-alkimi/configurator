// Shared calculation utilities for tape light projects
import { TAPE_SPECS, CHANNEL_SPECS, DRIVER_SPECS, DRIVER_LOAD_FACTOR, CLIPS_PER_SECTION, CLIPS_PER_SET, CLIP_SET_PRICE, SPOOL_LENGTH_FEET, SHIPPING_RATE } from "@/components/calculator/constants";

export function calculateTotalPrice(runs) {
  if (!runs || runs.length === 0) return 0;

  let tapeCost = 0;
  let channelCost = 0;
  let totalWatts = 0;
  
  runs.forEach(run => {
    if (!run || !run.length_feet || !run.tape_output) return;
    const tapeSpec = TAPE_SPECS[run.tape_output];
    const channelSpec = run.channel_type ? CHANNEL_SPECS[run.channel_type] : null;
    
    if (tapeSpec) {
      tapeCost += run.length_feet * tapeSpec.price_per_foot;
      totalWatts += run.length_feet * tapeSpec.watts_per_foot;
    }
    
    if (channelSpec) {
      const sections = Math.ceil(run.length_feet / 4);
      const actualFeet = sections * 4;
      channelCost += actualFeet * channelSpec.price_per_foot;
    }
  });

  const driversNeeded = Math.ceil(totalWatts / (DRIVER_SPECS[0].max_watts * DRIVER_LOAD_FACTOR));
  const driverCost = driversNeeded * DRIVER_SPECS[0].price;

  const totalSections = runs.reduce((sum, run) => {
    if (!run || !run.length_feet) return sum;
    if (run.channel_type !== 'none') {
      return sum + Math.ceil(run.length_feet / 4);
    }
    return sum;
  }, 0);
  const totalClips = totalSections * CLIPS_PER_SECTION;
  const clipSets = Math.ceil(totalClips / CLIPS_PER_SET);
  const clipCost = clipSets * CLIP_SET_PRICE;

  const subtotal = tapeCost + channelCost + driverCost + clipCost;
  const shippingCost = subtotal * SHIPPING_RATE;

  return subtotal + shippingCost;
}


export function calculateRunCost(run) {
  if (!run || !run.length_feet || !run.tape_output) return 0;
  const tapeSpec = TAPE_SPECS[run.tape_output];
  if (!tapeSpec) return 0;
  
  const tapeCost = run.length_feet * tapeSpec.price_per_foot;
  
  let channelCost = 0;
  if (run.channel_type) {
    const channelSpec = CHANNEL_SPECS[run.channel_type];
    if (channelSpec) {
      const sections = Math.ceil(run.length_feet / 4);
      const actualFeet = sections * 4;
      channelCost = actualFeet * channelSpec.price_per_foot;
    }
  }
  
  return tapeCost + channelCost;
}