import { cn } from "@/lib/utils";

type SourceKey =
  | "KICOX"
  | "KOTRA"
  | "K-SURE"
  | "SafetyKorea"
  | "무역안보관리원"
  | "관세평가분류원"
  | "기타";

const SOURCE_STYLE: Record<SourceKey, string> = {
  KICOX: "bg-brand-soft text-brand border-brand/20",
  KOTRA: "bg-risk-reviewable-soft text-risk-reviewable border-risk-reviewable/20",
  "K-SURE": "bg-risk-caution-soft text-risk-caution border-risk-caution/30",
  SafetyKorea: "bg-risk-priority-soft text-risk-priority border-risk-priority/20",
  무역안보관리원: "bg-risk-high-soft text-risk-high border-risk-high/20",
  관세평가분류원: "bg-muted text-muted-foreground border-border",
  기타: "bg-muted text-muted-foreground border-border",
};

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const key = normalizeSource(source);
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium",
        SOURCE_STYLE[key],
        className,
      )}
      aria-label={`출처 ${source}`}
    >
      {source}
    </span>
  );
}

function normalizeSource(source: string): SourceKey {
  const value = source.toLowerCase();
  if (value.includes("kicox")) return "KICOX";
  if (value.includes("kotra")) return "KOTRA";
  if (value.includes("ksure") || value.includes("k-sure")) return "K-SURE";
  if (value.includes("safety") || value.includes("kats")) return "SafetyKorea";
  if (value.includes("yestrade") || value.includes("무역안보")) return "무역안보관리원";
  if (value.includes("관세")) return "관세평가분류원";
  return "기타";
}
