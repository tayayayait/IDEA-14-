/**
 * WorldMapChart — 국가 추천 결과를 세계 지도 Choropleth로 시각화
 *
 * react-simple-maps + Natural Earth 110m TopoJSON 사용
 * Step3Countries.tsx에서 React.lazy로 동적 로드됨
 */
import React, { useState, useMemo, useCallback, memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Marker,
} from "react-simple-maps";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ISO Alpha-2 → ISO 3166-1 Numeric 매핑 (react-simple-maps는 numeric 사용)
const ALPHA2_TO_NUMERIC: Record<string, string> = {
  US: "840", CN: "156", JP: "392", DE: "276", VN: "704",
  IN: "356", ID: "360", TH: "764", MY: "458", BR: "076",
  MX: "484", PL: "616", TR: "792", AE: "784",
};

// 국가 수도/중심 좌표 (Top 3 마커용)
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [-98.5, 39.8], CN: [104.2, 35.9], JP: [138.3, 36.2],
  DE: [10.5, 51.2], VN: [108.3, 14.1], IN: [78.9, 20.6],
  ID: [113.9, -0.8], TH: [100.5, 15.9], MY: [101.7, 4.2],
  BR: [-51.9, -14.2], MX: [-102.6, 23.6], PL: [19.1, 51.9],
  TR: [35.2, 38.9], AE: [53.8, 23.4],
};

type RiskLabel = string;

interface CountryData {
  country_code: string;
  country_name: string;
  total_score: number | null;
  label: RiskLabel;
  rank: number | null;
  customsExpDlr?: number | null;
}

interface WorldMapChartProps {
  countries: CountryData[];
  customsLookupState?: "idle" | "loading" | "done" | "error";
  selectedCountryCode?: string;
  onCountryClick?: (countryCode: string) => void;
}

function scoreToColor(score: number | null, isSelected: boolean): string {
  if (isSelected) return "#F59E0B";
  if (score === null || score === undefined) return "#e6e7ea";
  if (score >= 70) return "#0E6B6F";
  if (score >= 50) return "#3BA0A4";
  if (score >= 30) return "#7AB8BA";
  return "#C4DFDF";
}

function labelToKorean(label: string): string {
  const map: Record<string, string> = {
    recommended: "추천",
    considerable: "고려",
    cautious: "주의",
    unknown: "미분류",
    risky: "위험",
  };
  return map[label] || label;
}

