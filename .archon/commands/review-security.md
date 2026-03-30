---
description: Security review of PR changes — injection, auth bypass, secrets, OWASP top 10
argument-hint: (no arguments — reads PR diff)
---

# Security Review

**Workflow**: $WORKFLOW_ID

This is a READ-ONLY review. Do not modify any files.

## Phase 1: LOAD

1. Read `$ARTIFACTS_DIR/.pr-number` to get the PR number
2. Run `gh pr diff $(cat $ARTIFACTS_DIR/.pr-number)` to get the full diff
3. Read `$ARTIFACTS_DIR/implementation.md` for context on what was built

## Phase 2: ANALYZE

Review every changed file for:

### Input Validation
- [ ] User inputs sanitized before use in queries
- [ ] No SQL injection vectors (parameterized queries only)
- [ ] No XSS vectors (content properly escaped)
- [ ] No command injection in Bash/exec calls

### Authentication & Authorization
- [ ] New routes properly protected by auth (proxy.ts or middleware)
- [ ] Public routes explicitly exempted with documented reason
- [ ] No auth tokens or secrets in client-side code
- [ ] workspace_id derived from auth context (no user-supplied workspace_id trusted)

### Secrets & Configuration
- [ ] No hardcoded API keys, tokens, or passwords
- [ ] Secrets loaded from environment variables only
- [ ] No .env files or credentials in committed code
- [ ] Webhook secrets use timing-safe comparison

### Data Protection
- [ ] Webhook receipts written before state mutations (idempotency)
- [ ] No sensitive data logged or exposed in error messages
- [ ] CORS and CSP headers appropriate for new endpoints

## Phase 3: GENERATE

Write findings to `$ARTIFACTS_DIR/review/security.md`:

```markdown
# Security Review

## Findings

### CRITICAL
- <finding>

### HIGH
- <finding>

### MEDIUM
- <finding>

### LOW
- <finding>
```

## Phase 4: REPORT

Summarize security posture: findings count by severity, overall assessment.
