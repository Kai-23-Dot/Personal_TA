"use client";

import { useId } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

type AuthFieldLabelProps = {
  help: string;
  htmlFor: string;
  label: string;
};

/** Accessible field requirements shown on hover, keyboard focus, or tap. */
export function AuthFieldLabel({ help, htmlFor, label }: AuthFieldLabelProps) {
  const helpId = useId();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={htmlFor}>{label}</label>
      <TooltipPrimitive.Provider delayDuration={120}>
        <TooltipPrimitive.Root>
          <TooltipPrimitive.Trigger asChild>
            <button
              type="button"
              aria-label={`${label} requirements`}
              aria-describedby={helpId}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-sky-300/35 bg-sky-300/10 text-sky-300 transition-colors hover:border-sky-300/70 hover:bg-sky-300/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
            >
              <Info aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
            </button>
          </TooltipPrimitive.Trigger>
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              id={helpId}
              side="top"
              align="start"
              sideOffset={8}
              collisionPadding={16}
              className="z-[100] w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-sky-300/25 bg-slate-950 px-3.5 py-3 text-xs font-medium leading-5 text-slate-100 shadow-2xl shadow-black/50"
            >
              {help}
              <TooltipPrimitive.Arrow className="fill-sky-300/25" />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    </div>
  );
}
