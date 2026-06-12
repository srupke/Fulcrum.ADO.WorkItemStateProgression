---
name: project-work-item-state-progression
description: ADO extension for work item state duration analysis — scaffolding, API choices, config schema
metadata:
  type: project
---

Extension: `fulcrum-work-item-state-progression`, publisher `ScottRupke`.
Hub contributes to `ms.vss-work-web.work-hub-group` (Boards area, alongside Backlogs/Sprints/Queries).

APIs used:
- `CoreRestClient.getProjects()` / `getTeams(projectId)` — project/team selectors
- `WorkRestClient.getTeamIterations(teamContext)` / `getIterationWorkItems(teamContext, iterationId)` — sprint work item IDs
- `WorkItemTrackingRestClient.getWorkItemsBatch({ids, fields})` — work item details
- `WorkItemTrackingRestClient.getWorkItemUpdates(id)` — state transition history

Config stored in extension data service under key `workItemStateProgressionConfig_v1`.

**Why:** Leadership bottleneck visibility — hours per state per work item.
**How to apply:** When adding features, preserve the config schema key `_v1` suffix versioning convention.

Existing extension at `C:\Source\GitHub\Fulcrum.ADO.RepositoryActivity` — same build/mock pattern, used as the scaffold reference.
