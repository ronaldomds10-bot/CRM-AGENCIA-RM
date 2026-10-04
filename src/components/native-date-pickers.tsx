"use client";

import { useEffect } from "react";

/** Apply the same whole-field activation to native calendar inputs, including dialogs. */
export function NativeDatePickers() {
  useEffect(() => {
    const openCalendar = (event: MouseEvent) => {
      const target = event.composedPath()[0];
      const input = target instanceof HTMLInputElement ? target
        : target instanceof Element ? target.closest("label")?.control : null;
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
    // Capture also covers fields inside cards/dialogs that stop click bubbling.
    document.addEventListener("click", openCalendar, true);
    return () => document.removeEventListener("click", openCalendar, true);
  }, []);
  return null;
}
