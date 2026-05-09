import React, { useState, useMemo, useRef, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TabSelect({ value, onValueChange, children, triggerClassName, placeholder }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  // Build value map from children (label -> value and value -> value)
  const optionMap = useMemo(() => {
    const map = {};
    React.Children.forEach(children, (child) => {
      if (child?.props?.value !== undefined) {
        map[String(child.props.children)] = child.props.value;
        map[child.props.value] = child.props.value;
      }
    });
    return map;
  }, [children]);

  const focusNext = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
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

  // Attach a capture-phase keydown listener on the document while open.
  // Capture phase fires before Radix can intercept Tab.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      e.stopPropagation();

      // Pick the highlighted option if one exists
      const highlighted = document.querySelector('[role="option"][data-highlighted]');
      if (highlighted) {
        const label = highlighted.textContent?.trim();
        const matched = optionMap[label];
        if (matched !== undefined) {
          onValueChange(matched);
        }
      }

      setOpen(false);
      setTimeout(focusNext, 0);
    };

    document.addEventListener("keydown", handleKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, optionMap, onValueChange]);

  return (
    <Select value={value} onValueChange={onValueChange} open={open} onOpenChange={setOpen}>
      <SelectTrigger ref={triggerRef} className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {children}
      </SelectContent>
    </Select>
  );
}