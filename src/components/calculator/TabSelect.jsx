import React, { useState, useMemo, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * A Select wrapper that:
 * 1. When the dropdown is OPEN and Tab is pressed: confirms the highlighted option and moves focus to next field.
 * 2. When the trigger is FOCUSED (closed) and Tab is pressed: lets Tab naturally move to the next field.
 */
export default function TabSelect({ value, onValueChange, children, triggerClassName, placeholder }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  // Build a label->value map from children
  const optionMap = useMemo(() => {
    const map = {};
    React.Children.forEach(children, (child) => {
      if (child?.props?.value !== undefined) {
        const label = String(child.props.children);
        map[label] = child.props.value;
        map[child.props.value] = child.props.value;
      }
    });
    return map;
  }, [children]);

  const focusNext = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    // Find all focusable elements in the document
    const focusable = Array.from(
      document.querySelectorAll(
        'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.disabled && el.offsetParent !== null);
    const idx = focusable.indexOf(trigger);
    if (idx !== -1 && focusable[idx + 1]) {
      focusable[idx + 1].focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Tab" && open) {
      e.preventDefault();
      const highlighted = document.querySelector('[role="option"][data-highlighted]');
      if (highlighted) {
        const label = highlighted.textContent?.trim();
        const matched = optionMap[label];
        if (matched !== undefined) {
          onValueChange(matched);
        }
      }
      setOpen(false);
      // Move focus to next field after a tick (let Radix close fully)
      setTimeout(focusNext, 0);
    }
  };

  return (
    <Select value={value} onValueChange={onValueChange} open={open} onOpenChange={setOpen}>
      <SelectTrigger ref={triggerRef} className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent onKeyDown={handleKeyDown}>
        {children}
      </SelectContent>
    </Select>
  );
}