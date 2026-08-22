"use client";

import * as React from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { cn } from "@/backend/utils";

const TONE_STYLES = {
  sky:     { bg: "bg-sky-400/8",     icon: "text-sky-300",     accent: "bg-sky-400" },
  orange:  { bg: "bg-orange-500/8",  icon: "text-orange-300",  accent: "bg-orange-400" },
  violet:  { bg: "bg-violet-500/8",  icon: "text-violet-300",  accent: "bg-violet-400" },
  emerald: { bg: "bg-emerald-500/8", icon: "text-emerald-300", accent: "bg-emerald-400" },
} as const;

export type StatTileTone = keyof typeof TONE_STYLES;

function CountUpValue({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v).toLocaleString());
  const [display, setDisplay] = React.useState("0");

  React.useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1] });
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display}</>;
}

/**
 * Glanceable metric tile: icon, big number, supporting label — consistently
 * aligned. Use for dashboard/grades-style stat grids instead of one-off divs.
 */
export function StatTile({
  icon,
  label,
  value,
  unit,
  tone = "sky",
  sub,
  animate: animateValue = true,
  className,
  style,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit?: string;
  tone?: StatTileTone;
  sub?: string;
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const t = TONE_STYLES[tone];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      style={style}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/8 p-5 backdrop-blur transition-shadow duration-200 hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]",
        t.bg,
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-center scale-x-0 opacity-0 transition-[transform,opacity] duration-200 group-hover:scale-x-100 group-hover:opacity-100",
          t.accent
        )}
      />
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className={cn(t.icon, "opacity-70 transition-opacity duration-200 group-hover:opacity-100")}>
          {icon}
        </span>
      </div>
      <p className="text-[28px] font-semibold leading-none tracking-tight text-foreground">
        {animateValue ? <CountUpValue value={value} /> : value.toLocaleString()}
        {unit && <span className="ml-1.5 text-base font-normal text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}
