# AI Governance

## Approval levels

| Level | Meaning | Examples |
|---|---|---|
| L0 | AI executes autonomously within narrow safe bounds | Tagging, deduping, internal draft formatting |
| L1 | AI executes and notifies | Knowledge classification, low-risk dashboard refresh |
| L2 | AI prepares and requests approval | Assignment feedback release, workflow activation |
| L3 | CEO approval required | Sending external campaigns, high-impact student interventions, policy changes |
| L4 | Recommendation only | Strategic changes, pricing ideas, major curriculum redesign |

## Knowledge promotion pipeline (never bypassed)

```
capture → validate → categorize → relationship map → review → approval
→ production knowledge → version → archive
```

Stable context (constitution, brand DNA, tool definitions, recurring process rules) stays separate
from ephemeral high-churn context, so repeated runs are cheaper and more stable (prompt caching).

## Rollback and versioning rules (universal)

| Artifact type | Versioning rule | Rollback rule |
|---|---|---|
| Knowledge item | Immutable versions; one current pointer | Repoint current version to prior approved version |
| Workflow | Semver + activation window | Re-activate previous stable workflow version |
| Content | Draft and approved versions | Revert publish plan or republish prior approved asset |
| Prompt package | Git-tracked files with changelog | Git revert or restore checkpoint |
| OAuth / integrations | Versioned config records, never overwrite silently | Roll back config version; preserve event log |
| Schema | Forward-only migrations + reversible down plan for dev | DBA-reviewed rollback or compensating migration |
