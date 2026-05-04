import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TARGET_DIRS = [
  join(process.cwd(), "src"),
  join(process.cwd(), "supabase", "functions"),
];

const TARGET_EXTENSIONS = new Set([".ts", ".tsx", ".sql"]);
const ALLOWED_PATTERN_FILES = [
  /mojibake-guard\.test\.ts$/,
  /scoring-sanitize\.test\.ts$/,
  /[\\/]scoring\.ts$/,
];
const BROKEN_PATTERNS = [
  /\?댁/g,
  /\?뺤/g,
  /嫄/g,
  /寃/g,
  /洹쒖/g,
  /\?몄쬆/g,
  /\?섏엯/g,
  /\?꾨왂臾쇱옄/g,
  /\?쒗뭹/g,
  /怨쇱젣/g,
  /異쒖쿂/g,
  /異붿쿇/g,
  /遺꾩꽍/g,
  /湲곕컲/g,
  /紐⑺몴\?쒖옣/g,
  /정떎\?{3}뺣낫 \?놁쓬/g,
  /확떎\?{3}뺣낫 \?놁쓬/g,
  /\?쒖옣/g,
  /\?쒖쐞/g,
  /\?섏텧/g,
  /\?먯닔/g,
  /洹쇨굅/g,
  /吏곸젒/g,
  /留ㅼ묶/g,
  /諛깆뾽/g,
  /援\?\?/g,
  /쨌/g,
];

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      out.push(...walkFiles(fullPath));
      continue;
    }
    const ext = fullPath.slice(fullPath.lastIndexOf("."));
    if (TARGET_EXTENSIONS.has(ext)) out.push(fullPath);
  }
  return out;
}

describe("mojibake guard", () => {
  it("does not contain known broken encoding patterns", () => {
    const offenders: string[] = [];

    for (const dir of TARGET_DIRS) {
      const files = walkFiles(dir);
      for (const file of files) {
        if (ALLOWED_PATTERN_FILES.some((pattern) => pattern.test(file))) continue;
        const text = readFileSync(file, "utf8");
        const hasBrokenPattern = BROKEN_PATTERNS.some((pattern) => pattern.test(text));
        if (hasBrokenPattern) offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  }, 30000);
});
