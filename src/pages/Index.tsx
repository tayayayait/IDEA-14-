import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  FileCheck2,
  FileText,
  Globe2,
  Landmark,
  ListChecks,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const DATA_SOURCES = ["KICOX", "KOTRA", "K-SURE", "전략물자관리원", "SafetyKorea"];

const HERO_VIDEO_SRC = "/hero-section-video-clean.mp4";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const HERO_METRICS = [
  { label: "분석 단계", value: "5단계", icon: ListChecks },
  { label: "기획 요구사항", value: "8개", icon: FileCheck2 },
  { label: "근거 출처", value: "5종", icon: Database },
];

const WORKFLOW = [
  {
    title: "기업·제품 입력",
    body: "산단 입주기업과 제품 정보를 기준으로 분석 대상을 정의합니다.",
    icon: Building2,
  },
  {
    title: "수출 후보국 추천",
    body: "국가 정보, 시장 뉴스, 품목 신호를 조합해 우선 검토국을 좁힙니다.",
    icon: Globe2,
  },
  {
    title: "리스크 체크",
    body: "인증, 수입규제, 결제위험, 전략물자, 제품안전 이슈를 함께 점검합니다.",
    icon: ShieldCheck,
  },
  {
    title: "실행 리포트",
    body: "근거 데이터와 다음 실행 과제를 1페이지 리포트로 정리합니다.",
    icon: FileText,
  },
];

const REPORT_POINTS = [
  "추천 수출국 Top 3",
  "국가별 인증·규제 체크리스트",
  "K-SURE 기반 결제·국가·업종 위험",
  "전략물자 및 제품안전 확인 필요 플래그",
];

