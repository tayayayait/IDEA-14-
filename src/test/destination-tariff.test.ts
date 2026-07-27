import { describe, expect, it } from "vitest";
import {
  normalizeUkCommodityDocument,
  parseJapanTariffScheduleHtml,
} from "../../supabase/functions/_shared/destination-tariff";

describe("destination tariff normalization", () => {
  it("extracts UK third-country, Korea preference, VAT, and hierarchy from the official response", () => {
    const candidate = normalizeUkCommodityDocument({
      data: {
        type: "commodity",
        attributes: {
          goods_nomenclature_item_id: "8486900000",
          description_plain: "Parts and accessories",
          number_indents: 1,
          declarable: true,
          validity_start_date: "2007-01-01T00:00:00.000Z",
        },
        relationships: {
          import_measures: {
            data: [
              { id: "general", type: "measure" },
              { id: "korea", type: "measure" },
              { id: "vat", type: "measure" },
            ],
          },
        },
      },
      included: [
        {
          id: "heading",
          type: "heading",
          attributes: {
            description_plain: "Machines used for the manufacture of semiconductor devices; parts and accessories",
          },
        },
        ukMeasure("general", "103", "1011", "general-duty"),
        ukMeasure("korea", "142", "KR", "korea-duty"),
        ukMeasure("vat", "305", "1400", "vat-duty"),
        ukRelated("measure_type", "103", { description: "Third country duty" }),
        ukRelated("measure_type", "142", { description: "Tariff preference" }),
        ukRelated("measure_type", "305", { description: "Value added tax" }),
        ukRelated("geographical_area", "1011", { description: "ERGA OMNES" }),
        ukRelated("geographical_area", "KR", { description: "South Korea" }),
        ukRelated("geographical_area", "1400", { description: "Areas subject to VAT or Excise" }),
        ukRelated("duty_expression", "general-duty", { verbose_duty: "2.00%" }),
        ukRelated("duty_expression", "korea-duty", { verbose_duty: "0.00%" }),
        ukRelated("duty_expression", "vat-duty", { verbose_duty: "20.00%" }),
      ],
    });

    expect(candidate).toMatchObject({
      tariffCode: "8486900000",
      description: "Parts and accessories",
      generalRate: "2.00%",
      mfnRate: "2.00%",
      koreaPreferentialRate: "0.00%",
      otherRate: "20.00%",
      otherRateLabel: "VAT",
      declarable: true,
    });
    expect(candidate?.hierarchyDescription).toContain("semiconductor devices");
    expect(candidate?.measures).toContain("Third country duty: 2.00%");
  });

  it("extracts Japan nine-digit candidates and the Korea RCEP rate from the official chapter table", () => {
    const headingCells = tableCells(33, {
      0: "84.86",
      2: "Machines and apparatus used for the manufacture of semiconductor devices; parts and accessories",
    });
    const candidateCells = tableCells(33, {
      0: "8486.90",
      1: "000",
      2: "Parts and accessories",
      3: "3.9%",
      5: "Free",
      28: "Free",
      30: "NO",
      31: "KG",
    });
    const html = `<table><tr>${headingCells}</tr><tr>${candidateCells}</tr></table>`;

    const parsed = parseJapanTariffScheduleHtml(html, "848690");

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      tariffCode: "848690000",
      statisticalSuffix: "000",
      description: "Parts and accessories",
      generalRate: "3.9%",
      mfnRate: "Free",
      koreaPreferentialRate: "Free",
      otherRate: "Free",
      otherRateLabel: "WTO",
      units: ["NO", "KG"],
      declarable: true,
    });
    expect(parsed[0].hierarchyDescription).toContain("semiconductor devices");
  });
});

function ukMeasure(id: string, measureTypeId: string, geographicalAreaId: string, dutyExpressionId: string) {
  return {
    id,
    type: "measure",
    attributes: {
      import: true,
      effective_start_date: "2026-01-01T00:00:00.000Z",
    },
    relationships: {
      measure_type: { data: { id: measureTypeId, type: "measure_type" } },
      geographical_area: { data: { id: geographicalAreaId, type: "geographical_area" } },
      duty_expression: { data: { id: dutyExpressionId, type: "duty_expression" } },
      measure_conditions: { data: [] },
    },
  };
}

function ukRelated(type: string, id: string, attributes: Record<string, unknown>) {
  return { id, type, attributes };
}

function tableCells(length: number, values: Record<number, string>): string {
  return Array.from({ length }, (_, index) => `<td>${values[index] ?? ""}</td>`).join("");
}
