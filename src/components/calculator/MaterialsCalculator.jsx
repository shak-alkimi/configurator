import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TAPE_SPECS, CHANNEL_SPECS, SPOOL_LENGTH_FEET, SHIPPING_RATE } from "@/components/calculator/constants";
import { formatFeetInches, channelSectionsFor, clipsForSections, priceDrivers, titleCase } from "@/components/calculator/calculations";

const MaterialsCalculator = React.memo(({ runs, drivers }) => {

  const calculations = React.useMemo(() => {
    // Calculate tape totals by type and CCT
    const tapeByTypeCCT = {};
    let totalWatts = 0;
    
    runs.forEach(run => {
      const type = run.tape_output;
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
      const sections = channelSectionsFor(run);
      if (sections === 0 || !specs) return;
      if (!channelByType[type]) {
        channelByType[type] = { feet: 0, cost: 0, sections: 0 };
      }
      const actualFeet = sections * 4;
      channelByType[type].feet += actualFeet;
      channelByType[type].sections += sections;
      channelByType[type].cost += actualFeet * specs.price_per_foot;
    });

    // Drivers: actual configured list, or watts-derived fallback.
    const { specs: requiredDrivers } = priceDrivers(drivers, totalWatts);

    // Clips priced from total sections across all channels.
    const totalSections = Object.values(channelByType).reduce((sum, c) => sum + c.sections, 0);
    const { totalClips, sets: clipSets, cost: clipCost } = clipsForSections(totalSections);

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
  }, [runs, drivers]);

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-foreground/40">
          Add runs for breakdown
        </CardContent>
      </Card>
    );
  }

  const formatType = titleCase;

  const formatCCT = (cct) => {
    if (cct === 'Warm Dim (30k-18k)') return 'DtW (3000-1800K)';
    if (cct === 'Tunable White (18k-40k)') return 'TW (18-40k)';
    return cct;
  };

  // Define CCT order for sorting
  const cctOrder = {
    "2400k": 1,
    "2700k": 2,
    "3000k": 3,
    "3500k": 4,
    "Warm Dim (30k-18k)": 5,
    "Tunable White (18k-40k)": 6
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
    <div className="space-y-3">
      <Card className="bg-secondary">
         <CardHeader>
           <CardTitle className="text-lg">Materials</CardTitle>
         </CardHeader>
         <CardContent className="space-y-4">
          {/* Tape Light */}
          <div>
            <h4 className="text-sm font-semibold text-foreground/80 mb-2">Tape Light</h4>
            <div className="space-y-2">
              {sortedTapeEntries.map(([key, data]) => {
                const spoolsRequired = Math.ceil(data.feet / SPOOL_LENGTH_FEET);
                return (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-foreground/70">{formatType(data.type)} at {formatCCT(data.cct)}</span>
                    <span className="font-medium">{formatFeetInches(data.feet)} ({spoolsRequired} {spoolsRequired === 1 ? 'spool' : 'spools'})</span>
                  </div>
                );
              })}
            </div>
          </div>

           {/* Housing */}
          {Object.keys(calculations.channelByType).length > 0 && (
            <>
              <div>
                <h4 className="text-sm font-semibold text-foreground/80 mb-2">Housing</h4>
                <div className="space-y-2">
                  {Object.entries(calculations.channelByType)
                    .sort(([typeA], [typeB]) => {
                      const order = ['corner', 'surface', 'none'];
                      return order.indexOf(typeA) - order.indexOf(typeB);
                    })
                    .map(([type, data]) => (
                      <div key={type} className="flex justify-between text-sm">
                        <span className="text-foreground/70">{formatType(type)}</span>
                        <span className="font-medium">{data.feet}' ({data.sections} {data.sections === 1 ? 'section' : 'sections'})</span>
                      </div>
                    ))}
                </div>
              </div>
              </>
              )}

          {/* Drivers */}
          <div>
            <h4 className="text-sm font-semibold text-foreground/80 mb-2">Drivers</h4>
            <div className="space-y-2">
              {Object.entries(calculations.requiredDrivers.reduce((acc, d) => {
                acc[d.max_watts] = (acc[d.max_watts] || 0) + 1;
                return acc;
              }, {})).map(([watts, count]) => (
                <div key={watts} className="flex justify-between text-sm">
                  <span className="text-foreground/70">{watts}W {count === 1 ? 'Driver' : 'Drivers'}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mounting Hardware */}
          <div>
            <h4 className="text-sm font-semibold text-foreground/80 mb-2">Mounting Hardware</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-foreground/70">Mounting Clips</span>
                <span className="font-medium">{calculations.clipSets} {calculations.clipSets === 1 ? 'set' : 'sets'} ({calculations.totalClips} {calculations.totalClips === 1 ? 'clip' : 'clips'})</span>
              </div>
            </div>
          </div>

          {/* Connectors */}
          <div>
            <h4 className="text-sm font-semibold text-foreground/80 mb-2">Connectors</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-foreground/70">Tape to Tape</span>
                <span className="font-medium">{calculations.tapeToTapeConnectors} {calculations.tapeToTapeConnectors === 1 ? 'unit' : 'units'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/70">Tape to Wire</span>
                <span className="font-medium">{runs.length} {runs.length === 1 ? 'unit' : 'units'}</span>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Pricing Summary */}
      <Card className="border-foreground bg-foreground">
        <CardHeader>
          <CardTitle className="text-lg text-white">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-background/70">Tape Light</span>
            <span className="font-medium text-white">${calculations.tapeCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          {calculations.channelCost > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-background/70">Housing</span>
              <span className="font-medium text-white">${calculations.channelCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-background/70">Drivers</span>
            <span className="font-medium text-white">${calculations.driverCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-background/70">Mounting Hardware</span>
            <span className="font-medium text-white">${calculations.clipCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-semibold">
            <span className="text-white">Total</span>
            <span className="text-white">${calculations.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </CardContent>
      </Card>

      {/* Shipping */}
      <Card style={{ backgroundColor: '#C0BBB3', borderColor: '#C0BBB3' }}>
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Shipping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-foreground/80">Tube (3"w x 4h)</span>
            <span className="font-medium text-foreground">2</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-semibold">
            <span className="text-foreground">Weight</span>
            <span className="text-foreground">118lbs</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

MaterialsCalculator.displayName = 'MaterialsCalculator';

export default MaterialsCalculator;