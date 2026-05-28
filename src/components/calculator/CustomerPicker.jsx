import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

// CustomerPicker — admin-only autocomplete that writes a deterministic
// Project.opus_customer_id linkage (per task #116, precursor to #43).
//
// Behavior:
//   - Loads up to 200 Customers via the SDK on first open. Admin's session
//     RLS already permits Customer read (existing schema, no expansion).
//   - Client-side substring filter on name + email as admin types.
//   - On select, calls onPick(customer) — parent writes opus_customer_id +
//     populates customer_name/email/phone cache fields from the Customer
//     entity (per the design decision locked 2026-05-27).
//   - No "create new customer" affordance — out of scope for #116; admin
//     must create Customers via existing tooling first.
//   - Clearing the link: explicit "Clear linkage" button when already linked.
//
// Props:
//   - value: opus_customer_id (string, possibly empty)
//   - linkedCustomer: the resolved Customer entity (or null) — caller resolves
//   - onPick(customer): callback when admin selects a customer
//   - onClear(): callback when admin clears the linkage
//   - disabled: optional boolean
const CUSTOMER_FETCH_LIMIT = 200;

export default function CustomerPicker({ value, linkedCustomer, onPick, onClear, disabled }) {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");

  // Lazy-load customers on first open. Cheap for the expected scale
  // (<500 customers). For larger fleets, swap to server-side prefix search.
  useEffect(() => {
    if (!open || customers.length > 0 || loading || loadError) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    base44.entities.Customer.list(undefined, CUSTOMER_FETCH_LIMIT)
      .then((rows) => {
        if (cancelled) return;
        // Defensive: SDK may return undefined/null on edge cases.
        setCustomers(Array.isArray(rows) ? rows : []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || "Failed to load customers");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, customers.length, loading, loadError]);

  // Substring filter (case-insensitive) on name and email.
  const filtered = useMemo(() => {
    if (!search.trim()) return customers.slice(0, 50);
    const q = search.trim().toLowerCase();
    return customers
      .filter((c) =>
        (typeof c.name === 'string' && c.name.toLowerCase().includes(q))
        || (typeof c.email === 'string' && c.email.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [customers, search]);

  // Trigger label
  const triggerLabel = linkedCustomer
    ? (
      <span className="truncate">
        {linkedCustomer.name || "(unnamed)"}
        {linkedCustomer.email ? (
          <span className="text-muted-foreground"> · {linkedCustomer.email}</span>
        ) : null}
      </span>
    )
    : <span className="text-muted-foreground">Pick a customer…</span>;

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex-1 justify-between"
            disabled={disabled}
          >
            {triggerLabel}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by name or email…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {loading && (
                <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading customers…
                </div>
              )}
              {loadError && (
                <div className="px-3 py-6 text-sm text-destructive">
                  {loadError}
                </div>
              )}
              {!loading && !loadError && filtered.length === 0 && (
                <CommandEmpty>
                  No customers match. Create the Customer record first (admin tooling), then return here.
                </CommandEmpty>
              )}
              {!loading && !loadError && filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => {
                        onPick && onPick(c);
                        setSearch("");
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${value === c.id ? 'opacity-100' : 'opacity-0'}`}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{c.name || "(unnamed)"}</span>
                        {c.email && (
                          <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && onClear && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={disabled}
          title="Clear customer linkage"
        >
          Clear
        </Button>
      )}
    </div>
  );
}
