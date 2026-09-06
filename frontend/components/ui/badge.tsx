import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/backend/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium backdrop-blur transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary: "border-border bg-secondary/80 text-secondary-foreground hover:bg-secondary",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "border-border text-foreground",
        // Tinted glass badges — use these for status/category pills instead of one-off inline classes.
        info: "border-[var(--rule)] bg-[var(--blue-wash)] text-primary",
        success: "border-[var(--success-ink)] bg-[var(--success-bg)] text-[hsl(var(--success))]",
        warning: "border-[var(--warning-ink)] bg-[var(--warning-bg)] text-[var(--warning-ink)]",
        danger: "border-[var(--danger-ink)] bg-[var(--danger-bg)] text-[var(--danger-ink)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
