import { FormEvent, useMemo, useState } from "react";
import { ExternalLink, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { ApiStateChip, type ApiState } from "@/components/ApiStateChip";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { useApiCall } from "@/hooks/useApiCall";
import { useAuthGuard } from "@/hooks/useAuthGuard";

type LookupForm = {
  productName: string;
  modelName: string;
  brandName: string;
  certNum: string;
  barcodeNum: string;
};

type LookupResponse = {
  state?: ApiState;
  message?: string;
  provider?: string;
  status?: string;
  query?: string | null;
  cert_count?: number;
  domestic_recall_count?: number;
  foreign_recall_count?: number;
  certifications?: Record<string, unknown>[];
  domestic_recalls?: Record<string, unknown>[];
  foreign_recalls?: Record<string, unknown>[];
  excluded_domestic_recalls?: Record<string, unknown>[];
  excluded_foreign_recalls?: Record<string, unknown>[];
  warnings?: string[];
};

const EMPTY_FORM: LookupForm = {
  productName: "",
  modelName: "",
  brandName: "",
  certNum: "",
  barcodeNum: "",
};

export default function KcRecallLookup() {
  useAuthGuard();
  const { invoke } = useApiCall();
  const [form, setForm] = useState<LookupForm>(EMPTY_FORM);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LookupResponse | null>(null);

  const hasPreciseKey = useMemo(
    () => Boolean(form.modelName.trim() || form.certNum.trim() || form.barcodeNum.trim()),
    [form.modelName, form.certNum, form.barcodeNum],
  );

  const updateField = (key: keyof LookupForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const search = normalizeForm(form);
    if (!Object.values(search).some(Boolean)) {
      toast.warning("제품명, 모델명, 브랜드명, KC 인증번호, 바코드 중 하나 이상 입력해야 합니다.");
      return;
    }

    setRunning(true);
    const response = await invoke<LookupResponse>(
      "safety-scan",
      { lookup: true, search },
      { timeoutMs: 45000, retryOn500: false },
    );
    setRunning(false);

    if (!response.data) {
      toast.error(response.message ?? "KC·리콜 조회에 실패했습니다.");
      return;
    }

    setResult(response.data);
    const message = response.data.message ?? "KC·리콜 조회가 완료되었습니다.";
    if (response.state === "empty") toast.warning(message);
    else if (response.state === "error") toast.error(message);
    else toast.success(message);
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setResult(null);
  };

  const certRows = result?.certifications ?? [];
  const domesticRows = result?.domestic_recalls ?? [];
  const foreignRows = result?.foreign_recalls ?? [];
  const warningRows = result?.warnings?.filter(Boolean) ?? [];

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">KC·리콜 조회</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            프로젝트 워크플로우와 분리된 참고 조회입니다. 제품명만 입력한 결과는 후보로 취급해야 합니다.
          </p>
        </div>
        {result ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{result.provider ?? "SafetyKorea"}</span>
            <ApiStateChip state={normalizeState(result.state)} />
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-brand" />
            조회 조건
          </CardTitle>
          <CardDescription>
            정확한 매칭이 필요하면 모델명, KC 인증번호 또는 바코드를 함께 입력하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="제품명" value={form.productName} onChange={(value) => updateField("productName", value)} placeholder="예: 전기자전거 배터리" />
              <Field label="모델명" value={form.modelName} onChange={(value) => updateField("modelName", value)} placeholder="예: ABC-123" />
              <Field label="브랜드명" value={form.brandName} onChange={(value) => updateField("brandName", value)} placeholder="예: 브랜드명" />
              <Field label="KC 인증번호" value={form.certNum} onChange={(value) => updateField("certNum", value)} placeholder="예: HU12345-0001A" />
              <Field label="바코드" value={form.barcodeNum} onChange={(value) => updateField("barcodeNum", value)} placeholder="예: 8801234567890" />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={reset} disabled={running}>
                <RotateCcw className="h-4 w-4" />
                초기화
              </Button>
              <Button type="submit" disabled={running} className="min-h-11">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {running ? "조회 중..." : "조회"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <div className="mt-4 space-y-4">
          {!hasPreciseKey ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="py-3 text-sm text-amber-900">
                제품명만 입력한 결과는 후보입니다. 모델명, KC 인증번호 또는 바코드로 재조회해야 최종 판단에 사용할 수 있습니다.
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryCard title="KC 인증정보" value={result.cert_count ?? certRows.length} />
            <SummaryCard title="국내 리콜" value={result.domestic_recall_count ?? domesticRows.length} />
            <SummaryCard title="국외 리콜" value={result.foreign_recall_count ?? foreignRows.length} />
          </div>

          {result.message ? (
            <Card>
              <CardContent className="py-3 text-sm text-muted-foreground">
                {result.message}
                {result.query ? <span className="block pt-1 text-xs">조회식: {result.query}</span> : null}
              </CardContent>
            </Card>
          ) : null}

          {warningRows.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">조회 경고</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {warningRows.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Tabs defaultValue="certs" className="w-full">
            <TabsList>
              <TabsTrigger value="certs">KC 인증정보</TabsTrigger>
              <TabsTrigger value="domestic">국내 리콜정보</TabsTrigger>
              <TabsTrigger value="foreign">국외 리콜정보</TabsTrigger>
            </TabsList>
            <TabsContent value="certs">
              <CertificationTable rows={certRows} />
            </TabsContent>
            <TabsContent value="domestic">
              <RecallTable rows={domesticRows} emptyText="국내 리콜 매칭 결과가 없습니다." />
            </TabsContent>
            <TabsContent value="foreign">
              <RecallTable rows={foreignRows} emptyText="국외 리콜 매칭 결과가 없습니다." />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const id = `kc-recall-${label}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-semibold">{value.toLocaleString("ko-KR")}건</p>
      </CardContent>
    </Card>
  );
}

function CertificationTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return <EmptyResult text="KC 인증 매칭 결과가 없습니다." />;

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>인증번호</TableHead>
              <TableHead>제품명</TableHead>
              <TableHead>모델명</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>제조사</TableHead>
              <TableHead>원문</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${recordText(row, "certNum")}-${index}`}>
                <TableCell className="font-mono text-xs">{recordText(row, "certNum") || "-"}</TableCell>
                <TableCell>{recordText(row, "productName") || "-"}</TableCell>
                <TableCell>{recordText(row, "modelName") || "-"}</TableCell>
                <TableCell>{recordText(row, "certState") || "-"}</TableCell>
                <TableCell>{recordText(row, "makerName") || "-"}</TableCell>
                <TableCell>{renderSourceLink(row, "인증 상세")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RecallTable({ rows, emptyText }: { rows: Record<string, unknown>[]; emptyText: string }) {
  if (rows.length === 0) return <EmptyResult text={emptyText} />;

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>공표일</TableHead>
              <TableHead>제품명</TableHead>
              <TableHead>브랜드/모델</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>결함·조치 요약</TableHead>
              <TableHead>원문</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${recordText(row, "recordId")}-${index}`}>
                <TableCell className="whitespace-nowrap text-xs">{recordText(row, "noticeDate") || "-"}</TableCell>
                <TableCell>{recordText(row, "productName") || "-"}</TableCell>
                <TableCell>
                  <span className="block">{recordText(row, "brandName") || "-"}</span>
                  <span className="block text-xs text-muted-foreground">{recordText(row, "modelName") || "-"}</span>
                </TableCell>
                <TableCell>{recordText(row, "recallType") || "-"}</TableCell>
                <TableCell className="max-w-sm">
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {recordText(row, "defectSummary") || recordText(row, "hazardSummary") || recordText(row, "actionSummary") || "-"}
                  </span>
                </TableCell>
                <TableCell>{renderSourceLink(row, "리콜 상세")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EmptyResult({ text }: { text: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

function renderSourceLink(row: Record<string, unknown>, label: string) {
  const url = recordText(row, "sourceUrl");
  if (!url) return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
      <ExternalLink className="h-3 w-3" />
      {label}
    </a>
  );
}

function normalizeForm(form: LookupForm): LookupForm {
  return {
    productName: form.productName.trim(),
    modelName: form.modelName.trim(),
    brandName: form.brandName.trim(),
    certNum: form.certNum.trim(),
    barcodeNum: form.barcodeNum.trim(),
  };
}

function normalizeState(state: ApiState | undefined): ApiState {
  return state ?? "idle";
}

function recordText(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}
