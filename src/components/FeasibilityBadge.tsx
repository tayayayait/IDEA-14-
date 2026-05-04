import type { FeasibilityGrade } from "@/lib/report-feasibility";
import { getFeasibilityLabel } from "@/lib/report-feasibility";

const GRADE_STYLES: Record<FeasibilityGrade, { bg: string; text: string; border: string }> = {
  go: { bg: "bg-[#dcfce7]", text: "text-[#166534]", border: "border-[#bbf7d0]" },
  conditional: { bg: "bg-[#fef9c3]", text: "text-[#854d0e]", border: "border-[#fde68a]" },
  hold: { bg: "bg-[#fee2e2]", text: "text-[#991b1b]", border: "border-[#fecaca]" },
};

const PRINT_STYLES: Record<FeasibilityGrade, string> = {
  go: "bg-[#dcfce7] text-[#166534] border-[#bbf7d0]",
  conditional: "bg-[#fef9c3] text-[#854d0e] border-[#fde68a]",
  hold: "bg-[#fee2e2] text-[#991b1b] border-[#fecaca]",
};

interface FeasibilityBadgeProps {
  grade: FeasibilityGrade;
  /** true for print/PDF mode (smaller text) */
  compact?: boolean;
}

export function FeasibilityBadge({ grade, compact = false }: FeasibilityBadgeProps) {
  const style = GRADE_STYLES[grade] ?? GRADE_STYLES.hold;
  const label = getFeasibilityLabel(grade);
  const sizeClass = compact
    ? "px-1.5 py-0.5 text-[9px]"
    : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${style.bg} ${style.text} ${style.border} ${sizeClass}`}
    >
      {label}
    </span>
  );
}

/** Print-only variant (plain inline styles for html2canvas compatibility) */
export function FeasibilityBadgePrint({ grade }: { grade: FeasibilityGrade }) {
  const label = getFeasibilityLabel(grade);
  const cls = PRINT_STYLES[grade] ?? PRINT_STYLES.hold;
  return (
    <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${cls}`}>
      {label}
    </span>
  );
}
