"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface Ctx {
  name: string
  value?: string
  disabled?: boolean
  onChange: (v: string) => void
}
const RadioCtx = React.createContext<Ctx | null>(null)

let counter = 0

export interface RadioGroupProps extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange"> {
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
}

export function RadioGroup({
  name,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  children,
  ...props
}: RadioGroupProps) {
  const autoName = React.useMemo(() => name ?? `radio-${counter++}`, [name])
  const [internal, setInternal] = React.useState(defaultValue)
  const current = value !== undefined ? value : internal
  const onChange = (v: string) => {
    if (value === undefined) setInternal(v)
    onValueChange?.(v)
  }

  return (
    <RadioCtx.Provider value={{ name: autoName, value: current, disabled, onChange }}>
      <div
        role="radiogroup"
        data-geist-radio-group=""
        data-version="v1"
        className={cn("flex flex-col gap-4", className)}
        {...props}
      >
        {children}
      </div>
    </RadioCtx.Provider>
  )
}

export interface RadioProps extends Omit<React.ComponentPropsWithoutRef<"label">, "onChange"> {
  value: string
  disabled?: boolean
  required?: boolean
  label?: React.ReactNode
  /** Initial checked state when used standalone (outside a RadioGroup). */
  defaultChecked?: boolean
}

export function Radio({
  value,
  disabled,
  required,
  label,
  defaultChecked,
  className,
  children,
  ...props
}: RadioProps) {
  const ctx = React.useContext(RadioCtx)
  const [selfChecked, setSelfChecked] = React.useState(defaultChecked ?? false)
  const checked = ctx ? ctx.value === value : selfChecked
  const isDisabled = disabled || ctx?.disabled

  return (
    <label
      data-geist-radio-item=""
      className={cn(
        "group inline-flex items-center text-[13px] [--radio-color:var(--ds-gray-700)] select-none",
        isDisabled ? "cursor-not-allowed text-[var(--ds-gray-500)] [--radio-color:var(--ds-gray-500)]" : "cursor-pointer text-[var(--ds-gray-1000)]",
        className
      )}
      {...props}
    >
      <span className="relative -m-0.5 flex items-center p-0.5">
        <input
          type="radio"
          className="peer sr-only"
          name={ctx?.name ?? "standalone"}
          value={value}
          checked={checked}
          required={required}
          disabled={isDisabled}
          onChange={() => (ctx ? ctx.onChange(value) : setSelfChecked(true))}
        />
        <span
          aria-hidden="true"
          className={cn(
            "relative border bg-[var(--ds-background-100)] rounded-full size-4 transition-[border-color,background] duration-200 ease-in",
            "after:content-[''] after:block after:size-2 after:rounded-full after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:scale-0 after:bg-[var(--radio-color)] after:transition-transform after:duration-150 after:ease-in",
            // Focus ring states
            "peer-focus-visible:shadow-[var(--ds-focus-ring)] peer-[data-focus-visible-added]:shadow-[var(--ds-focus-ring)]",
            // Checked states (uses high contrast var(--ds-gray-1000))
            "peer-checked:after:scale-100 peer-checked:[--radio-color:var(--ds-gray-1000)]",
            // Unchecked, non-disabled, hover state: subtle background-color change
            "group-hover:peer-not-checked:peer-not-disabled:bg-[var(--ds-gray-200)] group-hover:peer-not-checked:peer-not-disabled:[--radio-color:var(--ds-gray-900)]",
            // Active state
            "peer-active:[--radio-color:var(--ds-gray-600)]",
            // Border color mapping variable
            "border-[var(--radio-color)]"
          )}
        />
      </span>
      {(label ?? children) && (
        <span className={cn("ml-2", isDisabled ? "" : "group-hover:cursor-pointer")}>
          {label ?? children}
        </span>
      )}
    </label>
  )
}
