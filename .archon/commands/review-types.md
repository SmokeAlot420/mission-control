---
description: TypeScript type safety review — strict types, no any, proper generics
argument-hint: (no arguments — reads PR diff)
---

# Type Safety Review

**Workflow**: $WORKFLOW_ID

This is a READ-ONLY review. Do not modify any files.

## Phase 1: LOAD

1. Read `$ARTIFACTS_DIR/.pr-number` to get the PR number
2. Run `gh pr diff $(cat $ARTIFACTS_DIR/.pr-number)` to get the full diff

## Phase 2: ANALYZE

Review every changed TypeScript file for:

### Type Safety
- [ ] No `any` types (use `unknown` and narrow, or proper generics)
- [ ] No non-null assertions (`!`) without documented reason
- [ ] No `@ts-ignore` or `@ts-expect-error` without documented reason
- [ ] Return types explicit on exported functions
- [ ] API response types match Supabase schema types

### Next.js Patterns
- [ ] Route handlers use proper `NextRequest`/`NextResponse` types
- [ ] Server Components don't import client-only hooks
- [ ] Client Components marked with 'use client' where needed
- [ ] Async params/searchParams properly awaited (Next.js 16)

### React Patterns
- [ ] Props interfaces defined (not inline object types)
- [ ] Event handlers properly typed
- [ ] useEffect dependencies correct
- [ ] No missing key props in lists

### Supabase Types
- [ ] Query results properly typed (not `any`)
- [ ] Null checks on optional database fields
- [ ] Enum values match CHECK constraints in schema

## Phase 3: GENERATE

Write findings to `$ARTIFACTS_DIR/review/types.md`:

```markdown
# Type Safety Review

## Findings

### CRITICAL
- <finding with file:line>

### HIGH
- <finding with file:line>

### MEDIUM
- <finding with file:line>

### LOW
- <finding with file:line>
```

## Phase 4: REPORT

Summarize: type safety assessment, findings count by severity.
