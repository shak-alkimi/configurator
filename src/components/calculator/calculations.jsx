// Shared calculation utilities for tape light projects
import { TAPE_SPECS, CHANNEL_SPECS, DRIVER_SPECS, DEFAULT_DRIVER_MAX_WATTS, DRIVER_LOAD_FACTOR, CLIPS_PER_SECTION, CLIPS_PER_SET, CLIP_SET_PRICE, SHIPPING_RATE } from "@/components/calculator/constants";

// Format a fractional feet value as `Xft Yin` with correct rollover.
// Rounding in total inches first avoids the `5.99 -> 5ft 12in` bug.
export function formatFeetInches(lengthFeet) {
  const totalIn = Math.round((lengthFeet || 0) * 12);
  const ft = Math.floor(totalIn / 12);
  const inches = totalIn % 12;
  return `${ft}ft ${inches}in`;
}

// snake_or_lower → Title Case (e.g. `corner` → `Corner`).
export function titleCase(s) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Channel housing is billed in whole 4-ft sections. Returns the rounded-up
// section count for a single run (zero if the run uses no channel).
export function channelSectionsFor(run) {
  if (!run || !run.length_feet || !run.channel_type || run.channel_type === 'none') return 0;
  return Math.ceil(run.length_feet / 4);
}

export function channelCostFor(run) {
  const sections = channelSectionsFor(run);
  const spec = CHANNEL_SPECS[run?.channel_type];
  if (!sections || !spec) return 0;
  return sections * 4 * spec.price_per_foot;
}

// Convert a total mounting-section count to clips → sets → cost.
export function clipsForSections(sectionCount) {
  const totalClips = sectionCount * CLIPS_PER_SECTION;
  const sets = Math.ceil(totalClips / CLIPS_PER_SET);
  return { totalClips, sets, cost: sets * CLIP_SET_PRICE };
}

// Drivers needed for a given total wattage, sized to the default driver
// at the load factor. Used as a fallback when no driver list is configured.
export function driversNeededForWatts(totalWatts) {
  const spec = DRIVER_SPECS[DEFAULT_DRIVER_MAX_WATTS];
  return Math.ceil((totalWatts || 0) / (spec.max_watts * DRIVER_LOAD_FACTOR));
}

// Price a configured driver list, or fall back to a watts-derived count.
// Returns { count, cost, specs[] }.
export function priceDrivers(drivers, totalWatts) {
  if (drivers && drivers.length > 0) {
    const specs = drivers.map(d => DRIVER_SPECS[d.maxWatts]).filter(Boolean);
    const cost = specs.reduce((sum, s) => sum + s.price, 0);
    return { count: drivers.length, cost, specs };
  }
  const defaultSpec = DRIVER_SPECS[DEFAULT_DRIVER_MAX_WATTS];
  const count = driversNeededForWatts(totalWatts);
  return { count, cost: count * defaultSpec.price, specs: new Array(count).fill(defaultSpec) };
}

export function calculateTotalPrice(runs, drivers) {
  if (!runs || runs.length === 0) return 0;

  let tapeCost = 0;
  let channelCost = 0;
  let totalWatts = 0;
  let totalSections = 0;

  runs.forEach(run => {
    if (!run || !run.length_feet || !run.tape_output) return;
    const tapeSpec = TAPE_SPECS[run.tape_output];
    if (tapeSpec) {
      tapeCost += run.length_feet * tapeSpec.price_per_foot;
      totalWatts += run.length_feet * tapeSpec.watts_per_foot;
    }
    channelCost += channelCostFor(run);
    totalSections += channelSectionsFor(run);
  });

  const driverCost = priceDrivers(drivers, totalWatts).cost;
  const clipCost = clipsForSections(totalSections).cost;

  const subtotal = tapeCost + channelCost + driverCost + clipCost;
  return subtotal + subtotal * SHIPPING_RATE;
}

export function calculateRunCost(run) {
  if (!run || !run.length_feet || !run.tape_output) return 0;
  const tapeSpec = TAPE_SPECS[run.tape_output];
  if (!tapeSpec) return 0;
  return run.length_feet * tapeSpec.price_per_foot + channelCostFor(run);
}