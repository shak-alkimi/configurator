import React, { useState, useMemo, useRef } from "react";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TabSelect({ id, value, onValueChange, children, triggerClassName, placeholder, displayMap, "aria-label": ariaLabel }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

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
      setTimeout(focusNext, 0);
    }
  };

  return (
    <Select value={value} onValueChange={onValueChange} open={open} onOpenChange={setOpen}>
      <SelectTrigger id={id} aria-label={ariaLabel} ref={triggerRef} className={triggerClassName}>
        {displayMap && value && displayMap[value]
          ? <span>{displayMap[value]}</span>
          : <SelectValue placeholder={placeholder} />}
      </SelectTrigger>
      <SelectContent onKeyDown={handleKeyDown}>
        {children}
      </SelectContent>
    </Select>
  );
}