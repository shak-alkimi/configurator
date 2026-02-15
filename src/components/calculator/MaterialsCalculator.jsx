import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const TAPE_SPECS = {
  '2700k': { watts_per_foot: 4.4, price_per_foot: 12 },
  '3000k': { watts_per_foot: 4.4, price_per_foot: 12 },
  '3500k': { watts_per_foot: 4.4, price_per_foot: 12 },
  'warm_dim': { watts_per_foot: 7.2, price_per_foot: 18 },
  'tunable_white': { watts_per_foot: 9.6, price_per_foot: 24 },
  // Legacy values
  'standard_white': { watts_per_foot: 4.4, price_per_foot: 12 },
  'standard_warm': { watts_per_foot: 4.4, price_per_foot: 12 },
  'rgb': { watts_per_foot: 7.2, price_per_foot: 18 },
  'rgbw': { watts_per_foot: 9.6, price_per_foot: 24 },
  'high_output': { watts_per_foot: 7.2, price_per_foot: 18 }
};

const CHANNEL_SPECS = {
  surface_mount: { price_per_foot: 8 },
  recessed: { price_per_foot: 12 },
  corner: { price_per_foot: 10 },
  none: { price_per_foot: 0 }
};

const DRIVER_SPECS = [
  { max_watts: 60, price: 45, name: "60W Driver" },
  { max_watts: 96, price: 65, name: "96W Driver" }
];

export default function MaterialsCalculator({ runs }) {
  const formatUSD = (amount) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const calculations = React.useMemo(() => {
    // Calculate tape totals by type
    const tapeByType = {};
    let totalWatts = 0;
    
    runs.forEach(run => {
      const type = run.tape_type;
      if (!tapeByType[type]) {
        tapeByType[type] = { feet: 0, watts: 0, cost: 0 };
      }
      const specs = TAPE_SPECS[type] || { watts_per_foot: 4.4, price_per_foot: 12 };
      tapeByType[type].feet += run.length_feet;
      tapeByType[type].watts += run.length_feet * specs.watts_per_foot;
      tapeByType[type].cost += run.length_feet * specs.price_per_foot;
      totalWatts += run.length_feet * specs.watts_per_foot;
    });

    // Calculate channel totals by type
    const channelByType = {};
    runs.forEach(run => {
      const type = run.channel_type;
      if (type !== 'none') {
        if (!channelByType[type]) {
          channelByType[type] = { feet: 0, cost: 0 };
        }
        const specs = CHANNEL_SPECS[type];
        channelByType[type].feet += run.length_feet;
        channelByType[type].cost += run.length_feet * specs.price_per_foot;
      }
    });

    // Calculate required drivers
    const requiredDrivers = [];
    let remainingWatts = totalWatts;
    while (remainingWatts > 0) {
      const driver = DRIVER_SPECS.find(d => d.max_watts >= remainingWatts) || DRIVER_SPECS[DRIVER_SPECS.length - 1];
      requiredDrivers.push(driver);
      remainingWatts -= driver.max_watts;
    }

    // Calculate mounting hardware (clips) - 4 clips per 4' channel section
    const totalClips = runs.reduce((sum, run) => {
      if (run.channel_type === 'none') return sum;
      const sections = Math.ceil(run.length_feet / 4);
      return sum + (sections * 4);
    }, 0);
    const clipSets = Math.ceil(totalClips / 50); // Assume clips come in sets of 50
    const clipCost = clipSets * 15; // $15 per set

    // Calculate totals
    const tapeCost = Object.values(tapeByType).reduce((sum, t) => sum + t.cost, 0);
    const channelCost = Object.values(channelByType).reduce((sum, c) => sum + c.cost, 0);
    const driverCost = requiredDrivers.reduce((sum, d) => sum + d.price, 0);
    const totalCost = tapeCost + channelCost + driverCost + clipCost;

    return {
      tapeByType,
      channelByType,
      requiredDrivers,
      totalClips,
      clipSets,
      clipCost,
      totalWatts,
      tapeCost,
      channelCost,
      driverCost,
      totalCost
    };
  }, [runs]);

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-400">
          Add tape runs to see materials calculation
        </CardContent>
      </Card>
    );
  }

  const formatType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).replace(/k\b/gi, 'K');
  };

  return (
    <div className="space-y-4">
      <Card className="min-w-[320px]">
        <CardHeader>
          <CardTitle className="text-lg">Materials Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tape Light */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Tape Light</h4>
            <div className="space-y-2">
              {Object.entries(calculations.tapeByType).map(([type, data]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-slate-600 whitespace-nowrap">{formatType(type)}</span>
                  <span className="font-medium whitespace-nowrap">{data.feet.toFixed(1)} ft</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Channels */}
          {Object.keys(calculations.channelByType).length > 0 && (
            <>
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Channels (4' sections)</h4>
                <div className="space-y-2">
                  {Object.entries(calculations.channelByType).map(([type, data]) => {
                    const sections = Math.ceil(data.feet / 4);
                    return (
                      <div key={type} className="flex justify-between text-sm">
                        <span className="text-slate-600 whitespace-nowrap">{formatType(type)}</span>
                        <span className="font-medium whitespace-nowrap">{sections} sections ({data.feet.toFixed(1)} ft)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Drivers */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Power Drivers</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-500">
                <span className="whitespace-nowrap">Total Power Required:</span>
                <span className="whitespace-nowrap">{calculations.totalWatts.toFixed(1)}W</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 whitespace-nowrap">Power Drivers</span>
                <span className="font-medium whitespace-nowrap">{calculations.requiredDrivers.length} units</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Mounting Hardware */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Mounting Hardware</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 whitespace-nowrap">Mounting Clips</span>
                <span className="font-medium whitespace-nowrap">{calculations.clipSets} sets ({calculations.totalClips} clips)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Summary */}
      <Card className="border-black min-w-[320px]" style={{ backgroundColor: '#000000' }}>
        <CardHeader className="relative">
          <CardTitle className="text-lg text-white">Quote Summary</CardTitle>
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698fc81203f85a20f281d9dc/8dbb9078f_Screenshot2026-02-14155939.png" 
            alt="Logo" 
            className="absolute top-4 right-6 h-8"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-300 whitespace-nowrap">Tape Light</span>
            <span className="font-medium text-white whitespace-nowrap">${formatUSD(calculations.tapeCost)}</span>
          </div>
          {calculations.channelCost > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-300 whitespace-nowrap">Channels</span>
              <span className="font-medium text-white whitespace-nowrap">${formatUSD(calculations.channelCost)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-300 whitespace-nowrap">Power Drivers</span>
            <span className="font-medium text-white whitespace-nowrap">${formatUSD(calculations.driverCost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-300 whitespace-nowrap">Mounting Hardware</span>
            <span className="font-medium text-white whitespace-nowrap">${formatUSD(calculations.clipCost)}</span>
          </div>
          <Separator className="bg-slate-600" />
          <div className="flex justify-between text-lg font-semibold">
            <span className="text-white whitespace-nowrap">Project Total</span>
            <span className="text-white whitespace-nowrap">${formatUSD(calculations.totalCost)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}