"use client";

import { useEffect } from "react";

/** Apply the same whole-field activation to native calendar inputs, including dialogs. */
export function NativeDatePickers() {
  useEffect(() => {
    const openCalendar = (event: MouseEvent) => {
      const input = event.target;
      if (event.defaultPrevented || !(input instanceof HTMLInputElement)
        || !["date", "datetime-local", "month", "week"].includes(input.type)
        || input.disabled || input.readOnly || typeof input.showPicker !== "function") return;
      try {
        input.focus({ preventScroll: true });
        input.showPicker();
        // The indicator's native click must not toggle the picker a second time.
        event.preventDefault();
      } catch {
        // Keep the browser's native editing behavior when showPicker is unavailable.
      }
    };
    document.addEventListener("click", openCalendar);
    return () => document.removeEventListener("click", openCalendar);
  }, []);
  return null;
}