function formatDollar(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function formatCustomsExportStatus(
  amount: number | null | undefined,
  state: NonNullable<WorldMapChartProps["customsLookupState"]>,
): string {
  if (state === "loading") return "최근 12개월 HS/HSK 수출액 조회 중";
  if (state === "error") return "최근 12개월 HS/HSK 수출액 조회 실패";
  if (amount == null || amount <= 0) return "최근 12개월 HS/HSK 수출액 조회 결과 없음";
  return `최근 12개월 HS/HSK 수출액 ${formatDollar(amount)}`;
}

const MemoGeography = memo(Geography);

function WorldMapChart({
  countries,
  customsLookupState = "idle",
  selectedCountryCode,
  onCountryClick,
}: WorldMapChartProps) {
  const [hoveredGeoId, setHoveredGeoId] = useState<string | null>(null);

  const numericToData = useMemo(() => {
    const map = new Map<string, CountryData>();
    for (const c of countries) {
      const numericId = ALPHA2_TO_NUMERIC[c.country_code];
      if (numericId) map.set(numericId, c);
    }
    return map;
  }, [countries]);

  const alpha2ToData = useMemo(() => {
    const map = new Map<string, CountryData>();
    for (const c of countries) map.set(c.country_code, c);
    return map;
  }, [countries]);

  const top3 = useMemo(() => {
    return [...countries]
      .filter((c) => c.rank !== null && c.rank <= 3)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  }, [countries]);

  const handleGeoClick = useCallback(
    (geoId: string) => {
      const data = numericToData.get(geoId);
      if (data && onCountryClick) onCountryClick(data.country_code);
    },
    [numericToData, onCountryClick],
  );

  return (
    <div className="relative w-full">
      {/* 범례 */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">점수 범례:</span>
        {[
          { color: "#0E6B6F", label: "70+ 추천" },
          { color: "#3BA0A4", label: "50-69 고려" },
          { color: "#7AB8BA", label: "30-49 보통" },
          { color: "#C4DFDF", label: "~29 낮음" },
          { color: "#e6e7ea", label: "데이터 없음" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            {label}
          </span>
        ))}
      </div>

      <TooltipProvider delayDuration={100}>
        <ComposableMap
          projectionConfig={{ rotate: [-10, 0, 0], scale: 140 }}
          className="w-full"
          style={{ maxHeight: 420 }}
        >
          <ZoomableGroup center={[0, 20]} zoom={1} minZoom={1} maxZoom={4}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const geoId = geo.id as string;
                  const data = numericToData.get(geoId);
                  const isCandidate = !!data;
                  const isSelected = data?.country_code === selectedCountryCode;
                  const isHovered = hoveredGeoId === geoId;
                  const fillColor = isCandidate
                    ? scoreToColor(data.total_score, isSelected)
                    : "#f0f1f3";
                  const strokeColor = isSelected
                    ? "#F59E0B"
                    : isHovered && isCandidate
                      ? "#0E6B6F"
                      : "#d1d5db";

                  const geoElement = (
                    <MemoGeography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 1.5 : isHovered ? 1 : 0.4}
                      style={{
                        default: { outline: "none" },
                        hover: {
                          outline: "none",
                          cursor: isCandidate ? "pointer" : "default",
                        },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={() => setHoveredGeoId(geoId)}
                      onMouseLeave={() => setHoveredGeoId(null)}
                      onClick={() => isCandidate && handleGeoClick(geoId)}
                    />
                  );

                  if (!isCandidate) return geoElement;

                  return (
                    <Tooltip key={geo.rsmKey}>
                      <TooltipTrigger asChild>{geoElement}</TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-[220px] bg-background/95 backdrop-blur"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-semibold">
                            <span>{data.country_name}</span>
                            {data.rank && data.rank <= 3 && (
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px]"
                              >
                                #{data.rank}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs">
                            종합점수:{" "}
                            <span className="font-medium">
                              {data.total_score ?? "N/A"}
                            </span>
                            <span className="ml-2 opacity-70">
                              ({labelToKorean(data.label)})
                            </span>
                          </div>
                          {data.customsExpDlr != null &&
                            data.customsExpDlr > 0 && (
                              <div className="text-xs opacity-80">
                                최근 12개월 HS/HSK 수출액: {formatDollar(data.customsExpDlr)}
                              </div>
                            )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              }
            </Geographies>

            {/* Top 3 순위 마커 */}
            {top3.map((c) => {
              const coords = COUNTRY_CENTROIDS[c.country_code];
              if (!coords) return null;
              const medalEmoji =
                c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : "🥉";

              return (
                <Marker key={c.country_code} coordinates={coords}>
                  <text
                    textAnchor="middle"
                    fontSize={14}
                    style={{
                      cursor: "pointer",
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
                      pointerEvents: "none",
                    }}
                  >
                    {medalEmoji}
                  </text>
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>
      </TooltipProvider>

      {/* 하단 요약 */}
      {top3.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
          {top3.map((c) => {
            const medal =
              c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : "🥉";
            return (
              <button
                key={c.country_code}
                onClick={() => onCountryClick?.(c.country_code)}
                className="flex items-center gap-1 rounded-full border px-3 py-1 transition-colors hover:border-primary hover:bg-accent"
              >
                <span>{medal}</span>
                <span className="font-medium">{c.country_name}</span>
                <span className="text-muted-foreground">
                  {c.total_score ?? "-"}점
                </span>
              </button>
            );
          })}
        </div>
      )}
      {customsLookupState !== "idle" && top3.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {top3.map((c) => (
            <span key={`${c.country_code}-customs-export`}>
              <span className="font-medium text-foreground">{c.country_name}</span>{" "}
              {formatCustomsExportStatus(c.customsExpDlr, customsLookupState)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorldMapChart;
