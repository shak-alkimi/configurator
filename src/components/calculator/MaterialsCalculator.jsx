import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const TAPE_SPECS = {
  "2w": { watts_per_foot: 2.0, price_per_foot: 10, lumens_per_foot: 200 },
  "4w": { watts_per_foot: 4.0, price_per_foot: 12, lumens_per_foot: 400 }
};

const CHANNEL_SPECS = {
  corner: { price_per_foot: 10, clips_per_foot: 1 },
  recessed: { price_per_foot: 12, clips_per_foot: 1 },
  surface: { price_per_foot: 8, clips_per_foot: 1 },
  none: { price_per_foot: 0, clips_per_foot: 0 }
};

const DRIVER_SPECS = [
  { max_watts: 96, price: 65, name: "96W Driver" }
];

export default function MaterialsCalculator({ runs }) {
  const calculations = React.useMemo(() => {
    // Calculate tape totals by type
    const tapeByType = {};
    let totalWatts = 0;
    
    runs.forEach(run => {
      const type = run.tape_type;
      const specs = TAPE_SPECS[type];
      
      if (!specs) return;
      
      if (!tapeByType[type]) {
        tapeByType[type] = { feet: 0, watts: 0, cost: 0 };
      }
      tapeByType[type].feet += run.length_feet;
      tapeByType[type].watts += run.length_feet * specs.watts_per_foot;
      tapeByType[type].cost += run.length_feet * specs.price_per_foot;
      totalWatts += run.length_feet * specs.watts_per_foot;
    });

    // Calculate channel totals by type
    const channelByType = {};
    runs.forEach(run => {
      const type = run.channel_type;
      const specs = CHANNEL_SPECS[type];
      
      if (type !== 'none' && specs) {
        if (!channelByType[type]) {
          channelByType[type] = { feet: 0, cost: 0 };
        }
        channelByType[type].feet += run.length_feet;
        channelByType[type].cost += run.length_feet * specs.price_per_foot;
      }
    });

    // Calculate required drivers (96W each, loaded to 80% capacity)
    const requiredDrivers = [];
    let remainingWatts = totalWatts;
    while (remainingWatts > 0) {
      const driver = DRIVER_SPECS[0];
      requiredDrivers.push(driver);
      remainingWatts -= driver.max_watts * 0.8;
    }

    // Calculate mounting hardware (clips)
    const totalClips = runs.reduce((sum, run) => {
      const specs = CHANNEL_SPECS[run.channel_type];
      if (!specs) return sum;
      return sum + (run.length_feet * specs.clips_per_foot);
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
          Add runs for breakdown
        </CardContent>
      </Card>
    );
  }

  const formatType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <Card className="bg-[#EEEEEE]">
         <CardHeader>
           <CardTitle className="text-lg">Materials</CardTitle>
         </CardHeader>
         <CardContent className="space-y-4">
          {/* Tape Light */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Tape Light</h4>
            <div className="space-y-2">
              {Object.entries(calculations.tapeByType).map(([type, data]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-slate-600">{formatType(type)}</span>
                  <span className="font-medium">{data.feet.toFixed(1)} ft</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Housing */}
          {Object.keys(calculations.channelByType).length > 0 && (
            <>
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Housing</h4>
                <div className="space-y-2">
                  {Object.entries(calculations.channelByType).map(([type, data]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span className="text-slate-600">{formatType(type)}</span>
                      <span className="font-medium">{data.feet.toFixed(1)} ft</span>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              </>
              )}

          {/* Drivers */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Drivers</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Total Power Required:</span>
                <span>{calculations.totalWatts.toFixed(1)}W</span>
              </div>
              {calculations.requiredDrivers.map((driver, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-slate-600">{driver.name}</span>
                  <span className="font-medium">1 unit</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Mounting Hardware */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Mounting Hardware</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Mounting Clips</span>
                <span className="font-medium">{calculations.clipSets} sets ({calculations.totalClips} clips)</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Termination */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Termination</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Terminal Blocks</span>
                <span className="font-medium">{runs.length} units</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Summary */}
      <Card className="border-black bg-black">
        <CardHeader className="flex flex-row items-start justify-between">
          <CardTitle className="text-lg text-white">Summary</CardTitle>
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698fc81203f85a20f281d9dc/c1dc47ece_Screenshot2026-02-14155939.png" 
            alt="Logo" 
            className="h-8 w-auto"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Tape Light</span>
            <span className="font-medium text-white">${calculations.tapeCost.toFixed(2)}</span>
          </div>
          {calculations.channelCost > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Housing</span>
              <span className="font-medium text-white">${calculations.channelCost.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Power Drivers</span>
            <span className="font-medium text-white">${calculations.driverCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Mounting Hardware</span>
            <span className="font-medium text-white">${calculations.clipCost.toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-semibold">
            <span className="text-white">Total</span>
            <span className="text-white">${calculations.totalCost.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}