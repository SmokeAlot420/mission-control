---
description: Create a PR for a completed Bridge Feature Transplants phase
argument-hint: (no arguments — reads from artifacts)
---

# Create Bridge Phase PR

**Workflow**: $WORKFLOW_ID

---

## Phase 1: LOAD

Read these artifacts from the implementation step:
- `$ARTIFACTS_DIR/implementation.md` — What was implemented
- `$ARTIFACTS_DIR/phase-input.txt` — Phase name

### LOAD_CHECKPOINT
- [ ] Implementation summary loaded
- [ ] Phase name identified

---

## Phase 2: EXECUTE

1. **Stage changes**: `git add -A` (review staged files, exclude any .env or credentials)
2. **Commit** with message format:

```
feat(bridge): <phase-name-slug> — <brief summary>

Implements <Phase N> of Bridge Feature Transplants PRP.

<2-3 line description of what was built>

Co-Authored-By: SmokeDev <pedro6392mendoza@gmail.com>
```

3. **Push** the branch: `git push -u origin HEAD`

4. **Create PR** using gh CLI:

```bash
gh pr create --draft --title "feat(bridge): <phase-name-slug>" --body "$(cat <<'PREOF'
## Summary

<2-3 bullet points from implementation.md>

## Phase

<phase name from phase-input.txt>

## PRP Reference

`PRPs/active/PRP-bridge-feature-transplants.md` (in second-brain repo)

## Changes

<file list with Create/Modify tags from implementation.md>

## Schema

<SQL tables created, or "None">

## Validation

- [x] TypeCheck passes
- [x] Build succeeds
- [ ] Manual verification

## Architecture Compliance

- [x] All new routes use `getSupabaseAdmin()`
- [x] `workspace_id` derived from auth context (no hardcoded defaults)
- [x] Chat widget reuses existing chat stack
- [x] White-label compliant (no hardcoded names/URLs)

---
Co-Authored-By: SmokeDev <pedro6392mendoza@gmail.com>
PREOF
)"
```

### EXECUTE_CHECKPOINT
- [ ] Changes committed with proper message
- [ ] Branch pushed
- [ ] Draft PR created

---

## Phase 3: GENERATE

Write metadata files:
- `$ARTIFACTS_DIR/.pr-url` — The full PR URL
- `$ARTIFACTS_DIR/.pr-number` — Just the PR number

### GENERATE_CHECKPOINT
- [ ] `.pr-url` written
- [ ] `.pr-number` written

---

## Phase 4: REPORT

Output the PR URL and a one-line summary.
