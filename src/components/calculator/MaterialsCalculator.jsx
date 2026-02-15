import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function MaterialsCalculator({ runs }) {
  const { data: productCatalog = [] } = useQuery({
    queryKey: ['productCatalog'],
    queryFn: () => base44.entities.ProductCatalog.list(),
  });

  const getTapePrice = (variant) => productCatalog.find(p => p.product_type === 'tape' && p.variant === variant)?.price_per_unit || 12;
  const getTapeWatts = (variant) => productCatalog.find(p => p.product_type === 'tape' && p.variant === variant)?.watts_per_foot || 4.4;
  const getChannelPrice = (variant) => productCatalog.find(p => p.product_type === 'channel' && p.variant === variant)?.price_per_unit || 8;
  const getDriverPrice = (variant) => productCatalog.find(p => p.product_type === 'driver' && p.variant === variant)?.price_per_unit || 85;
  const getDriverMaxWatts = (variant) => productCatalog.find(p => p.product_type === 'driver' && p.variant === variant)?.max_watts || 60;
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
      const pricePerFoot = getTapePrice(type);
      const wattsPerFoot = getTapeWatts(type);
      tapeByType[type].feet += run.length_feet;
      tapeByType[type].watts += run.length_feet * wattsPerFoot;
      tapeByType[type].cost += run.length_feet * pricePerFoot;
      totalWatts += run.length_feet * wattsPerFoot;
    });

    // Calculate channel totals by type
    const channelByType = {};
    runs.forEach(run => {
      const type = run.channel_type;
      if (type !== 'none') {
        if (!channelByType[type]) {
          channelByType[type] = { feet: 0, cost: 0 };
        }
        const pricePerFoot = getChannelPrice(type);
        channelByType[type].feet += run.length_feet;
        channelByType[type].cost += run.length_feet * pricePerFoot;
      }
    });

    // Calculate required drivers
    const requiredDrivers = [];
    let remainingWatts = totalWatts;
    const driverSpecs = [
      { variant: '60w', max_watts: getDriverMaxWatts('60w'), price: getDriverPrice('60w') },
      { variant: '96w', max_watts: getDriverMaxWatts('96w'), price: getDriverPrice('96w') }
    ].sort((a, b) => a.max_watts - b.max_watts);
    
    while (remainingWatts > 0) {
      const driver = driverSpecs.find(d => d.max_watts >= remainingWatts) || driverSpecs[driverSpecs.length - 1];
      requiredDrivers.push(driver);
      remainingWatts -= driver.max_watts;
    }

    // Calculate terminal blocks - 1 per driver
    const terminalBlocks = requiredDrivers.length;
    const terminalBlockCost = terminalBlocks * 8; // $8 per terminal block

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
    const subtotalCost = tapeCost + channelCost + driverCost + terminalBlockCost + clipCost;
    const shippingCost = subtotalCost * 0.1;
    const totalCost = subtotalCost + shippingCost;

    return {
      tapeByType,
      channelByType,
      requiredDrivers,
      terminalBlocks,
      terminalBlockCost,
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Materials Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tape Light */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Tape Light</h4>
            <div className="space-y-2">
              {Object.entries(calculations.tapeByType).map(([type, data]) => {
                const feet = Math.floor(data.feet);
                const inches = Math.round((data.feet % 1) * 12);
                return (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="text-slate-600 whitespace-nowrap">{formatType(type)}</span>
                    <span className="font-medium whitespace-nowrap">{feet}'{inches}"</span>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Channels */}
          {Object.keys(calculations.channelByType).length > 0 && (
            <>
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Housings (4' sections)</h4>
                <div className="space-y-2">
                  {Object.entries(calculations.channelByType).map(([type, data]) => {
                    const feet = Math.floor(data.feet);
                    const inches = Math.round((data.feet % 1) * 12);
                    return (
                      <div key={type} className="flex justify-between text-sm">
                        <span className="text-slate-600 whitespace-nowrap">{type === 'surface_mount' ? 'Surface' : formatType(type)}</span>
                        <span className="font-medium whitespace-nowrap">{feet}'{inches}"</span>
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
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Drivers</h4>
            <div className="space-y-2">
              {(() => {
                const driverCounts = {};
                calculations.requiredDrivers.forEach(driver => {
                  const key = `${driver.max_watts}W`;
                  driverCounts[key] = (driverCounts[key] || 0) + 1;
                });
                return Object.entries(driverCounts).map(([wattage, count]) => (
                  <div key={wattage} className="flex justify-between text-sm gap-2">
                    <span className="text-slate-600 whitespace-nowrap">{wattage} Driver</span>
                    <span className="font-medium whitespace-nowrap">{count}</span>
                  </div>
                ));
              })()}
            </div>
          </div>

          <Separator />

          {/* Terminal Blocks */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Terminal Blocks</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 whitespace-nowrap">Terminal Blocks</span>
                <span className="font-medium whitespace-nowrap">{calculations.terminalBlocks}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Mounting Hardware */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Mounting Hardware</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 whitespace-nowrap">External Clips</span>
                <span className="font-medium whitespace-nowrap">{calculations.totalClips}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Summary */}
      <Card className="border-black" style={{ backgroundColor: '#000000' }}>
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
              <span className="text-slate-300 whitespace-nowrap">Housings</span>
              <span className="font-medium text-white whitespace-nowrap">${formatUSD(calculations.channelCost)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-300 whitespace-nowrap">Drivers</span>
            <span className="font-medium text-white whitespace-nowrap">${formatUSD(calculations.driverCost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-300 whitespace-nowrap">Terminal Blocks</span>
            <span className="font-medium text-white whitespace-nowrap">${formatUSD(calculations.terminalBlockCost)}</span>
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