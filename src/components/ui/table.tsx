"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export function TableRoot({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="table-root" className={cn("relative w-full overflow-x-auto", className)} {...props} />
}

export function Table({ className, children, ...props }: React.ComponentProps<"table">) {
  const childrenArray = React.Children.toArray(children)
  const headerIndex = childrenArray.findIndex(
    (child) => React.isValidElement(child) && (child.type === TableHeader || (typeof child.type === "string" && child.type === "thead"))
  )

  const newChildren = [...childrenArray]
  if (headerIndex !== -1 && headerIndex < childrenArray.length - 1) {
    newChildren.splice(headerIndex + 1, 0, <tbody key="spacer" aria-hidden="true" className="h-3 block" />)
  }

  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom border-collapse text-left text-sm text-[var(--ds-gray-1000)]", className)}
    >
      {newChildren}
    </table>
  )
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b [&_tr]:border-[var(--ds-gray-400)]", className)} {...props} />
}

export interface TableBodyProps extends React.ComponentProps<"tbody"> {
  striped?: boolean
  bordered?: boolean
  interactive?: boolean
}

export function TableBody({ className, striped, bordered, interactive, ...props }: TableBodyProps) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "[&_td:first-child]:rounded-l-sm [&_td:last-child]:rounded-r-sm",
        striped && "[&_tr:where(:nth-child(odd))]:bg-[var(--ds-background-200)]",
        bordered && "[&_tr:not(:last-child)]:border-b [&_tr:not(:last-child)]:border-[var(--ds-gray-400)]",
        interactive && "[&_tr]:cursor-pointer [&_tr]:transition-colors [&_tr:hover]:bg-[var(--ds-gray-100)]",
        className
      )}
      {...props}
    />
  )
}

export function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-[var(--ds-gray-400)] font-medium text-[var(--ds-gray-1000)]", className)}
      {...props}
    />
  )
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("transition-colors", className)} {...props} />
}

export interface TableHeadProps extends React.ComponentProps<"th"> {
  numeric?: boolean
}

export function TableHead({ className, numeric, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 whitespace-nowrap px-2 text-left align-middle font-medium text-[var(--ds-gray-900)]",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export interface TableCellProps extends React.ComponentProps<"td"> {
  numeric?: boolean
}

export function TableCell({ className, numeric, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "whitespace-nowrap px-2 py-2.5 align-middle text-[var(--ds-gray-900)]",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("py-3 text-xs text-[var(--ds-gray-700)]", className)} {...props} />
}

export function TableColgroup({ ...props }: React.ComponentProps<"colgroup">) {
  return <colgroup {...props} />
}

export function TableCol({ ...props }: React.ComponentProps<"col">) {
  return <col {...props} />
}
