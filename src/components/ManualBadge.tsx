import { cn } from "@/lib/utils";

export function ManualBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-risk-caution/40 bg-risk-caution-soft px-2.5 text-[11px] font-medium text-risk-caution",
        className,
      )}
      aria-label="사용자 입력"
    >
      사용자 입력
    </span>
  );
}
