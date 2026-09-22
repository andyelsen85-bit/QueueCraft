import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
  activeValue: string
  onValueChange: (value: string) => void
} | null>(null)

const Tabs = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("w-full", className)} {...props} />
))
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    activeValue?: string
    onValueChange?: (value: string) => void
  }
>(({ className, children, activeValue, onValueChange, ...props }, ref) => {
  const context = React.useContext(TabsContext)
  const resolvedActiveValue = activeValue ?? context?.activeValue
  const resolvedOnValueChange = onValueChange ?? context?.onValueChange

  return (
    <div
      ref={ref}
      className={cn("flex h-10 max-w-full items-center justify-start overflow-x-auto rounded-sm bg-muted p-1 text-muted-foreground", className)}
      {...props}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, {
              activeValue: resolvedActiveValue,
              onValueChange: resolvedOnValueChange,
            })
          : child
      )}
    </div>
  )
})
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string; activeValue?: string; onValueChange?: (v: string) => void }
>(({ className, value, activeValue, onValueChange, ...props }, ref) => {
  const context = React.useContext(TabsContext)
  const resolvedActiveValue = activeValue ?? context?.activeValue
  const resolvedOnValueChange = onValueChange ?? context?.onValueChange
  const isActive = resolvedActiveValue === value
  return (
    <button
      ref={ref}
      type="button"
      data-state={isActive ? "active" : "inactive"}
      onClick={() => resolvedOnValueChange?.(value)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive ? "bg-background text-foreground shadow-sm" : "hover:bg-background/50 hover:text-foreground",
        className
      )}
      {...props}
    />
  )
})
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value: string
    activeValue?: string
    onValueChange?: (value: string) => void
  }
>(({ className, value, activeValue, onValueChange: _onValueChange, ...props }, ref) => {
  const context = React.useContext(TabsContext)
  const resolvedActiveValue = activeValue ?? context?.activeValue
  if (value !== resolvedActiveValue) return null
  return (
    <div
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  )
})
TabsContent.displayName = "TabsContent"

export function TabsRoot({
  defaultValue,
  value,
  onValueChange,
  children,
  className
}: {
  defaultValue?: string
  value?: string
  onValueChange?: (val: string) => void
  children: React.ReactNode
  className?: string
}) {
  const [internalValue, setInternalValue] = React.useState(value ?? defaultValue ?? "")
  const activeValue = value !== undefined ? value : internalValue

  const handleValueChange = (v: string) => {
    if (value === undefined) setInternalValue(v)
    onValueChange?.(v)
  }

  return (
    <TabsContext.Provider value={{ activeValue, onValueChange: handleValueChange }}>
      <Tabs className={className}>{children}</Tabs>
    </TabsContext.Provider>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
