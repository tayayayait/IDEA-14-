import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MobileCardList<T>({
  items,
  getKey,
  renderCard,
  className,
}: {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderCard: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn("space-y-2 md:hidden", className)}>
      {items.map((item, index) => (
        <div key={getKey(item, index)} className="rounded-card border border-border bg-surface p-3">
          {renderCard(item, index)}
        </div>
      ))}
    </div>
  );
}
