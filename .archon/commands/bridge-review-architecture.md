---
description: Review Bridge phase implementation against PRP architecture decisions and anti-patterns
argument-hint: (no arguments — reads PR diff from artifacts)
---

# Bridge Architecture Review

**Workflow**: $WORKFLOW_ID

This is a READ-ONLY review node. Do not modify any files.

---

## Phase 1: LOAD

1. Read `$ARTIFACTS_DIR/prp.md` — Load the full PRP with architecture decisions and anti-patterns
2. Read `$ARTIFACTS_DIR/.pr-number` — Get PR number
3. Run `gh pr diff $(cat $ARTIFACTS_DIR/.pr-number)` — Get the full diff

### LOAD_CHECKPOINT
- [ ] PRP loaded (especially "Global Architecture Decisions" and "Anti-Patterns" sections)
- [ ] PR diff loaded

---

## Phase 2: ANALYZE

For EVERY changed file in the diff, check against these three lists:

### Anti-Pattern Detection (from PRP section "Anti-Patterns")

- [ ] No crshdn SQLite query shapes copied into Supabase route handlers
- [ ] No convoy dependencies stored as JSON arrays
- [ ] No browser/Zustand state used as convoy source of truth
- [ ] No mailbox and event bus merged into one table
- [ ] No crshdn simple layered graph used instead of @xyflow/react
- [ ] Chat widget is NOT treated as orchestration UI
- [ ] No second chat persistence/transport stack created
- [ ] No `workspace_id` hardcoded to 1 (search for `workspace_id.*=.*1` and `DEFAULT 1`)
- [ ] Skill confidence is NOT defined as raw posterior mean
- [ ] No donor repo health checks depending on local filesystem
- [ ] No long orchestration loops in Vercel route handlers
- [ ] No synchronous state updates before webhook receipt write
- [ ] Webhooks NOT assumed to arrive once and in order
- [ ] Single node failure does NOT fail entire convoy
- [ ] No full nodes/edges array replacements in XYFlow
- [ ] No `node.data` used as local form state in XYFlow
- [ ] No `fitView()` called on every refresh

### Architecture Decision Compliance

- [ ] **#1**: Bridge owns convoy orchestration state (not Paperclip)
- [ ] **#2**: Webhook-driven dispatch is primary path
- [ ] **#3**: Cron sweeper is secondary reconciler
- [ ] **#4**: Normalized dependency-edge table with cached remaining_dependencies
- [ ] **#5**: Mailbox separate from event bus
- [ ] **#6**: Controlled XYFlow canvas with Zustand backing store
- [ ] **#7**: Skills uses weighted Beta-Bernoulli (Pr(theta >= tau_use))
- [ ] **#8**: Idempotent outbound dispatch with stable keys
- [ ] **#9**: Chat widget reuses existing Bridge chat stack
- [ ] **#10**: workspace_id derived from auth/workspace context
- [ ] **#11**: Chat widget and orchestration bar are separate surfaces

### Supabase Pattern Compliance

- [ ] All new route handlers use `getSupabaseAdmin()` (not `CompatDatabase` or `db.prepare()`)
- [ ] All new tables have `workspace_id INT NOT NULL` with no default
- [ ] No expansion of the temporary db.prepare() compatibility shim

### White-Label Compliance

- [ ] No hardcoded agent names in source code
- [ ] All URLs from environment variables
- [ ] Agent picker reads from Paperclip API at runtime
- [ ] Default agent from `DEFAULT_AGENT_ID` env var

---

## Phase 3: GENERATE

Write findings to `$ARTIFACTS_DIR/review/architecture.md`:

```markdown
# Architecture Review — <phase name>

## Summary
<1-2 sentences: clean or issues found>

## Findings

### CRITICAL (must fix before merge)
- <finding with file:line reference>

### HIGH (should fix before merge)
- <finding with file:line reference>

### MEDIUM (fix in follow-up)
- <finding with file:line reference>

### LOW (nice to have)
- <finding with file:line reference>

## Anti-Pattern Check: <PASS/FAIL>
## Architecture Decision Check: <PASS/FAIL>
## Supabase Pattern Check: <PASS/FAIL>
## White-Label Check: <PASS/FAIL>
```

If no issues found, write:
```
# Architecture Review — <phase name>
## All checks PASSED. No anti-patterns or architecture violations detected.
```

### GENERATE_CHECKPOINT
- [ ] `$ARTIFACTS_DIR/review/architecture.md` written

---

## Phase 4: REPORT

Summarize: how many findings at each severity level, and whether the phase passes architecture review.
