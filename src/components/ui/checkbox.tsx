"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<"button">, "onChange" | "value"> {
  checked?: boolean | "indeterminate"
  onCheckedChange?: (checked: boolean | "indeterminate") => void
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => {
    const isChecked = checked === true
    const isIndeterminate = checked === "indeterminate"

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return
      e.preventDefault()
      if (!onCheckedChange) return
      onCheckedChange(isIndeterminate ? true : !isChecked)
    }

    // dash (indeterminate) stroke color: gray-500 when disabled, else gray-700
    const dashStroke = disabled ? "var(--ds-gray-500)" : "var(--ds-gray-700)"

    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={isIndeterminate ? "mixed" : isChecked}
        disabled={disabled}
        ref={ref}
        onClick={handleClick}
        data-slot="checkbox"
        data-state={isIndeterminate ? "indeterminate" : isChecked ? "checked" : "unchecked"}
        className={cn(
          "relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm border transition-all duration-200 outline-none select-none",
          // base (unchecked / indeterminate keep this surface)
          "bg-[var(--ds-background-100)] border-[var(--ds-gray-700)]",
          !disabled && "cursor-pointer",
          disabled && "cursor-not-allowed",
          // hover (enabled, not checked)
          !disabled && !isChecked && "hover:bg-[var(--ds-gray-200)]",
          "focus-visible:shadow-[var(--ds-focus-ring)]",
          // checked (filled) — indeterminate stays unfilled
          isChecked && "bg-[var(--ds-gray-1000)] border-[var(--ds-gray-1000)]",
          // disabled surfaces
          disabled && !isChecked && "bg-[var(--ds-gray-100)] border-[var(--ds-gray-500)]",
          disabled && isChecked && "bg-[var(--ds-gray-600)] border-[var(--ds-gray-600)]",
          className
        )}
        {...props}
      >
        {isChecked && (
          <svg fill="none" height="100%" viewBox="0 0 20 20" width="100%" className="size-4">
            <path
              stroke="var(--geist-background)"
              d="M14 7L8.5 12.5L6 10"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        )}
        {isIndeterminate && (
          <svg fill="none" height="100%" viewBox="0 0 20 20" width="100%" className="size-4">
            <line
              stroke={dashStroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              x1={5}
              x2={15}
              y1={10}
              y2={10}
            />
          </svg>
        )}
      </button>
    )
  }
)

Checkbox.displayName = "Checkbox"
