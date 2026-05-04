import { LABEL_KO, type RiskLabel } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const STYLES: Record<RiskLabel, string> = {
  priority: "bg-risk-priority-soft text-risk-priority border-risk-priority/20",
  reviewable: "bg-risk-reviewable-soft text-risk-reviewable border-risk-reviewable/20",
  caution: "bg-risk-caution-soft text-risk-caution border-risk-caution/30",
  high_risk: "bg-risk-high-soft text-risk-high border-risk-high/30",
  unknown: "bg-risk-unknown-soft text-risk-unknown border-risk-unknown/20",
  critical: "bg-muted text-foreground border-border",
};

const DOTS: Record<RiskLabel, string> = {
  priority: "bg-risk-priority",
  reviewable: "bg-risk-reviewable",
  caution: "bg-risk-caution",
  high_risk: "bg-risk-high",
  unknown: "bg-risk-unknown",
  critical: "bg-foreground",
};

export function RiskBadge({ label, size = "md", className }: {
  label: RiskLabel;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={`위험도 ${LABEL_KO[label]}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        STYLES[label],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[label])} aria-hidden />
      {LABEL_KO[label]}
    </span>
  );
}
