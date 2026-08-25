"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ToggleProps extends Omit<React.ComponentPropsWithoutRef<"input">, "size" | "color"> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  size?: "sm" | "md" | "small" | "large"
  /** Label text (or pass children). */
  label?: React.ReactNode
  children?: React.ReactNode
  /** Geist color name (amber, red, …) or a CSS color for the ON state. */
  color?: string
  /** Icons rendered inside the thumb per state. */
  icon?: { checked?: React.ReactNode; unchecked?: React.ReactNode }
  /** Label placement relative to the switch. Default puts the label first (left). */
  direction?: "label-first" | "switch-first"
}

// Dark tint for the lock/icon that sits on the (always-light) thumb; theme-independent.
const ICON_TINT: Record<string, string> = { amber: "#291800", red: "#2a1314" }

const SIZE: Record<string, "sm" | "md"> = { sm: "sm", small: "sm", md: "md", large: "md" }
const DS_COLORS = new Set(["gray", "blue", "red", "amber", "green", "teal", "purple", "pink"])

export const Toggle = React.forwardRef<HTMLInputElement, ToggleProps>(
  ({ className, checked, defaultChecked, onCheckedChange, size = "sm", disabled = false, label, children, color, icon, direction = "label-first", style, ...props }, ref) => {
    const [internal, setInternal] = React.useState(defaultChecked ?? false)
    const isControlled = checked !== undefined
    const isChecked = isControlled ? checked : internal
    const sz = SIZE[size] ?? "sm"

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return
      if (!isControlled) setInternal(e.target.checked)
      onCheckedChange?.(e.target.checked)
    }

    const trackSizes = {
      sm: "h-[14px] w-[28px] rounded-[14px]",
      md: "h-[24px] w-[40px] rounded-[24px]",
    }[sz]
    // Thumb sits inside the track (not a sibling of the peer input), so peer-checked
    // can't reach it — drive its position from the isChecked prop instead.
    const thumbSizes = {
      sm: "h-[11px] w-[11px] left-[1.5px]",
      md: "h-[22px] w-[22px] left-[1px]",
    }[sz]
    const thumbTranslate = isChecked
      ? sz === "sm"
        ? "translate-x-[14px]"
        : "translate-x-[16px]"
      : "translate-x-0"

    const onColor = color ? (DS_COLORS.has(color) ? `var(--ds-${color}-700)` : color) : "var(--ds-blue-700)"
    // Default toggle paints its color when checked; a custom `color` paints when UNchecked
    // (warning-style: show amber/red while the setting is off), going neutral when checked.
    const showColor = color ? !isChecked : isChecked
    const text = label ?? children
    const iconTint = (color && ICON_TINT[color]) || "#171717"
    const iconSizeClass = sz === "sm" ? "[&_svg]:size-[10px]" : "[&_svg]:size-4"
    const labelEl = text ? (
      <span className="text-[0.75rem] font-medium capitalize text-[var(--ds-gray-900)]">{text}</span>
    ) : null

    return (
      <label
        className={cn(
          "relative inline-flex touch-manipulation select-none items-center gap-3 whitespace-nowrap py-[3px]",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          className
        )}
        style={style}
      >
        <input
          ref={ref}
          type="checkbox"
          checked={isChecked}
          disabled={disabled}
          onChange={handleChange}
          className="peer sr-only"
          {...props}
        />
        {direction === "label-first" && labelEl}
        <span
          className={cn(
            // --ds-focus-ring is empty in this repo, so peer-focus-visible:ring rendered a
            // light 1px halo hugging the track (looked celeste on the blue). Vercel shows no
            // ring on the toggle, so drop it to match; outline-none kills the native fallback.
            "relative inline-block shrink-0 border-0 bg-clip-padding transition-[background,border-color] duration-150 ease-out peer-focus-visible:outline-none",
            trackSizes,
            disabled
              ? isChecked
                ? "bg-[var(--ds-gray-400)]"
                : "bg-[var(--ds-gray-200)]"
              : showColor
                ? ""
                : color
                  ? "bg-[var(--ds-gray-100)]"
                  : "bg-[var(--ds-gray-400)]"
          )}
          style={showColor && !disabled ? { backgroundColor: onColor } : undefined}
        >
          <div
            className={cn(
              "absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border border-transparent shadow-[0px_0px_3px_-1px_rgba(0,0,0,0.24),0px_0px_0.5px_0px_rgba(0,0,0,0.16),-0.5px_2px_3px_-2px_rgba(0,0,0,0.36)] transition-transform duration-150 ease-in-out",
              thumbSizes,
              thumbTranslate,
              disabled
                ? isChecked
                  ? "bg-[var(--ds-gray-600)]"
                  : "bg-[var(--ds-gray-500)]"
                : "bg-white dark:bg-[#ededed]/84 dark:border-white/50"
            )}
          >
            {icon && (
              <span className={cn("flex items-center justify-center", iconSizeClass)} style={{ color: iconTint }}>
                {isChecked ? icon.checked : icon.unchecked}
              </span>
            )}
          </div>
        </span>
        {direction === "switch-first" && labelEl}
      </label>
    )
  }
)

Toggle.displayName = "Toggle"
