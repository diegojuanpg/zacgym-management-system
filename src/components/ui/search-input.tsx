"use client"

import * as React from "react"
import { Input, type InputProps } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

const SearchIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" data-slot="geist-icon" style={{ color: "currentColor" }}>
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M1.5 6.5a5 5 0 1 1 10 0 5 5 0 0 1-10 0m5-6.5a6.5 6.5 0 1 0 4.04 11.6l3.43 3.43.53.53 1.06-1.06-.53-.53-3.43-3.43A6.5 6.5 0 0 0 6.5 0"
      clipRule="evenodd"
    />
  </svg>
)

function Keycap({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <kbd
      onClick={onClick}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-[var(--ds-background-100)] px-1 font-sans text-xs font-medium leading-[1.7em] text-[var(--ds-gray-900)] shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]",
        onClick && "cursor-pointer"
      )}
    >
      {children}
    </kbd>
  )
}

export interface SearchInputProps extends Omit<InputProps, "suffix" | "value" | "onChange"> {
  value?: string
  defaultValue?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onValueChange?: (value: string) => void
  loading?: boolean
  showShortcut?: boolean
  cmdk?: boolean
  /** Override the leading icon (defaults to the magnifying glass). */
  prefix?: React.ReactNode
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, defaultValue, onChange, onValueChange, loading = false, showShortcut = false, cmdk = false, prefix, disabled, onKeyDown, ...props }, ref) => {
    const [internal, setInternal] = React.useState(defaultValue ?? "")
    const val = value !== undefined ? value : internal
    const innerRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

    const set = (v: string) => {
      if (value === undefined) setInternal(v)
      onValueChange?.(v)
    }
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      set(e.target.value)
      onChange?.(e)
    }
    const clear = () => {
      set("")
      innerRef.current?.focus()
    }

    const isDirty = val.length > 0
    const displayCmdk = cmdk || showShortcut

    // Esc (clears) appears whenever there's text; ⌘K appears when empty in cmdk mode.
    const suffix =
      !disabled && (isDirty || displayCmdk) ? (
        <span className="flex select-none items-center gap-1 pr-2.5">
          {isDirty ? (
            <Keycap onClick={clear}>Esc</Keycap>
          ) : (
            <>
              <Keycap>⌘</Keycap>
              <Keycap>K</Keycap>
            </>
          )}
        </span>
      ) : undefined

    return (
      <Input
        ref={innerRef}
        value={val}
        disabled={disabled}
        type="search"
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Escape" && isDirty) {
            e.preventDefault()
            clear()
          }
          onKeyDown?.(e)
        }}
        prefix={loading ? <Spinner size={16} className="text-[var(--ds-gray-700)]" /> : (prefix ?? <SearchIcon />)}
        prefixStyling={false}
        suffixStyling={false}
        suffixContainer={false}
        suffix={suffix}
        {...props}
      />
    )
  }
)

SearchInput.displayName = "SearchInput"
