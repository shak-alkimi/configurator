import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

export default function DriverManager({ drivers, onDriversChange }) {
  const updateDriver = (id, field, value) => {
    onDriversChange(drivers.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const removeDriver = (id) => {
    onDriversChange(drivers.filter(d => d.id !== id));
  };

  const addDriver = () => {
    const nextN = drivers.length + 1;
    onDriversChange([...drivers, { id: String(Date.now()), name: `Driver ${nextN}`, maxWatts: 96 }]);
  };

  return (
    <div className="space-y-2">
      {drivers.map((driver, index) => (
        <div key={driver.id} className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2">
          <span className="text-xs font-medium w-24 shrink-0">{driver.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            <Select value={String(driver.maxWatts)} onValueChange={v => updateDriver(driver.id, 'maxWatts', parseFloat(v))}>
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">60W</SelectItem>
                <SelectItem value="96">96W</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-red-600 shrink-0"
            onClick={() => removeDriver(driver.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {index === drivers.length - 1 && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={addDriver}>
              <Plus className="h-3 w-3" /> Driver
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}