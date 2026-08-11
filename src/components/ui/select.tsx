"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const ChevronDown = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" width="16" height="16" className={cn("size-4", className)}>
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="m14.06 5.5-.53.53-4.82 4.82a1 1 0 0 1-1.42 0L2.47 6.03l-.53-.53L3 4.44l.53.53L8 9.44l4.47-4.47.53-.53z"
      clipRule="evenodd"
    />
  </svg>
)

type SelectSize = "small" | "medium" | "large"

export interface SelectProps extends Omit<React.ComponentPropsWithoutRef<"select">, "size" | "prefix"> {
  size?: SelectSize
  /** Red border; a string also renders a message below the field. */
  error?: string | boolean
  label?: React.ReactNode
  placeholder?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}

const sizeStyles: Record<SelectSize, string> = {
  small: "h-8 rounded-md text-sm",
  medium: "h-9 rounded-md text-sm",
  large: "h-10 rounded-lg text-base",
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    { className, size = "medium", error, label, placeholder, prefix, suffix, disabled, children, value, defaultValue, onChange, id, ...props },
    ref
  ) => {
    const autoId = React.useId()
    const selectId = id ?? autoId
    const [internal, setInternal] = React.useState<string>((defaultValue as string) ?? "")
    const val = value !== undefined ? String(value) : internal
    const isPlaceholder = placeholder !== undefined && val === ""

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (value === undefined) setInternal(e.target.value)
      onChange?.(e)
    }

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-[13px] text-[var(--ds-gray-1000)]">
            {label}
          </label>
        )}
        <div
          data-geist-select=""
          data-version="v1"
          className="group relative flex w-full items-center"
        >
          {prefix && (
            <span className="pointer-events-none absolute left-3 z-10 flex items-center text-[var(--ds-gray-900)] transition-colors duration-150 ease-in group-hover:text-[var(--ds-gray-1000)] [&_svg]:size-4">
              {prefix}
            </span>
          )}

          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            value={val}
            onChange={handleChange}
            aria-invalid={error ? "true" : undefined}
            className={cn(
              "peer w-full cursor-pointer appearance-none truncate border-none bg-[var(--ds-background-100)] pr-9 shadow-[0_0_0_1px_var(--ds-gray-alpha-400)] transition-[box-shadow,color] duration-200",
              "hover:shadow-[0_0_0_1px_var(--ds-gray-alpha-500)]",
              "focus:shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0_0_0_4px_rgba(255,255,255,0.12)] focus:outline-none",
              "disabled:cursor-not-allowed disabled:bg-[var(--ds-gray-100)] disabled:text-[var(--ds-gray-700)] disabled:opacity-100",
              isPlaceholder ? "text-[var(--ds-gray-900)]" : "text-[var(--ds-gray-1000)]",
              sizeStyles[size],
              prefix ? "pl-[34px]" : "pl-3",
              error && "shadow-[0_0_0_1px_var(--ds-red-900)] focus:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_rgba(255,97,102,0.16)]",
              className
            )}
            {...props}
          >
            {placeholder !== undefined && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {children}
          </select>

          <span className="pointer-events-none absolute right-3 z-10 flex items-center text-[var(--ds-gray-900)] transition-colors duration-150 ease-in group-hover:text-[var(--ds-gray-1000)] [&_svg]:size-4">
            {suffix ?? <ChevronDown />}
          </span>
        </div>
        {typeof error === "string" && (
          <span className="text-[13px] text-[var(--ds-red-900)]">{error}</span>
        )}
      </div>
    )
  }
)

Select.displayName = "Select"
