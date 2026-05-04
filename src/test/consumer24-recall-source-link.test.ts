import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const edgeSource = () =>
  readFileSync(join(process.cwd(), "supabase/functions/safety-scan/consumer24-recall.ts"), "utf8");

describe("Consumer24 recall source links", () => {
  it("builds domestic recall links with the current Consumer24 detail route", () => {
    const source = edgeSource();

    expect(source).toContain(
      'const CONSUMER24_RECALL_DETAIL_URL = "https://www.consumer.go.kr/user/ftc/consumer/recallInfo/629/selectRecallInfoInternalDetail.do";',
    );
    expect(source).toContain(
      'const CONSUMER24_RECALL_LIST_URL = "https://www.consumer.go.kr/user/ftc/consumer/recallInfo/629/selectRecallInfoInternalList.do";',
    );
    expect(source).toContain('url.searchParams.set("recallSn", recordId);');
    expect(source).not.toMatch(
      /`https:\/\/www\.consumer\.go\.kr\/consumer\/safe\/recall\/selectRecallDetail\.do\?recallSn=\$\{/,
    );
    expect(source).not.toContain('"https://www.consumer.go.kr/consumer/safe/recall/selectRecallList.do"');
  });

  it("repairs legacy Consumer24 recall links returned by source fields", () => {
    const source = edgeSource();

    expect(source).toContain("function repairConsumer24RecallUrl");
    expect(source).toContain('/consumer/safe/recall/selectRecallDetail.do');
    expect(source).toContain('/consumer/safe/recall/selectRecallList.do');
    expect(source).toContain("return buildConsumer24RecallUrl(fallbackRecordId);");
  });
});