export default function Index() {
  const heroRef = useRef<HTMLElement | null>(null);
  const [heroProgress, setHeroProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const updateProgress = () => {
      frame = 0;
      const hero = heroRef.current;
      if (!hero) return;
      const heroTop = hero.offsetTop;
      const heroHeight = hero.offsetHeight || 1;
      const progress = clamp((window.scrollY - heroTop) / (heroHeight * 0.9), 0, 1);
      setHeroProgress((current) => (Math.abs(current - progress) > 0.004 ? progress : current));
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateProgress);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1720px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link to="/" className="flex items-center gap-3" aria-label="산단수출 코파일럿 홈">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <Globe2 className="h-5 w-5" />
            </span>
            <span className="font-display text-sm font-semibold">산단수출 코파일럿</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#workflow" className="transition-colors hover:text-foreground">
              이용 흐름
            </a>
            <a href="#sources" className="transition-colors hover:text-foreground">
              데이터 출처
            </a>
            <a href="#report" className="transition-colors hover:text-foreground">
              리포트 구성
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden min-h-11 md:inline-flex">
              <Link to="/auth">로그인</Link>
            </Button>
            <Button asChild size="sm" className="min-h-11">
              <Link to="/projects">
                서비스 이용하기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section ref={heroRef} className="relative overflow-hidden border-b border-border bg-surface">
          <div className="absolute inset-0" aria-hidden="true">
            <img
              src="/hero-section-poster.webp"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center opacity-55 motion-safe:hidden"
              draggable={false}
            />
            <video
              className="absolute inset-0 h-full w-full object-cover object-center motion-reduce:hidden"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              poster="/hero-section-poster.webp"
              aria-hidden="true"
              style={{
                opacity: 0.9 - heroProgress * 0.08,
                transform: `translate3d(0, ${heroProgress * 10}px, 0)`,
                filter: "saturate(1.08) contrast(1.06) brightness(1.02)",
              }}
            >
              <source src={HERO_VIDEO_SRC} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-white/25" />
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
                backgroundSize: "56px 56px",
                transform: `translate3d(0, ${heroProgress * -18}px, 0)`,
              }}
            />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background/70" />
          </div>
          <div className="relative mx-auto flex min-h-[520px] w-full max-w-[1720px] items-center px-4 py-12 sm:px-6 md:min-h-[580px] md:py-14 lg:px-10">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-border bg-white/80 px-3 py-2 text-sm text-muted-foreground shadow-card">
                <Landmark className="h-4 w-4 text-brand" />
                공공데이터 기반 수출 준비 의사결정 도구
              </div>
              <h1 className="font-display text-4xl font-semibold leading-tight text-foreground md:text-6xl">
                산단수출 코파일럿
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                제조기업을 위한 데이터 기반 수출 의사결정 워크벤치입니다. 기업·제품 정보를 입력하면 수출 후보국,
                인증·수입규제, 결제위험, 전략물자, 제품안전 이슈를 공공데이터 근거와 함께 정리합니다.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="min-h-11">
                  <Link to="/projects">
                    서비스 이용하기
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="min-h-11 bg-white/70">
                  <a href="#report">리포트 구성 보기</a>
                </Button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {HERO_METRICS.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div key={metric.label} className="rounded-card border border-border bg-background/80 p-4">
                      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft text-brand">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="text-xs text-muted-foreground">{metric.label}</p>
                      <p className="mt-1 text-lg font-semibold">{metric.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="border-b border-border bg-background py-10 md:py-12">
          <div className="mx-auto w-full max-w-[1720px] px-4 sm:px-6 lg:px-10">
            <div className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-semibold text-brand">Workflow</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">서비스 이용 흐름</h2>
            </div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                기존 분석 화면은 그대로 유지하고, 소개 화면에서 진입한 뒤 프로젝트 워크스페이스에서 실제 분석을
                진행합니다.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {WORKFLOW.map((item, index) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="rounded-card border border-border bg-surface p-5 shadow-card">
                    <div className="mb-5 flex items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-semibold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="sources" className="border-b border-border bg-surface py-10 md:py-12">
          <div className="mx-auto grid w-full max-w-[1720px] gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-10">
            <div>
              <p className="text-sm font-semibold text-brand">Evidence</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">데이터 출처를 먼저 보여줍니다.</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                서비스 신뢰는 화면 효과가 아니라 근거 출처에서 나옵니다. 소개 화면에서도 어떤 공공데이터가
                분석에 쓰이는지 바로 확인할 수 있어야 합니다.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {DATA_SOURCES.map((source) => (
                <div key={source} className="flex items-center gap-3 rounded-card border border-border bg-background p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-brand shadow-card">
                    <Database className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{source}</p>
                    <p className="text-xs text-muted-foreground">분석 근거 데이터</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="report" className="bg-background py-10 md:py-12">
          <div className="mx-auto grid w-full max-w-[1720px] gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-10">
            <div>
              <p className="text-sm font-semibold text-brand">Report Preview</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">최종 결과는 실행 리포트로 정리됩니다.</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                추천 결과만 보여주지 않고, 기업 담당자가 다음에 확인해야 할 인증·규제·위험 항목을 함께 묶어
                보고서 형태로 제공합니다.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {REPORT_POINTS.map((point) => (
                  <div key={point} className="flex items-start gap-3 rounded-card bg-surface p-4 shadow-card">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                    <span className="text-sm font-medium">{point}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-card border border-border bg-surface p-5 shadow-elevated">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">1페이지 수출 실행 리포트</p>
                  <h3 className="mt-1 text-xl font-semibold">추천국 종합 판단</h3>
                </div>
                <TrendingUp className="h-6 w-6 text-brand" />
              </div>
              <div className="space-y-3">
                {[
                  ["시장성", "높음", "bg-risk-priority-soft text-risk-priority"],
                  ["인증·규제", "검토 필요", "bg-risk-caution-soft text-risk-caution"],
                  ["결제위험", "보통", "bg-risk-reviewable-soft text-risk-reviewable"],
                ].map(([label, value, className]) => (
                  <div key={label} className="flex items-center justify-between rounded-card border border-border p-4">
                    <span className="text-sm font-medium">{label}</span>
                    <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${className}`}>{value}</span>
                  </div>
                ))}
              </div>
              <Button asChild className="mt-6 min-h-11 w-full">
                <Link to="/projects">
                  서비스 이용하기
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
