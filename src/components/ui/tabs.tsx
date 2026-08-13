"use client"

import * as React from "react"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface TabItem {
  title: React.ReactNode
  value: string
  icon?: React.ReactNode
  disabled?: boolean
  tooltip?: React.ReactNode
}

interface TabsContextValue {
  activeTab: string | undefined
  setActiveTab: (val: string) => void
  variant: "primary" | "secondary"
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error("Tabs components must be used within a <Tabs> provider")
  return ctx
}

export interface TabsProps extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange"> {
  value?: string
  defaultValue?: string
  onValueChange?: (val: string) => void
  variant?: "primary" | "secondary" | "underline" | "pill"
  /** Array API: render a tab bar directly (no content panels). */
  tabs?: TabItem[]
  selected?: string
  setSelected?: (val: string) => void
  /** Disable every tab. */
  disabled?: boolean
}

export function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  variant = "primary",
  tabs,
  selected,
  setSelected,
  disabled,
  children,
  ...props
}: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue ?? selected)
  const activeTab = selected ?? value ?? internal

  // Normalize variant names to match Vercel's primary/secondary
  const normalizedVariant = (variant === "underline" ? "primary" : variant === "pill" ? "secondary" : variant) as "primary" | "secondary"

  const setActiveTab = React.useCallback(
    (next: string) => {
      if (selected === undefined && value === undefined) setInternal(next)
      setSelected?.(next)
      onValueChange?.(next)
    },
    [selected, value, setSelected, onValueChange]
  )

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, variant: normalizedVariant }}>
      <div data-slot="tabs" className={cn("flex w-full flex-col", className)} {...props}>
        {tabs ? (
          <TabsList>
            {tabs.map((t) => {
              const trigger = (
                <TabsTrigger key={t.value} value={t.value} disabled={disabled || t.disabled}>
                  {t.icon ? (
                    <span className="flex items-center gap-2 [&_svg]:size-4">
                      {t.icon}
                      {t.title}
                    </span>
                  ) : (
                    t.title
                  )}
                </TabsTrigger>
              )
              return t.tooltip ? (
                <Tooltip key={t.value} content={t.tooltip}>
                  {trigger}
                </Tooltip>
              ) : (
                trigger
              )
            })}
          </TabsList>
        ) : (
          children
        )}
      </div>
    </TabsContext.Provider>
  )
}

export type TabsListProps = React.ComponentPropsWithoutRef<"div">

export function TabsList({ className, children, ...props }: TabsListProps) {
  const { variant } = useTabs()
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      data-geist-tabs=""
      data-variant={variant}
      data-version="v1"
      className={cn(
        "group no-scrollbar flex flex-nowrap items-center pb-px overflow-x-auto select-none",
        variant === "primary"
          ? "gap-6 shadow-[0_-1px_0_var(--ds-gray-200)_inset] h-12"
          : "gap-1.5 py-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export interface TabsTriggerProps extends React.ComponentPropsWithoutRef<"button"> {
  value: string
}

export function TabsTrigger({ className, value, children, ...props }: TabsTriggerProps) {
  const { activeTab, setActiveTab, variant } = useTabs()
  const isActive = activeTab === value

  return (
    <button
      type="button"
      role="tab"
      data-geist-tab=""
      data-show-focus-ring="true"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setActiveTab(value)}
      className={cn(
        "cursor-pointer outline-none flex items-center justify-center bg-transparent border-0 font-medium transition-all duration-150 ease-in-out disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary"
          ? cn(
              "-mb-px py-3.5 px-0.5 text-sm text-[var(--ds-gray-900)] border-b-2 border-transparent",
              "hover:text-[var(--ds-gray-1000)]",
              "aria-selected:text-[var(--ds-gray-1000)] aria-selected:border-[var(--ds-gray-1000)]",
              "focus-visible:shadow-[var(--ds-focus-ring)]"
            )
          : cn(
              "h-6 px-2.5 rounded-md text-[13px] text-[var(--ds-gray-900)] bg-[var(--ds-gray-alpha-200)]",
              "hover:bg-[var(--ds-gray-alpha-300)] hover:text-[var(--ds-gray-1000)]",
              "aria-selected:bg-[var(--ds-gray-1000)] aria-selected:text-[var(--ds-background-100)]",
              "focus-visible:shadow-[var(--ds-focus-ring)]"
            ),
        className
      )}
      {...props}
    >
      <span>{children}</span>
    </button>
  )
}

export interface TabsContentProps extends React.ComponentPropsWithoutRef<"div"> {
  value: string
}

export function TabsContent({ className, value, children, ...props }: TabsContentProps) {
  const { activeTab } = useTabs()
  const isActive = activeTab === value

  if (!isActive) return null

  return (
    <div
      role="tabpanel"
      data-slot="tabs-content"
      className={cn("outline-none pt-4", className)}
      {...props}
    >
      {children}
    </div>
  )
}
