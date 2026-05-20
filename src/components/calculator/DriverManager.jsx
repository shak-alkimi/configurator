import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TAPE_SPECS } from "@/components/calculator/constants";

function getDriverWatts(driver, runs) {
  let total = 0;
  for (const run of (runs || [])) {
    if (!run?.driver_group || !run.tape_output || !run.length_feet) continue;
    if (run.driver_group !== driver.name) continue;
    const wpf = TAPE_SPECS[run.tape_output]?.watts_per_foot;
    if (wpf == null) continue;
    total += run.length_feet * wpf;
  }
  return total;
}

function DriverRow({ driver, runs, onUpdate, onRemove }) {
  const usedWatts = getDriverWatts(driver, runs);
  const pct = driver.maxWatts > 0 ? (usedWatts / driver.maxWatts) * 100 : 0;
  const isOver = pct >= 100;
  const barWidth = Math.min(pct, 100);
  const runCount = (runs || []).filter(r => r.driver_group === driver.name).length;

  return (
    <div className="bg-background rounded-lg border border-border px-3 py-2 flex items-center gap-3" data-testid="driver-row" data-driver-name={driver.name}>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-medium">{driver.name}</span>
        <span className="inline-flex items-center justify-center h-5 px-1.5 text-xs font-semibold bg-secondary text-foreground/70 rounded-full">
          {runCount}
        </span>
      </div>
      <Select value={String(driver.maxWatts)} onValueChange={v => onUpdate(driver.id, 'maxWatts', parseFloat(v))}>
        <SelectTrigger className="h-7 w-20 text-xs shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="60">60W</SelectItem>
          <SelectItem value="96">96W</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : ''}`} style={{ width: `${barWidth}%`, backgroundColor: isOver ? undefined : '#252320' }} />
      </div>
      <span className="text-xs text-foreground/60 shrink-0 w-20 text-right whitespace-nowrap">
        {usedWatts.toFixed(1)}W / {driver.maxWatts}W
      </span>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-foreground/40 hover:text-destructive shrink-0" aria-label={`Remove ${driver.name}`} data-testid="driver-remove" onClick={() => onRemove(driver.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function DriverManager({ drivers, runs, onDriversChange, onClearDriverRuns }) {
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  const updateDriver = (id, field, value) => {
    onDriversChange(drivers.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const requestRemove = (id) => {
    const target = drivers.find(d => d.id === id);
    const attached = target ? (runs || []).filter(r => r.driver_group === target.name).length : 0;
    if (attached > 0) {
      setConfirmRemoveId(id);
    } else {
      performRemove(id);
    }
  };

  const performRemove = (id) => {
    const removed = drivers.find(d => d.id === id);
    onDriversChange(drivers.filter(d => d.id !== id));
    if (removed?.name) onClearDriverRuns?.(removed.name);
  };

  const confirmTarget = drivers.find(d => d.id === confirmRemoveId);
  const confirmAttached = confirmTarget ? (runs || []).filter(r => r.driver_group === confirmTarget.name).length : 0;

  const sortedDrivers = [...drivers].sort((a, b) => {
    const numA = parseInt(/^Driver\s+(\d+)$/.exec(a.name || '')?.[1] ?? Infinity, 10);
    const numB = parseInt(/^Driver\s+(\d+)$/.exec(b.name || '')?.[1] ?? Infinity, 10);
    return numA - numB;
  });

  return (
    <div className="space-y-3">
      {sortedDrivers.map((driver) => (
        <DriverRow
          key={driver.id}
          driver={driver}
          runs={runs}
          onUpdate={updateDriver}
          onRemove={requestRemove}
        />
      ))}
      <AlertDialog open={confirmRemoveId != null} onOpenChange={(open) => !open && setConfirmRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAttached} {confirmAttached === 1 ? 'tape run is' : 'tape runs are'} assigned to this driver. Removing it will clear the driver assignment from {confirmAttached === 1 ? 'that run' : 'those runs'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="driver-remove-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="driver-remove-confirm"
              onClick={() => { performRemove(confirmRemoveId); setConfirmRemoveId(null); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}