// Shared calculation utilities for tape light projects
import { TAPE_SPECS, CHANNEL_SPECS, DRIVER_SPECS, DRIVER_LOAD_FACTOR, CLIPS_PER_SECTION, CLIPS_PER_SET, CLIP_SET_PRICE, SPOOL_LENGTH_FEET, SHIPPING_RATE } from "@/components/calculator/constants";

export function calculateTotalPrice(runs) {
  if (!runs || runs.length === 0) return 0;

  // Calculate tape and channel costs
  let tapeCost = 0;
  let channelCost = 0;
  let totalWatts = 0;
  
  runs.forEach(run => {
    const tapeSpec = TAPE_SPECS[run.tape_type];
    const channelSpec = CHANNEL_SPECS[run.channel_type];
    
    if (tapeSpec) {
      tapeCost += run.length_feet * tapeSpec.price_per_foot;
      totalWatts += run.length_feet * tapeSpec.watts_per_foot;
    }
    
    if (channelSpec && run.channel_type !== 'none') {
      const sections = Math.ceil(run.length_feet / 4);
      const actualFeet = sections * 4;
      channelCost += actualFeet * channelSpec.price_per_foot;
    }
  });

  // Calculate drivers
  const driversNeeded = Math.ceil(totalWatts / (DRIVER_SPECS[0].max_watts * DRIVER_LOAD_FACTOR));
  const driverCost = driversNeeded * DRIVER_SPECS[0].price;

  // Calculate mounting hardware (clips)
  const totalSections = runs.reduce((sum, run) => {
    if (run.channel_type !== 'none') {
      return sum + Math.ceil(run.length_feet / 4);
    }
    return sum;
  }, 0);
  const totalClips = totalSections * CLIPS_PER_SECTION;
  const clipSets = Math.ceil(totalClips / CLIPS_PER_SET);
  const clipCost = clipSets * CLIP_SET_PRICE;

  // Calculate connectors
  const tapeToTapeConnectors = runs.reduce((sum, run) => {
    const spoolsNeeded = Math.ceil(run.length_feet / SPOOL_LENGTH_FEET);
    return sum + Math.max(0, spoolsNeeded - 1);
  }, 0);
  // Connector costs are not included in total as per current business logic

  // Calculate subtotal and shipping
  const subtotal = tapeCost + channelCost + driverCost + clipCost;
  const shippingCost = subtotal * SHIPPING_RATE;

  return subtotal + shippingCost;
}

export function calculateDriverGroups(runs, drivers) {
  // Build a lookup from driver name -> maxWatts
  const driverMaxWattsMap = {};
  if (drivers && drivers.length > 0) {
    drivers.forEach(d => {
      driverMaxWattsMap[d.name] = d.maxWatts;
    });
  }

  const groups = {};
  runs.forEach(run => {
    const group = run.driver_group || 'Unassigned';
    if (!groups[group]) groups[group] = { runs: [], totalWatts: 0 };
    groups[group].runs.push(run);
    const spec = TAPE_SPECS[run.tape_type];
    if (spec) groups[group].totalWatts += run.length_feet * spec.watts_per_foot;
  });
  return Object.entries(groups).map(([name, data]) => {
    const maxWatts = driverMaxWattsMap[name] ?? DRIVER_SPECS[0].max_watts;
    const totalWatts = parseFloat(data.totalWatts.toFixed(1));
    return {
      name,
      totalWatts,
      maxWatts,
      loadPercent: maxWatts > 0 ? Math.round((totalWatts / maxWatts) * 100) : 0,
      overloaded: totalWatts > maxWatts,
      runs: data.runs,
    };
  });
}

export function calculateRunCost(run) {
  const tapeSpec = TAPE_SPECS[run.tape_type];
  const channelSpec = CHANNEL_SPECS[run.channel_type];
  
  if (!tapeSpec || !channelSpec) return 0;
  
  const tapeCost = run.length_feet * tapeSpec.price_per_foot;
  
  // Use rounded-up 4' sections for channel cost (same as MaterialsCalculator)
  let channelCost = 0;
  if (run.channel_type !== 'none') {
    const sections = Math.ceil(run.length_feet / 4);
    const actualFeet = sections * 4;
    channelCost = actualFeet * channelSpec.price_per_foot;
  }
  
  return tapeCost + channelCost;
}