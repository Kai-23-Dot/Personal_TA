import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base: smooth transition across all properties, active press-down scale
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-smooth-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: violet + glow via .btn-primary-glow CSS class (avoids rgba comma issues in scanner)
        default:
          "btn-primary-glow bg-primary text-white hover:bg-primary/90",
        // Destructive
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90",
        // Outline: ghosted with border, subtle fill on hover
        outline:
          "border border-border/60 bg-transparent text-foreground shadow-sm hover:bg-white/5 hover:border-border active:bg-white/10",
        // Secondary: muted fill
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/70 active:bg-secondary",
        // Ghost: invisible until hover
        ghost:
          "text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10",
        // Link: text link
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80 active:opacity-75",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
