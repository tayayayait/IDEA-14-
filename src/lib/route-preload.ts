export const pageLoaders = {
  index: () => import("@/pages/Index"),
  notFound: () => import("@/pages/NotFound"),
  auth: () => import("@/pages/Auth"),
  projects: () => import("@/pages/Projects"),
  step1Company: () => import("@/pages/Step1Company"),
  step2Product: () => import("@/pages/Step2Product"),
  step3Countries: () => import("@/pages/Step3Countries"),
  step4CountryDetail: () => import("@/pages/Step4CountryDetail"),
  step6Report: () => import("@/pages/Step6Report"),
  dataSources: () => import("@/pages/DataSources"),
  kcRecallLookup: () => import("@/pages/KcRecallLookup"),
} as const;

export type PageKey = keyof typeof pageLoaders;

const preloadedPages = new Set<PageKey>();

export function preloadPage(pageKey: PageKey) {
  if (typeof window === "undefined" || preloadedPages.has(pageKey)) return;

  preloadedPages.add(pageKey);
  void pageLoaders[pageKey]().catch(() => {
    preloadedPages.delete(pageKey);
  });
}

export function preloadRoute(pathname: string) {
  preloadPage(getPageKeyForPath(pathname));
}

export function getPageKeyForPath(pathname: string): PageKey {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) return "index";
  if (segments[0] === "auth") return "auth";
  if (segments[0] === "data-sources") return "dataSources";
  if (segments[0] === "kc-recall") return "kcRecallLookup";
  if (segments[0] !== "projects") return "notFound";
  if (segments.length === 1) return "projects";

  switch (segments[2]) {
    case "company":
      return "step1Company";
    case "product":
      return "step2Product";
    case "countries":
      return segments[3] ? "step4CountryDetail" : "step3Countries";
    case "safety":
      return "step3Countries";
    case "report":
      return "step6Report";
    default:
      return "projects";
  }
}
