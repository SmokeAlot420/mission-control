---
description: Implement one phase of Bridge Feature Transplants PRP with full constraint awareness
argument-hint: <phase name, e.g. "Phase 1: Infrastructure Hardening">
---

# Bridge Phase Implementation

**Workflow**: $WORKFLOW_ID
**Base branch**: $BASE_BRANCH

---

## Phase 1: LOAD CONTEXT

Read these files to understand the full implementation spec:

1. `$ARTIFACTS_DIR/prp.md` — The complete PRP with all phases, schemas, file lists, and architecture decisions
2. `$ARTIFACTS_DIR/prime.md` — Codebase prime report with build sequences and gotchas
3. `$ARTIFACTS_DIR/research.md` — Research deep-dives (donor repo analysis, patterns)
4. `$ARTIFACTS_DIR/phase-input.txt` — Which specific phase to implement

From the PRP, extract for your target phase:
- The exact file list (Create / Modify / Audit tags)
- Any SQL schema to apply
- The approach notes and crshdn references
- Which architecture decisions apply

### LOAD_CHECKPOINT
- [ ] PRP phase section identified and understood
- [ ] File list extracted with create/modify/audit tags
- [ ] Schema SQL extracted (if applicable)
- [ ] Anti-patterns list reviewed

---

## Phase 2: EXPLORE EXISTING CODE

Before writing anything, read the existing files you'll need to integrate with:

- `src/lib/db.ts` — Find `getSupabaseAdmin()` to use in all new routes
- `src/proxy.ts` — Understand auth exemption patterns (for /api/health)
- `src/lib/event-bus.ts` — Existing event types to extend
- `src/lib/webhooks.ts` — Existing webhook patterns
- `src/lib/paperclip-client.ts` — Existing Paperclip integration
- `src/store/index.ts` — Existing Zustand store shape
- `src/app/[[...panel]]/page.tsx` — Panel registration pattern

For Chat Widget (Phase 4A) specifically, also read:
- `src/components/chat/chat-input.tsx`
- `src/components/chat/message-bubble.tsx`
- `src/components/chat/chat-panel.tsx`
- `src/components/chat/conversation-list.tsx`
- `src/app/api/chat/` routes
- `src/app/api/chat_relay/message/route.ts`

### EXPLORE_CHECKPOINT
- [ ] getSupabaseAdmin() import path confirmed
- [ ] Existing patterns understood for the files being modified
- [ ] Integration points identified

---

## Phase 3: SCHEMA MIGRATION

If this phase includes Supabase schema changes:

1. Extract the SQL from the PRP phase section
2. Run it against Supabase project `mbemblwrncmkzmqfvwyd` using the Supabase SQL editor or CLI
3. Verify tables/indexes created

**CRITICAL**: Every table MUST have `workspace_id INT NOT NULL` with NO default value. The workspace_id is derived from authenticated workspace context at the route handler level.

Skip this step if the phase has no schema changes (e.g., Phase 1).

### SCHEMA_CHECKPOINT
- [ ] SQL extracted from PRP
- [ ] Tables created in Supabase
- [ ] Indexes verified
- [ ] workspace_id has NO default on any new table

---

## Phase 4: IMPLEMENT

For each file in the phase's file list, in order:

**"Create" files**: Write the full implementation following:
- Import `getSupabaseAdmin` from `@/lib/db` for all Supabase queries
- Use `NextResponse.json()` for API routes
- Follow existing patterns in adjacent files
- TypeScript strict mode — no `any` types
- All new route handlers must derive workspace_id from auth context

**"Modify" files**: Read the existing file FIRST, then apply targeted changes:
- Preserve existing code structure
- Add new items to existing patterns (e.g., new event types to event-bus.ts)
- Don't refactor unrelated code

**"Audit" files**: Read the file, verify the stated behavior, fix if gaps found.

### Per-file workflow:
1. Write/edit the file
2. Run `pnpm run typecheck` immediately
3. Fix any type errors before proceeding to the next file
4. Repeat

### CRITICAL RULES (hooks also enforce these):
- `getSupabaseAdmin()` for ALL new routes — NEVER `CompatDatabase` or `db.prepare()`
- `workspace_id` from auth/context — NEVER hardcode to 1
- crshdn/mission-control is REFERENCE ONLY — rebuild for Supabase
- Chat widget REUSES existing chat stack — no parallel transcript system
- Skills confidence = `Pr(theta >= tau_use)` — weighted Beta-Bernoulli
- Convoy dependencies in normalized `mc_convoy_dependency_edges` table — NOT JSON arrays
- White-label: no hardcoded agent names, all URLs from env vars
- Webhook receipt written BEFORE async state mutation (idempotent dispatch)

### IMPLEMENT_CHECKPOINT
- [ ] All "Create" files written
- [ ] All "Modify" files updated
- [ ] All "Audit" files verified
- [ ] TypeCheck passes after each file

---

## Phase 5: VALIDATE

Run the full validation suite:

```bash
pnpm run typecheck
pnpm run build
pnpm run test
```

Fix any errors. The workflow has a deterministic validation gate after this node — if typecheck or build fail, the workflow stops.

### VALIDATE_CHECKPOINT
- [ ] TypeCheck clean (zero errors)
- [ ] Build succeeds
- [ ] Tests pass (or expected failures documented)

---

## Phase 6: GENERATE ARTIFACTS

Write a summary to `$ARTIFACTS_DIR/implementation.md`:

```markdown
# Phase Implementation Summary

## Phase
<phase name>

## Files Created
- <path> — <purpose>

## Files Modified
- <path> — <what changed>

## Schema Changes
<SQL applied, or "None">

## Key Decisions
- <decision 1>
- <decision 2>

## Known Limitations
- <any TODOs or follow-ups>
```

### GENERATE_CHECKPOINT
- [ ] `$ARTIFACTS_DIR/implementation.md` written
- [ ] Summary is accurate and complete

---

## Phase 7: REPORT

Provide a concise final message:
1. What was implemented (file count, feature summary)
2. Schema changes applied
3. Build/test status
4. Any warnings or follow-ups needed
