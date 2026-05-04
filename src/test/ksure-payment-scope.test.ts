import { describe, expect, it } from "vitest";
import {
  fetchCountryScopedKsureExportPayment,
  resolveKsurePaymentCountryCode,
  type KsurePaymentFetchResult,
} from "../../supabase/functions/_shared/ksure-payment";

type Item = { id: string };

function result(overrides: Partial<KsurePaymentFetchResult<Item>>): KsurePaymentFetchResult<Item> {
  return {
    ok: true,
    status: 200,
    message: "NO ERROR",
    item: null,
    scope: null,
    ...overrides,
  };
}

describe("K-SURE payment scope", () => {
  it("maps ISO2 country code to the K-Sight payment country code", () => {
    expect(resolveKsurePaymentCountryCode("MY")).toBe("151");
    expect(resolveKsurePaymentCountryCode("JP")).toBe("140");
  });

  it("uses the mapped K-Sight payment country code for payment lookup", async () => {
    const calls: Record<string, string>[] = [];
    const output = await fetchCountryScopedKsureExportPayment(
      { countryCode: "MY" },
      "key",
      async (filters) => {
        calls.push(filters);
        return result({ item: { id: "malaysia" } });
      },
    );

    expect(calls).toEqual([{ ctryCd: "151" }]);
    expect(output.item?.id).toBe("malaysia");
    expect(output.scope).toBe("country");
  });

  it("returns country-scoped payment data when the selected country has a row", async () => {
    const calls: Record<string, string>[] = [];
    const output = await fetchCountryScopedKsureExportPayment(
      { countryCode: "JP" },
      "key",
      async (filters) => {
        calls.push(filters);
        return result({ item: { id: "jp" } });
      },
    );

    expect(calls).toEqual([{ ctryCd: "140" }]);
    expect(output.item?.id).toBe("jp");
    expect(output.scope).toBe("country");
  });

  it("does not fall back to global payment data when the selected country has no row", async () => {
    const calls: Record<string, string>[] = [];
    const output = await fetchCountryScopedKsureExportPayment(
      { countryCode: "JP" },
      "key",
      async (filters) => {
        calls.push(filters);
        return Object.keys(filters).length === 0
          ? result({ item: { id: "global" }, scope: "global" })
          : result({ item: null, message: "No country data" });
      },
    );

    expect(calls).toEqual([{ ctryCd: "140" }]);
    expect(output.item).toBeNull();
    expect(output.scope).toBe("country");
    expect(output.message).toBe("No country data");
  });

  it("returns the country lookup error without trying a global fallback", async () => {
    const calls: Record<string, string>[] = [];
    const output = await fetchCountryScopedKsureExportPayment(
      { countryCode: "JP" },
      "key",
      async (filters) => {
        calls.push(filters);
        return result({ ok: false, status: 500, message: "HTTP 500", item: null });
      },
    );

    expect(calls).toEqual([{ ctryCd: "140" }]);
    expect(output.ok).toBe(false);
    expect(output.message).toBe("HTTP 500");
  });
});
