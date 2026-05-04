import { Check, Factory, FileText, Globe2, PackageSearch } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import type { ProjectStepCompletion } from "@/lib/project-progress";
import { preloadRoute } from "@/lib/route-preload";

type StepDef = {
  n: keyof ProjectStepCompletion;
  key: "company" | "product" | "countries" | "country" | "report";
  label: string;
  path: string;
  icon: typeof Factory;
  requirements: string;
  requiresCountry?: boolean;
};

const REQUIREMENT_LABEL = "\uC694\uAD6C\uC0AC\uD56D";

export const STEPS: StepDef[] = [
  {
    n: 1,
    key: "company",
    label: "\uAE30\uC5C5\u00B7\uACF5\uC7A5 \uAC80\uC0C9",
    path: "company",
    icon: Factory,
    requirements: `${REQUIREMENT_LABEL} 1`,
  },
  {
    n: 2,
    key: "product",
    label: "\uC81C\uD488\u00B7HS \uCF54\uB4DC",
    path: "product",
    icon: PackageSearch,
    requirements: `${REQUIREMENT_LABEL} 2`,
  },
  {
    n: 3,
    key: "countries",
    label: "\uD6C4\uBCF4\uAD6D \uCD94\uCC9C Top 3",
    path: "countries",
    icon: Globe2,
    requirements: `${REQUIREMENT_LABEL} 3`,
  },
  {
    n: 4,
    key: "country",
    label: "\uAD6D\uAC00 \uC0C1\uC138",
    path: "countries",
    icon: Globe2,
    requirements: `${REQUIREMENT_LABEL} 4~7`,
    requiresCountry: true,
  },
  {
    n: 5,
    key: "report",
    label: "\uB9AC\uD3EC\uD2B8",
    path: "report",
    icon: FileText,
    requirements: `${REQUIREMENT_LABEL} 8`,
  },
];

export function getStepPath(step: StepDef, selectedCountryCode: string | null) {
  if (step.requiresCountry) {
    return selectedCountryCode ? `countries/${selectedCountryCode}` : "countries";
  }
  return step.path;
}

export function StepNav({
  projectId,
  current,
  compact = false,
  selectedCountryCode = null,
  stepCompletion = null,
}: {
  projectId: string;
  current: number;
  compact?: boolean;
  selectedCountryCode?: string | null;
  stepCompletion?: ProjectStepCompletion | null;
}) {
  return (
    <nav aria-label="\uBD84\uC11D \uB2E8\uACC4" className="space-y-1">
      {STEPS.map((step) => {
        const done = stepCompletion ? Boolean(stepCompletion[step.n]) : step.n < current;
        const active = step.n === current;
        const Icon = step.icon;
        const path = getStepPath(step, selectedCountryCode);
        const to = `/projects/${projectId}/${path}`;
        const needCountrySelection = step.requiresCountry && !selectedCountryCode;
        return (
          <NavLink
            key={step.key}
            to={to}
            onFocus={() => preloadRoute(to)}
            onMouseEnter={() => preloadRoute(to)}
            aria-label={`${step.n}\uB2E8\uACC4 ${step.label}`}
            className={cn(
              "group flex items-center rounded-md text-sm transition-colors",
              compact ? "justify-center px-0 py-3" : "gap-3 px-3 py-2.5",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            )}
            activeClassName=""
          >
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full border",
                compact ? "h-9 w-9" : "h-6 w-6 text-[11px] font-semibold",
                done && !active && "bg-brand text-brand-foreground border-brand",
                active && !done && "bg-brand text-brand-foreground border-brand",
                active && done && "bg-sidebar-accent text-sidebar-accent-foreground border-brand",
                !done && !active && "bg-background text-muted-foreground border-border",
              )}
              aria-hidden
            >
              {done && !active
                ? <Check className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} />
                : compact ? <Icon className="h-4 w-4" /> : step.n}
            </span>
            {!compact && (
              <span className="min-w-0">
                <span className="block truncate">{step.label}</span>
                <span className="block text-[11px] text-muted-foreground">{step.requirements}</span>
                {needCountrySelection ? (
                  <span className="block text-[11px] text-risk-reviewable">
                    {"\uAD6D\uAC00 \uC120\uD0DD \uD544\uC694"}
                  </span>
                ) : null}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
