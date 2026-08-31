"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/backend/utils";

export function SidePeek({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={!desktop}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/45 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none md:pointer-events-none md:bg-transparent" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-lg outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right motion-reduce:animate-none sm:max-w-xl",
            className
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-[-0.025em] text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">Details for {title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:w-10" aria-label="Close details">
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer ? <footer className="border-t border-border bg-card px-5 py-4 sm:px-6">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
