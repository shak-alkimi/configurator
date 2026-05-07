import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * A Select wrapper that selects the currently highlighted option when Tab is pressed,
 * then closes the dropdown and lets focus move to the next field naturally.
 *
 * It works by reading the text content of the highlighted [role="option"] element
 * and matching it against the SelectItem children to find the corresponding value.
 */
export default function TabSelect({ value, onValueChange, children, triggerClassName, placeholder }) {
  const [open, setOpen] = useState(false);

  // Build a label->value map from children
  const optionMap = useMemo(() => {
    const map = {};
    React.Children.forEach(children, (child) => {
      if (child?.props?.value !== undefined) {
        // The displayed label is child.props.children (a string)
        const label = String(child.props.children);
        map[label] = child.props.value;
        // Also map by value itself in case label === value
        map[child.props.value] = child.props.value;
      }
    });
    return map;
  }, [children]);

  const handleKeyDown = (e) => {
    if (e.key === "Tab" && open) {
      const highlighted = document.querySelector('[role="option"][data-highlighted]');
      if (highlighted) {
        const label = highlighted.textContent?.trim();
        const matched = optionMap[label];
        if (matched !== undefined) {
          onValueChange(matched);
        }
      }
      setOpen(false);
      // Don't preventDefault — let Tab move focus to the next field
    }
  };

  return (
    <Select value={value} onValueChange={onValueChange} open={open} onOpenChange={setOpen}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent onKeyDown={handleKeyDown}>
        {children}
      </SelectContent>
    </Select>
  );
}