---
description: Fix all CRITICAL and HIGH findings from parallel review agents
argument-hint: (no arguments — reads review artifacts)
---

# Self-Fix Review Findings

**Workflow**: $WORKFLOW_ID

## Phase 1: LOAD

Read ALL review findings from the parallel review agents:

1. `$ARTIFACTS_DIR/review/architecture.md` — Architecture review findings
2. `$ARTIFACTS_DIR/review/security.md` — Security review findings
3. `$ARTIFACTS_DIR/review/types.md` — Type safety review findings

Collect all CRITICAL and HIGH severity findings across all reviews.

### LOAD_CHECKPOINT
- [ ] All review files read
- [ ] CRITICAL findings listed
- [ ] HIGH findings listed

## Phase 2: EXECUTE

Fix ALL CRITICAL findings first, then ALL HIGH findings.

For each finding:
1. Read the referenced file
2. Apply the fix
3. Run `pnpm run typecheck` to verify no regressions
4. Move to the next finding

### Rules:
- Fix only what the reviews identified — do not refactor unrelated code
- Maintain all PRP constraints (hooks will remind you)
- If a finding conflicts with a PRP architecture decision, the PRP wins — document why the finding was skipped

### EXECUTE_CHECKPOINT
- [ ] All CRITICAL findings fixed
- [ ] All HIGH findings fixed
- [ ] TypeCheck still passes after all fixes

## Phase 3: VALIDATE

```bash
pnpm run typecheck
pnpm run build
```

Both must pass. Fix any regressions.

## Phase 4: COMMIT

Stage and commit fixes:

```bash
git add -A
git commit -m "fix(bridge): address review findings — CRITICAL and HIGH severity

Co-Authored-By: SmokeDev <pedro6392mendoza@gmail.com>"
git push
```

## Phase 5: GENERATE

Write a fix summary to `$ARTIFACTS_DIR/review/self-fix-summary.md`:

```markdown
# Self-Fix Summary

## CRITICAL fixes applied
- <fix description>

## HIGH fixes applied
- <fix description>

## Findings skipped (with reason)
- <finding> — <reason>

## MEDIUM/LOW remaining (for follow-up)
- <finding>
```

## Phase 6: REPORT

Summarize: how many fixes applied, any remaining items, build status.
