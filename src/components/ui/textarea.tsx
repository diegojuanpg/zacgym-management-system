"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps extends Omit<React.ComponentPropsWithoutRef<"textarea">, "size"> {
  error?: boolean | string
  size?: "xs" | "sm" | "md" | "lg" | "small" | "medium" | "large"
  autoResize?: boolean
  showCount?: boolean
  resize?: "none" | "y" | "x" | "both" | boolean
}

const TA_SIZE: Record<string, "xs" | "sm" | "md" | "lg"> = {
  xs: "xs",
  sm: "sm",
  small: "sm",
  md: "md",
  medium: "md",
  lg: "lg",
  large: "lg",
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      error,
      size = "md",
      autoResize = false,
      showCount = false,
      resize = "none",
      maxLength,
      onChange,
      defaultValue,
      value,
      style,
      ...props
    },
    ref
  ) => {
    const innerRef = React.useRef<HTMLTextAreaElement>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement)

    const [count, setCount] = React.useState(
      () => String(value ?? defaultValue ?? "").length
    )

    const resizeTextArea = React.useCallback(() => {
      const node = innerRef.current
      if (!node || !autoResize) return
      node.style.height = "auto"
      node.style.height = `${node.scrollHeight}px`
    }, [autoResize])

    React.useEffect(resizeTextArea, [resizeTextArea, value])

    const wrapperSizes = {
      xs: "rounded-md text-xs shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]",
      sm: "rounded-md text-sm shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]",
      md: "rounded-md text-sm shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]",
      lg: "rounded-lg text-base shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]",
    }

    const hasError = !!error

    return (
      <div className="flex w-full flex-col gap-1.5">
        <div
          data-geist-textarea-wrapper=""
          className={cn(
            "flex max-w-full transition-all duration-150 overflow-hidden font-normal w-full",
            wrapperSizes[TA_SIZE[size] ?? "md"],
            hasError
              ? "shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)] hover:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-500)] has-[:focus]:shadow-[0_0_0_1px_var(--ds-red-900),0_0_0_4px_var(--ds-red-300)]"
              : "hover:shadow-[0_0_0_1px_var(--ds-gray-alpha-500)] has-[:focus]:!shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0px_0px_0px_4px_rgba(0,0,0,0.16)] dark:has-[:focus]:!shadow-[0_0_0_1px_var(--ds-gray-alpha-600),0px_0px_0px_4px_rgba(255,255,255,0.24)]"
          )}
        >
          <textarea
            ref={innerRef}
            value={value}
            defaultValue={defaultValue}
            maxLength={maxLength}
            aria-invalid={hasError || undefined}
            onChange={(event) => {
              setCount(event.target.value.length)
              resizeTextArea()
              onChange?.(event)
            }}
            className={cn(
              "py-2.5 px-3 w-full border-none bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)] placeholder:text-[var(--ds-gray-700)] focus:outline-none disabled:bg-[var(--ds-gray-100)] disabled:cursor-not-allowed disabled:placeholder:text-[var(--ds-gray-600)] min-h-[100px]",
              autoResize
                ? "resize-none overflow-hidden"
                : resize === "y"
                ? "resize-y"
                : resize === "x"
                ? "resize-x"
                : resize === "both" || resize === true
                ? "resize"
                : "resize-none",
              className
            )}
            style={style}
            {...props}
          />
        </div>

        {/* Character Count */}
        {showCount && maxLength && (
          <span className="text-xs text-[var(--ds-gray-700)] self-end tabular-nums mr-1">
            {count}/{maxLength}
          </span>
        )}

        {/* Error message */}
        {typeof error === "string" && (
          <div
            aria-atomic="true"
            data-geist-error=""
            data-version="v1"
            role="alert"
            className="text-[var(--ds-red-900)] flex items-start text-[13px] leading-5 mt-1.5"
          >
            <div aria-hidden="true" className="flex items-center mr-2 mt-0.5 shrink-0 text-[var(--ds-red-900)]">
              <svg viewBox="0 0 16 16" height="16" width="16" data-slot="geist-icon" style={{ color: "currentColor" }}>
                <path
                  fill="currentColor"
                  d="M10.9 0a1 1 0 0 1 .7.3l4.1 4.1.07.07a1 1 0 0 1 .23.63v5.8a1 1 0 0 1-.3.7l-4.1 4.1a1 1 0 0 1-.7.3H5a1 1 0 0 1-.53-.23l-.08-.06-4.1-4.1A1 1 0 0 1 0 10.9V5.1a1 1 0 0 1 .3-.7L4.4.3A1 1 0 0 1 5 0h5.9M1.5 5.3v5.4l3.8 3.8h5.4l3.8-3.8V5.3l-3.8-3.8H5.3zM8 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2m.75-1.25h-1.5v-5h1.5z"
                />
              </svg>
            </div>
            <div className="break-words">{error}</div>
          </div>
        )}
      </div>
    )
  }
)

Textarea.displayName = "Textarea"
