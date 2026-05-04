export const STATUS_TEXT = {
  noCertainInfo: "확실한 정보 없음",
  checkOrgRequired: "기관 확인 필요",
  noResult: "조회 결과 없음",
  apiError: "API 오류",
} as const;

export function toApiErrorMessage(message: string) {
  const normalized = message.trim();
  if (!normalized) return STATUS_TEXT.apiError;
  return `${STATUS_TEXT.apiError}: ${normalized}`;
}
