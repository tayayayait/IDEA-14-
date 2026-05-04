# Step5 Strategic Run Feedback UI Removal

Date: 2026-04-30

## Change
- Removed the `실행 피드백 · 전략물자` card from Step5.
- Removed the `전략물자 API: ...` line from the evidence sidebar status block.
- Kept the `전략물자 검토 상태` and `전략물자 가능성` result sections.

## Reason
- The strategic item check is based on the official HSK linkage table stored in the app, not a live external strategic-item API call.
- Displaying it as an API execution feedback row could be interpreted as a YESTrade or Trade Security Institute HTTP API result.

## Scope
- UI-only change.
- No change to HSK linkage matching, SafetyKorea calls, stored flags, or report generation.
