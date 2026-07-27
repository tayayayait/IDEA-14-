import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiFinalVerdictCard } from "@/components/AiFinalVerdictCard";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
  };

  return {
    supabase: {
      from: vi.fn(() => query),
      functions: { invoke: invokeMock },
    },
  };
});

describe("AI final verdict card", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockReturnValue(new Promise(() => {}));
  });

  it("sends a boolean force_refresh value when the generate button is clicked", () => {
    render(
      <AiFinalVerdictCard
        projectId="project-1"
        facts={[]}
        countryCode="US"
        countryName="미국"
        productName="테스트 제품"
        hs6="123456"
        opportunityScore={80}
        detailExecuted
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 판단 생성" }));

    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock.mock.calls[0][1].body.force_refresh).toBe(false);
  });
});
