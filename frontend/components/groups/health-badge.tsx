import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";

export type HealthLike =
  | { state: "unscored" }
  | { state: "completed" }
  | { state: "new" }
  | {
      state: "scored";
      score: number;
      tier: "thriving" | "steady" | "at-risk" | "critical";
      components?: { attendance: number; streak: number; progress: number };
    };

/**
 * Single source of truth for health-state → badge styling, shared by browse
 * cards and the group detail page so tiers never render two different colors.
 */
export function HealthBadge({ health, showScore = false }: { health: HealthLike; showScore?: boolean }) {
  switch (health.state) {
    case "unscored":
      return <Badge variant="outline" className="text-muted-foreground">No goal</Badge>;
    case "completed":
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" /> Goal completed
        </Badge>
      );
    case "new":
      return <Badge variant="secondary">New</Badge>;
    case "scored": {
      const variant =
        health.tier === "thriving" ? "success"
        : health.tier === "steady" ? "info"
        : health.tier === "at-risk" ? "warning"
        : "danger";
      const label =
        health.tier === "at-risk" ? "At risk"
        : health.tier.charAt(0).toUpperCase() + health.tier.slice(1);
      return (
        <Badge variant={variant}>
          {label}
          {showScore && <span className="opacity-70">· {health.score}</span>}
        </Badge>
      );
    }
  }
}
