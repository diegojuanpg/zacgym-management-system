"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Spinner } from "./spinner"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:border-transparent disabled:bg-[var(--ds-gray-100)] disabled:text-[var(--ds-gray-700)] disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-[var(--ds-gray-1000)] text-[var(--ds-background-100)] hover:bg-black/90 dark:hover:bg-white/90 focus-visible:shadow-[var(--ds-focus-ring)]",
        secondary: "border border-[var(--ds-gray-400)] bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-100)] dark:hover:bg-[var(--ds-gray-200)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:shadow-[0_0_0_1px_var(--ds-gray-400)]",
        tertiary: "bg-transparent text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-alpha-200)] focus-visible:shadow-[var(--ds-focus-ring)]",
        error: "bg-[var(--ds-red-800)] text-white hover:bg-[var(--ds-red-900)] focus-visible:shadow-[var(--ds-focus-ring)]",
        warning: "bg-[var(--ds-amber-800)] text-black hover:bg-[var(--ds-amber-700)] focus-visible:shadow-[var(--ds-focus-ring)]",
        ghost: "text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-alpha-200)] focus-visible:shadow-[var(--ds-focus-ring)]",
        outline: "border border-[var(--ds-gray-400)] bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-100)] dark:hover:bg-[var(--ds-gray-200)] focus-visible:shadow-[var(--ds-focus-ring)]",
        link: "text-[var(--ds-blue-700)] hover:underline focus-visible:shadow-[var(--ds-focus-ring)]",
        custom: "btn-custom border",
      },
      size: {
        xs: "h-6 gap-1 px-1.5 text-xs rounded-[4px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-1.5 text-sm rounded-[6px] [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-9 gap-2 px-2.5 text-sm rounded-[6px]",
        lg: "h-10 gap-2 px-3.5 text-base rounded-[8px]",
        icon: "size-9 rounded-[6px]",
        "icon-xs": "size-6 rounded-[4px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[6px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10 rounded-[8px]",
      },
      shape: {
        default: "",
        rounded: "rounded-full",
        square: "rounded-none",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      shape: "default",
    },
  }
)

export interface ButtonProps
  extends Omit<ButtonPrimitive.Props, "prefix">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  shape = "default",
  loading = false,
  disabled,
  prefix,
  suffix,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, shape }), (loading || prefix || suffix) && "gap-0", className)}
      {...props}
    >
      {loading && (
        <span className="mr-0.5 inline-flex shrink-0 items-center justify-center">
          <Spinner size={size === "sm" || size === "xs" ? 12 : size === "lg" ? 20 : 16} className="text-current" />
        </span>
      )}
      {!loading && prefix && <span className="mr-0.5 inline-flex min-w-5 shrink-0 items-center justify-center">{prefix}</span>}
      <span className="truncate inline-block px-0.5">{children}</span>
      {!loading && suffix && <span className="ml-0.5 inline-flex min-w-5 shrink-0 items-center justify-center">{suffix}</span>}
    </ButtonPrimitive>
  )
}
