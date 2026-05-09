import React, { useState, useMemo, useRef, useEffect } from "react";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Drop-in Select replacement that handles Tab key while the dropdown is open:
 * 1. Confirms the currently highlighted option
 * 2. Closes the dropdown
 * 3. Moves focus to the element with id=nextFieldId (or the next focusable sibling if not provided)
 */
export default function TabSelect({
  value,
  onValueChange,
  children,
  triggerClassName,
  placeholder,
  nextFieldId,   // id of the element to focus after Tab
  triggerId,     // optional id for the trigger button itself
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  // Build label->value and value->value maps from children
  const optionMap = useMemo(() => {
    const map = {};
    React.Children.forEach(children, (child) => {
      if (child?.props?.value !== undefined) {
        map[String(child.props.children).trim()] = child.props.value;
        map[child.props.value] = child.props.value;
      }
    });
    return map;
  }, [children]);

  const focusNext = () => {
    if (nextFieldId) {
      const el = document.getElementById(nextFieldId);
      if (el) { el.focus(); return; }
    }
    // Fallback: find next focusable element after the trigger
    const trigger = triggerRef.current;
    if (!trigger) return;
    const focusable = Array.from(
      document.querySelectorAll(
        'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => el.offsetParent !== null);
    const idx = focusable.indexOf(trigger);
    if (idx !== -1 && focusable[idx + 1]) {
      focusable[idx + 1].focus();
    }
  };

  // Capture-phase document listener — fires before Radix intercepts Tab
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      e.stopPropagation();

      // Grab the highlighted option text and resolve to a value
      const highlighted = document.querySelector('[role="option"][data-highlighted]');
      if (highlighted) {
        const label = highlighted.textContent?.trim();
        const matched = optionMap[label];
        if (matched !== undefined) {
          onValueChange(matched);
        }
      }

      setOpen(false);
      // Wait a tick for Radix to finish closing before moving focus
      setTimeout(focusNext, 10);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, optionMap, onValueChange, nextFieldId]);

  return (
    <Select value={value} onValueChange={onValueChange} open={open} onOpenChange={setOpen}>
      <SelectTrigger ref={triggerRef} id={triggerId} className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {children}
      </SelectContent>
    </Select>
  );
}