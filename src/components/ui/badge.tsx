"use client"

import * as React from "react"
import Link from "next/link"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center rounded-full whitespace-nowrap py-0.5 font-medium capitalize tabular-nums select-none transition-all [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:block",
  {
    variants: {
      variant: {
        gray: "bg-[var(--ds-gray-900)] dark:bg-[var(--ds-gray-500)] text-[var(--ds-contrast-fg)]",
        "gray-subtle": "bg-[var(--ds-gray-200)] text-[var(--ds-gray-1000)]",
        blue: "bg-[var(--ds-blue-800)] text-white",
        "blue-subtle": "bg-[var(--ds-blue-200)] text-[var(--ds-blue-900)]",
        purple: "bg-[var(--ds-purple-900)] dark:bg-[var(--ds-purple-500)] text-[var(--ds-contrast-fg)]",
        "purple-subtle": "bg-[var(--ds-purple-200)] text-[var(--ds-purple-900)]",
        amber: "bg-[var(--ds-amber-700)] text-black",
        "amber-subtle": "bg-[var(--ds-amber-200)] text-[var(--ds-amber-900)]",
        red: "bg-[var(--ds-red-900)] dark:bg-[var(--ds-red-800)] text-[var(--ds-contrast-fg)]",
        "red-subtle": "bg-[var(--ds-red-200)] text-[var(--ds-red-900)]",
        pink: "bg-[var(--ds-pink-900)] dark:bg-[var(--ds-pink-600)] text-[var(--ds-contrast-fg)]",
        "pink-subtle": "bg-[var(--ds-pink-300)] text-[var(--ds-pink-900)]",
        green: "bg-[var(--ds-green-900)] dark:bg-[var(--ds-green-600)] text-[var(--ds-contrast-fg)]",
        "green-subtle": "bg-[var(--ds-green-200)] text-[var(--ds-green-900)]",
        teal: "bg-[var(--ds-teal-900)] dark:bg-[var(--ds-teal-600)] text-[var(--ds-contrast-fg)]",
        "teal-subtle": "bg-[var(--ds-teal-300)] text-[var(--ds-teal-900)]",
        inverted: "bg-[var(--ds-gray-1000)] text-[var(--ds-gray-100)]",
        trial: "bg-gradient-to-r from-[#0070f3] to-[#f81ce5] text-white",
        turbo: "bg-gradient-to-r from-[#ff1e56] to-[#0096ff] text-white",
        pill: "bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)] ring-1 ring-[var(--ds-gray-alpha-400)] hover:bg-[var(--ds-gray-200)] cursor-pointer no-underline",
      },
      size: {
        sm: "text-[11px] h-5 px-1.5 gap-1 tracking-[0.2px] [&_svg]:size-3",
        md: "text-[12px] h-6 px-3 gap-1 [&_svg]:size-3.5 [&_svg]:-ml-0.5",
        lg: "text-sm h-8 px-3 gap-1.5 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "gray",
      size: "md",
    },
  }
)

export interface BadgeProps
  extends React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof badgeVariants> {
  href?: string
}

export function Badge({
  className,
  variant,
  size,
  href,
  children,
  ...props
}: BadgeProps) {
  if (href) {
    return (
      <Link
        href={href}
        className={cn(badgeVariants({ variant, size, className }))}
        {...(props as any)}
      >
        {children}
      </Link>
    )
  }

  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </span>
  )
}
