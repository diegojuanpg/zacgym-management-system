"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends Omit<React.ComponentPropsWithoutRef<"input">, "size" | "prefix"> {
  size?: "sm" | "md" | "lg" | "small" | "medium" | "large"
  error?: boolean | string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  prefixStyling?: boolean
  suffixStyling?: boolean
  prefixContainer?: boolean
  suffixContainer?: boolean
  rounded?: boolean
  label?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      size = "medium",
      error,
      prefix,
      suffix,
      prefixStyling = true,
      suffixStyling = true,
      prefixContainer = true,
      suffixContainer = true,
      rounded = false,
      disabled,
      id,
      label,
      ...props
    },
    ref
  ) => {
    const defaultId = React.useId()
    const inputId = id || defaultId
    const errorId = `${inputId}-error`
    const hasError = !!error
    const hasPrefix = !!prefix
    const hasSuffix = !!suffix

    // Map small/medium/large to sm/md/lg
    const mappedSize = {
      small: "sm",
      sm: "sm",
      medium: "md",
      md: "md",
      large: "lg",
      lg: "lg",
    }[size] || "md"

    // Wrapper Sizing classes
    const wrapperHeight = {
      sm: "h-8 text-sm rounded-md [&>input]:h-8 [&>input]:px-3",
      md: "h-9 text-sm rounded-md [&>input]:h-9 [&>input]:px-3",
      lg: "h-10 text-base rounded-lg [&>input]:h-10 [&>input]:text-base [&>input]:px-3",
    }[mappedSize]

    // Focus / Shadow style rules matching Vercel
    const shadowClasses = hasError
      ? "shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] hover:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-500)] has-[:focus]:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] geist-themed geist-error"
      : "shadow-[0_0_0_1px_var(--ds-gray-alpha-400)] hover:shadow-[0_0_0_1px_var(--ds-gray-alpha-500)] has-[input:focus]:!shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0px_0px_0px_4px_rgba(0,0,0,0.16)] dark:has-[input:focus]:!shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0px_0px_0px_4px_rgba(255,255,255,0.24)]"

    // Padding settings for input box based on styling
    const inputPadding = cn(
      "px-3",
      hasPrefix && (prefixStyling ? "pl-0" : "pl-1"),
      hasSuffix && (suffixStyling ? "pr-0" : "pr-1")
    )

    const wrapperRadius = rounded
      ? "rounded-full [&>input]:rounded-full [&>input]:rounded-tl-none [&>input]:rounded-bl-none [&>input]:rounded-tr-none [&>input]:rounded-br-none"
      : cn(
          hasPrefix && "[&>input]:rounded-tl-none [&>input]:rounded-bl-none",
          hasSuffix && "[&>input]:rounded-tr-none [&>input]:rounded-br-none"
        )

    const prefixRadius = rounded
      ? "[&>:nth-child(2)]:rounded-l-full"
      : mappedSize === "lg"
        ? "[&>:nth-child(2)]:rounded-l-lg"
        : "[&>:nth-child(2)]:rounded-l-md"

    const suffixRadius = rounded
      ? "[&>:last-child]:rounded-r-full"
      : mappedSize === "lg"
        ? "[&>:last-child]:rounded-r-lg"
        : "[&>:last-child]:rounded-r-md"

    // Dynamic parent selector styling for prefix and suffix children to support custom or containerless nodes
    const prefixWrapperClasses = hasPrefix && cn(
      prefixStyling
        ? "[&>:nth-child(2)]:bg-[var(--ds-background-200)] [&>:nth-child(2)]:border-r [&>:nth-child(2)]:border-[var(--ds-gray-alpha-400)] [&>:nth-child(2)]:shrink-0 [&>:nth-child(2)]:relative [&>:nth-child(2)]:text-[var(--ds-gray-700)] [&>:nth-child(2)]:px-3 [&>:nth-child(2)]:py-0 [&>:nth-child(2)]:flex [&>:nth-child(2)]:items-center [&>:nth-child(2)]:order-0 [&>:nth-child(2)]:h-full"
        : "[&>:nth-child(2)]:bg-[var(--ds-background-100)] [&>:nth-child(2)]:border-r-0 [&>:nth-child(2)]:-mr-3 [&>:nth-child(2)]:shrink-0 [&>:nth-child(2)]:relative [&>:nth-child(2)]:text-[var(--ds-gray-700)] [&>:nth-child(2)]:px-3 [&>:nth-child(2)]:py-0 [&>:nth-child(2)]:flex [&>:nth-child(2)]:items-center [&>:nth-child(2)]:order-0 [&>:nth-child(2)]:text-sm [&>:nth-child(2)]:h-full",
      prefixRadius
    )

    const suffixWrapperClasses = hasSuffix && cn(
      suffixStyling
        ? "[&>:last-child]:bg-[var(--ds-background-200)] [&>:last-child]:border-l [&>:last-child]:border-[var(--ds-gray-alpha-400)] [&>:last-child]:shrink-0 [&>:last-child]:relative [&>:last-child]:text-[var(--ds-gray-700)] [&>:last-child]:px-3 [&>:last-child]:py-0 [&>:last-child]:flex [&>:last-child]:items-center [&>:last-child]:order-2 [&>:last-child]:h-full"
        : "[&>:last-child]:bg-[var(--ds-background-100)] [&>:last-child]:border-l-0 [&>:last-child]:-ml-3 [&>:last-child]:shrink-0 [&>:last-child]:relative [&>:last-child]:text-[var(--ds-gray-700)] [&>:last-child]:px-3 [&>:last-child]:py-0 [&>:last-child]:flex [&>:last-child]:items-center [&>:last-child]:order-2 [&>:last-child]:text-sm [&>:last-child]:h-full",
      suffixRadius
    )

    const disabledWrapperClasses = disabled && cn(
      "[&:has(input:disabled)>:nth-child(2)]:cursor-not-allowed [&:has(input:disabled)>:last-child]:cursor-not-allowed",
      hasPrefix && !prefixStyling && "[&:has(input:disabled)>:nth-child(2)]:bg-[var(--ds-gray-100)]",
      hasSuffix && !suffixStyling && "[&:has(input:disabled)>:last-child]:bg-[var(--ds-gray-100)]"
    )

    const isLarge = mappedSize === "lg"
    const errorTextClass = isLarge ? "text-base leading-6" : "text-[13px] leading-5"
    const errorIconAlign = isLarge ? "mt-1" : "mt-0.5"

    const inputElement = (
      <div className="w-full">
        {label && (
          <Label htmlFor={inputId}>{label}</Label>
        )}
        <div
          data-slot="input-wrapper"
          data-geist-input-wrapper=""
          data-error={hasError || undefined}
          data-version="v1"
          style={{ "--geist-icon-size": mappedSize === "lg" ? "24px" : mappedSize === "md" ? "20px" : "16px" } as React.CSSProperties}
          className={cn(
            "flex w-full items-center overflow-hidden font-normal transition-all duration-150 bg-transparent",
            disabled ? "cursor-not-allowed" : "",
            wrapperHeight,
            shadowClasses,
            wrapperRadius,
            prefixWrapperClasses,
            suffixWrapperClasses,
            disabledWrapperClasses,
            className
          )}
        >
          {/* Core Input - rendered first in DOM so prefix/suffix overlay it */}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={hasError ? "true" : "false"}
            aria-describedby={typeof error === "string" ? errorId : undefined}
            className={cn(
              "inline-flex appearance-none webkit-search-reset min-w-0 w-full border-none bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)] order-1 outline-none focus:outline-none placeholder:text-[var(--ds-gray-700)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              disabled ? "bg-[var(--ds-gray-100)] text-[var(--ds-gray-700)] cursor-not-allowed opacity-100" : "",
              inputPadding
            )}
            {...props}
          />

          {/* Prefix element */}
          {hasPrefix && (
            prefixContainer ? (
              <label
                data-geist-input-prefix=""
                htmlFor={inputId}
              >
                {prefix}
              </label>
            ) : prefix
          )}

          {/* Suffix element */}
          {hasSuffix && (
            suffixContainer ? (
              <label
                data-geist-input-suffix=""
                htmlFor={inputId}
              >
                {suffix}
              </label>
            ) : suffix
          )}
        </div>

        {/* Error message */}
        {typeof error === "string" && (
          <div
            id={errorId}
            aria-atomic="true"
            className={cn("text-[var(--ds-red-900)] flex items-start mt-2", errorTextClass)}
            role="alert"
          >
            <div aria-hidden="true" className={cn("flex items-center mr-2", errorIconAlign)}>
              <svg viewBox="0 0 16 16" height="16" width="16" data-slot="geist-icon" style={{ color: "var(--ds-red-900)" }}>
                <path fill="currentColor" d="M10.9 0a1 1 0 0 1 .7.3l4.1 4.1.07.07a1 1 0 0 1 .23.63v5.8a1 1 0 0 1-.3.7l-4.1 4.1a1 1 0 0 1-.7.3H5a1 1 0 0 1-.53-.23l-.08-.06-4.1-4.1A1 1 0 0 1 0 10.9V5.1a1 1 0 0 1 .3-.7L4.4.3A1 1 0 0 1 5 0h5.9M1.5 5.3v5.4l3.8 3.8h5.4l3.8-3.8V5.3l-3.8-3.8H5.3zM8 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2m.75-1.25h-1.5v-5h1.5z" />
              </svg>
            </div>
            <div className="break-words">{error}</div>
          </div>
        )}
      </div>
    )

    return inputElement
  }
)

Input.displayName = "Input"

export type LabelProps = React.ComponentPropsWithoutRef<"label">


export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        data-slot="label"
        className={cn("text-[13px] font-medium text-[var(--ds-gray-900)] mb-2 block", className)}
        {...props}
      />
    )
  }
)

Label.displayName = "Label"
