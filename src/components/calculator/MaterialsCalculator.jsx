import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TAPE_SPECS, CHANNEL_SPECS, DRIVER_SPECS, SPOOL_LENGTH_FEET, DRIVER_LOAD_FACTOR, CLIPS_PER_SECTION, CLIPS_PER_SET, CLIP_SET_PRICE, SHIPPING_RATE } from "@/components/calculator/constants";

const MaterialsCalculator = React.memo(({ runs }) => {

  const calculations = React.useMemo(() => {
    // Calculate tape totals by type and CCT
    const tapeByTypeCCT = {};
    let totalWatts = 0;
    
    runs.forEach(run => {
      const type = run.tape_type;
      const cct = run.cct || 'No CCT';
      const key = `${type}-${cct}`;
      const specs = TAPE_SPECS[type];
      
      if (!specs) return;
      
      if (!tapeByTypeCCT[key]) {
        tapeByTypeCCT[key] = { type, cct, feet: 0, watts: 0, cost: 0 };
      }
      tapeByTypeCCT[key].feet += run.length_feet;
      tapeByTypeCCT[key].watts += run.length_feet * specs.watts_per_foot;
      tapeByTypeCCT[key].cost += run.length_feet * specs.price_per_foot;
      totalWatts += run.length_feet * specs.watts_per_foot;
    });

    // Calculate channel totals by type (housings come in 4' sections only)
    const channelByType = {};
    runs.forEach(run => {
      const type = run.channel_type;
      const specs = CHANNEL_SPECS[type];
      
      if (type !== 'none' && specs) {
        if (!channelByType[type]) {
          channelByType[type] = { feet: 0, cost: 0, sections: 0 };
        }
        // Round up to nearest 4' increment
        const sections = Math.ceil(run.length_feet / 4);
        const actualFeet = sections * 4;
        channelByType[type].feet += actualFeet;
        channelByType[type].sections += sections;
        channelByType[type].cost += actualFeet * specs.price_per_foot;
      }
    });

    // Calculate required drivers
    const requiredDrivers = [];
    let remainingWatts = totalWatts;
    while (remainingWatts > 0) {
      const driver = DRIVER_SPECS[0];
      requiredDrivers.push(driver);
      remainingWatts -= driver.max_watts * DRIVER_LOAD_FACTOR;
    }

    // Calculate mounting hardware (clips)
    const totalClips = Object.values(channelByType).reduce((sum, channel) => {
      return sum + (channel.sections * CLIPS_PER_SECTION);
    }, 0);
    const clipSets = Math.ceil(totalClips / CLIPS_PER_SET);
    const clipCost = clipSets * CLIP_SET_PRICE;

    // Calculate tape to tape connectors - one needed every 16'4" (one per spool join)
    const tapeToTapeConnectors = runs.reduce((sum, run) => {
      const spoolsNeeded = Math.ceil(run.length_feet / SPOOL_LENGTH_FEET);
      return sum + Math.max(0, spoolsNeeded - 1); // connectors needed to join spools
    }, 0);

    // Calculate subtotal (before shipping)
    const tapeCost = Object.values(tapeByTypeCCT).reduce((sum, t) => sum + t.cost, 0);
    const channelCost = Object.values(channelByType).reduce((sum, c) => sum + c.cost, 0);
    const driverCost = requiredDrivers.reduce((sum, d) => sum + d.price, 0);
    const subtotal = tapeCost + channelCost + driverCost + clipCost;
    
    // Calculate shipping
    const shippingCost = subtotal * SHIPPING_RATE;
    
    // Calculate total with shipping
    const totalCost = subtotal + shippingCost;

    return {
      tapeByTypeCCT,
      channelByType,
      requiredDrivers,
      totalClips,
      clipSets,
      clipCost,
      totalWatts,
      tapeCost,
      channelCost,
      driverCost,
      shippingCost,
      totalCost,
      tapeToTapeConnectors,
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
    if (type === 'recessed') return 'Recessed Flange';
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatCCT = (cct) => {
    if (cct === 'Warm Dim (22-30k)') return 'WD (22-30k)';
    if (cct === 'Tunable White (18-40k)') return 'TW (18-40k)';
    return cct;
  };

  // Define CCT order for sorting
  const cctOrder = {
    "2400k": 1,
    "2700k": 2,
    "3000k": 3,
    "3500k": 4,
    "Warm Dim (22-30k)": 5,
    "Tunable White (18-40k)": 6
  };

  // Sort tape light entries by output (2w before 4w) and then by CCT
  const sortedTapeEntries = Object.entries(calculations.tapeByTypeCCT).sort(([keyA, dataA], [keyB, dataB]) => {
    // First sort by type (2w before 4w)
    if (dataA.type !== dataB.type) {
      return dataA.type.localeCompare(dataB.type);
    }
    // Then sort by CCT order
    return (cctOrder[dataA.cct] || 999) - (cctOrder[dataB.cct] || 999);
  });

  return (
    <div className="space-y-6">
      <Card className="bg-[#eeeeee]">
         <CardHeader>
           <CardTitle className="text-lg">Materials</CardTitle>
         </CardHeader>
         <CardContent className="space-y-4">
          {/* Tape Light */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Tape Light</h4>
            <div className="space-y-2">
              {sortedTapeEntries.map(([key, data]) => {
                const spoolsRequired = Math.ceil(data.feet / SPOOL_LENGTH_FEET);
                return (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-slate-600">{formatType(data.type)} at {formatCCT(data.cct)}</span>
                    <span className="font-medium">{Math.floor(data.feet)}' {Math.round((data.feet % 1) * 12)}" ({spoolsRequired} {spoolsRequired === 1 ? 'spool' : 'spools'})</span>
                  </div>
                );
              })}
            </div>
          </div>

           {/* Housing */}
          {Object.keys(calculations.channelByType).length > 0 && (
            <>
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Housing</h4>
                <div className="space-y-2">
                  {Object.entries(calculations.channelByType)
                    .sort(([typeA], [typeB]) => {
                      const order = ['corner', 'recessed', 'surface', 'none'];
                      return order.indexOf(typeA) - order.indexOf(typeB);
                    })
                    .map(([type, data]) => (
                      <div key={type} className="flex justify-between text-sm">
                        <span className="text-slate-600">{formatType(type)}</span>
                        <span className="font-medium">{data.feet}' ({data.sections} {data.sections === 1 ? 'section' : 'sections'})</span>
                      </div>
                    ))}
                </div>
              </div>
              </>
              )}

          {/* Drivers */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Drivers</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">96w {calculations.requiredDrivers.length === 1 ? 'Driver' : 'Drivers'}</span>
                <span className="font-medium">{calculations.requiredDrivers.length}</span>
              </div>
            </div>
          </div>

          {/* Mounting Hardware */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Mounting Hardware</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Mounting Clips</span>
                <span className="font-medium">{calculations.clipSets} {calculations.clipSets === 1 ? 'set' : 'sets'} ({calculations.totalClips} {calculations.totalClips === 1 ? 'clip' : 'clips'})</span>
              </div>
            </div>
          </div>

          {/* Connectors */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Connectors</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Tape to Tape</span>
                <span className="font-medium">{calculations.tapeToTapeConnectors} {calculations.tapeToTapeConnectors === 1 ? 'unit' : 'units'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Tape to Wire</span>
                <span className="font-medium">{runs.length} {runs.length === 1 ? 'unit' : 'units'}</span>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Pricing Summary */}
      <Card className="border-foreground bg-foreground">
        <CardHeader className="flex flex-row items-start justify-between">
          <CardTitle className="text-lg text-white">Summary</CardTitle>
          <img 
            src="https://media.base44.com/images/public/698fc81203f85a20f281d9dc/2b8625608_Alkimi_icon_white_transparent.png" 
            alt="Logo" 
            className="h-[18px] w-auto"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Tape Light</span>
            <span className="font-medium text-white">${calculations.tapeCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          {calculations.channelCost > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Housing</span>
              <span className="font-medium text-white">${calculations.channelCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Drivers</span>
            <span className="font-medium text-white">${calculations.driverCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Mounting Hardware</span>
            <span className="font-medium text-white">${calculations.clipCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Shipping</span>
            <span className="font-medium text-white">${calculations.shippingCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-semibold">
            <span className="text-white">Total</span>
            <span className="text-white">${calculations.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

MaterialsCalculator.displayName = 'MaterialsCalculator';

export default MaterialsCalculator;