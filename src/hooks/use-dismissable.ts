"use client"

import * as React from "react"

/**
 * Shared dismiss behavior for popover-like surfaces: closes on outside
 * mousedown and on Escape. One implementation for menu, combobox,
 * context-menu, multi-select, dots-menu and split-button.
 */
// ponytail: hand-rolled dismiss; migrate surfaces to @base-ui/react Menu/Popover if focus management/ARIA needs grow
export function useDismissable(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void
) {
  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, ref, onClose])
}
