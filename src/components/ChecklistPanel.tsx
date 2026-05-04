import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type ChecklistStatus = "todo" | "in_progress" | "done" | "blocked";

export interface ChecklistItem {
  id: string;
  title: string;
  country?: string;
  api?: string;
  status?: ChecklistStatus;
  link?: string;
  checked?: boolean;
}

const STATUS_LABEL: Record<ChecklistStatus, string> = {
  todo: "대기",
  in_progress: "진행 중",
  done: "완료",
  blocked: "차단",
};

const STATUS_CLASS: Record<ChecklistStatus, string> = {
  todo: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-risk-reviewable-soft text-risk-reviewable border-risk-reviewable/30",
  done: "bg-risk-priority-soft text-risk-priority border-risk-priority/30",
  blocked: "bg-risk-high-soft text-risk-high border-risk-high/30",
};

export function ChecklistPanel({
  items,
  onToggle,
  className,
}: {
  items: ChecklistItem[];
  onToggle?: (id: string, checked: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {items.map((item) => {
        const status = item.status ?? "todo";
        return (
          <div key={item.id} className="rounded-md border border-border p-3">
            <div className="flex items-start gap-2">
              {onToggle ? (
                <Checkbox
                  checked={Boolean(item.checked)}
                  onCheckedChange={(checked) => onToggle(item.id, Boolean(checked))}
                  aria-label={`${item.title} 체크`}
                />
              ) : (
                <span className="mt-1 inline-block h-2 w-2 rounded-full bg-muted-foreground/40" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", item.checked && "line-through text-muted-foreground")}>
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  국가: {item.country ?? "-"} · 근거 API: {item.api ?? "-"}
                </p>
                {item.link && (
                  <a href={item.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand hover:underline">
                    원문 링크
                  </a>
                )}
              </div>
              <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_CLASS[status])}>
                {STATUS_LABEL[status]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
