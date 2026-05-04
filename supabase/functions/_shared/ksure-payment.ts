export type KsurePaymentScope = "country" | "global" | null;

export type KsurePaymentFetchResult<TItem> = {
  ok: boolean;
  status: number | null;
  message: string;
  item: TItem | null;
  scope: KsurePaymentScope;
};

type KsurePaymentCaller<TItem> = (
  filters: Record<string, string>,
  key: string,
) => Promise<KsurePaymentFetchResult<TItem>>;

const KSURE_PAYMENT_COUNTRY_CODE_BY_ISO2: Record<string, string> = {
  AE: "280",
  BR: "511",
  CN: "121",
  DE: "325",
  ID: "136",
  IN: "135",
  JP: "140",
  MX: "550",
  MY: "151",
  PL: "351",
  TH: "180",
  TR: "275",
  US: "450",
  VN: "176",
};

export function resolveKsurePaymentCountryCode(countryCode: string): string {
  const normalized = String(countryCode ?? "").trim().toUpperCase();
  return KSURE_PAYMENT_COUNTRY_CODE_BY_ISO2[normalized] || normalized;
}

export async function fetchCountryScopedKsureExportPayment<TItem>(
  params: { countryCode: string },
  key: string,
  callPayment: KsurePaymentCaller<TItem>,
): Promise<KsurePaymentFetchResult<TItem>> {
  if (!key) {
    return { ok: false, status: null, message: "K-SURE API key is missing", item: null, scope: null };
  }

  const paymentCountryCode = resolveKsurePaymentCountryCode(params.countryCode);
  const countryAttempt = await callPayment({ ctryCd: paymentCountryCode }, key);
  if (countryAttempt.ok && countryAttempt.item) {
    return { ...countryAttempt, scope: "country" };
  }
  if (!countryAttempt.ok) {
    return countryAttempt;
  }

  return {
    ok: true,
    status: countryAttempt.status ?? 200,
    message: countryAttempt.message || "No country data",
    item: null,
    scope: "country",
  };
}
