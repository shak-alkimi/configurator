import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const WATTS_PER_FOOT = {
  "300lm (3.0w/ft)": 3.0,
  "360lm (3.6w/ft)": 3.6,
  "600lm (6.0w/ft)": 6.0,
};

function calculateUsedWatts(driver, tapeRuns) {
  return (tapeRuns || []).reduce((sum, run) => {
    if (run.driver_group !== driver.name || !run.tape_output || !run.length_feet) return sum;
    const wpf = WATTS_PER_FOOT[run.tape_output];
    return sum + (wpf ? run.length_feet * wpf : 0);
  }, 0);
}

export default function DriverGaugeSection({ drivers, tapeRuns, projectId, onDriversChange }) {
  const [showDialog, setShowDialog] = useState(false);
  const [selectedWatts, setSelectedWatts] = useState("96");

  const handleCreateDriver = async () => {
    const nextNumber = drivers.length + 1;
    const newDriver = await base44.entities.Driver.create({
      project_id: projectId,
      name: `Driver ${nextNumber}`,
      max_watts: parseInt(selectedWatts),
    });
    onDriversChange([...drivers, newDriver]);
    setShowDialog(false);
    setSelectedWatts("96");
  };

  const handleDeleteDriver = async (driverId) => {
    await base44.entities.Driver.delete(driverId);
    onDriversChange(drivers.filter(d => d.id !== driverId));
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <h3 className="text-sm font-semibold">Drivers</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowDialog(true)}>
          <Plus className="h-3 w-3" /> Driver
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {drivers.map((driver) => {
          const usedW = calculateUsedWatts(driver, tapeRuns);
          const pct = driver.max_watts > 0 ? (usedW / driver.max_watts) * 100 : 0;
          const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-400" : "bg-green-500";

          return (
            <div key={driver.id} className="bg-white rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium flex-1">{driver.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-slate-400 hover:text-red-600"
                  onClick={() => handleDeleteDriver(driver.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <span className="text-xs text-slate-600 w-20 text-right">{usedW.toFixed(1)}W / {driver.max_watts}W</span>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Driver Wattage</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              variant={selectedWatts === "60" ? "default" : "outline"}
              onClick={() => setSelectedWatts("60")}
              className="h-10 text-base"
            >
              60W
            </Button>
            <Button
              variant={selectedWatts === "96" ? "default" : "outline"}
              onClick={() => setSelectedWatts("96")}
              className="h-10 text-base"
            >
              96W
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDriver}>
              Create Driver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}