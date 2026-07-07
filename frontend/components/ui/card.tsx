import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/backend/utils"

/**
 * Shared design conventions — apply these consistently across every page
 * instead of inventing new sizes/spacing per page.
 *
 * Typography:
 *   page title       text-2xl font-semibold tracking-tight sm:text-3xl
 *   section heading  text-base font-semibold
 *   card title       text-sm font-semibold
 *   body             text-sm
 *   caption/label    text-xs font-medium uppercase tracking-widest text-muted-foreground
 *
 * Spacing:
 *   card padding         p-6 (CardHeader/CardContent already apply this)
 *   inter-section gap    space-y-6
 *   tight grid gutter    gap-4
 *   section grid gutter  gap-6
 *
 * Radius:
 *   cards / hero panels  rounded-2xl (hero variant: rounded-3xl)
 *   inputs / buttons     rounded-xl
 *   pills / badges       rounded-full
 */

const cardVariants = cva("text-card-foreground", {
  variants: {
    variant: {
      // Standard content card used everywhere by default.
      default: "card-raised rounded-2xl border border-border bg-card",
      // Translucent section panel — for grouped content within a page
      // (replaces one-off `rounded-2xl border border-white/8 bg-[rgba(9,12,24,0.76)]` divs).
      panel:
        "rounded-2xl border border-white/8 bg-[rgba(9,12,24,0.76)] shadow-[0_8px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl",
      // Large translucent hero header — for page-top intro panels
      // (replaces one-off `rounded-3xl border ... bg-[rgba(12,15,27,0.82)]` divs).
      hero: "rounded-3xl border border-sky-400/15 bg-[rgba(12,15,27,0.82)] shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
