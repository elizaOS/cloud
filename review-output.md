## Summary
Small, targeted update to MCP update handling. Tightens `inputSchema` key typing and normalizes nullable URL/email fields to `undefined` before calling the update service. No security or architecture regressions found.

## Blocking Issues
None.

## Suggestions
1. `app/api/v1/mcps/[mcpId]/route.ts:56-152` Add a regression test for PUT updates where `documentationUrl`, `sourceCodeUrl`, or `supportEmail` are explicitly `null`, to confirm the service receives `undefined` and persists as expected.

## Verdict: APPROVED
