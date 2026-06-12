// Mock work items with realistic fields
const mockWorkItemFields: Record<number, any> = {
  1001: {
    "System.Id": 1001,
    "System.Title": "Implement user authentication with OAuth2",
    "System.State": "Resolved",
    "System.WorkItemType": "User Story",
    "System.AssignedTo": { displayName: "Alice Johnson" },
    "Microsoft.VSTS.Scheduling.Effort": 8,
  },
  1002: {
    "System.Id": 1002,
    "System.Title": "Fix null reference in payment processor",
    "System.State": "Active",
    "System.WorkItemType": "Bug",
    "System.AssignedTo": { displayName: "Bob Smith" },
    "Microsoft.VSTS.Scheduling.Effort": 3,
  },
  1003: {
    "System.Id": 1003,
    "System.Title": "Add pagination to product listing API",
    "System.State": "Closed",
    "System.WorkItemType": "User Story",
    "System.AssignedTo": { displayName: "Carol White" },
    "Microsoft.VSTS.Scheduling.Effort": 5,
  },
  1004: {
    "System.Id": 1004,
    "System.Title": "Update database connection pool settings",
    "System.State": "New",
    "System.WorkItemType": "Task",
    "System.AssignedTo": { displayName: "Dave Brown" },
    "Microsoft.VSTS.Scheduling.Effort": 2,
  },
  1005: {
    "System.Id": 1005,
    "System.Title": "Refactor notification service to use event bus",
    "System.State": "Active",
    "System.WorkItemType": "User Story",
    "System.AssignedTo": { displayName: "Eve Davis" },
    "Microsoft.VSTS.Scheduling.Effort": 13,
  },
  1006: {
    "System.Id": 1006,
    "System.Title": "Dashboard loads slowly with large datasets",
    "System.State": "Resolved",
    "System.WorkItemType": "Bug",
    "System.AssignedTo": { displayName: "Frank Miller" },
    "Microsoft.VSTS.Scheduling.Effort": 5,
  },
  1007: {
    "System.Id": 1007,
    "System.Title": "Migrate CI pipeline to GitHub Actions",
    "System.State": "Active",
    "System.WorkItemType": "Task",
    "System.AssignedTo": { displayName: "Grace Lee" },
    "Microsoft.VSTS.Scheduling.Effort": 8,
  },
};

// State history for each work item (in chronological order)
// Each entry: state transitioned TO at the given date
const mockStateHistory: Record<number, Array<{ state: string; at: string }>> = {
  1001: [
    { state: "New",      at: "2025-05-26T08:00:00Z" },
    { state: "Active",   at: "2025-05-26T10:30:00Z" },
    { state: "Resolved", at: "2025-05-29T15:00:00Z" },
  ],
  1002: [
    { state: "New",    at: "2025-05-26T08:00:00Z" },
    { state: "Active", at: "2025-05-27T09:00:00Z" },
    // Still active — no further transitions
  ],
  1003: [
    { state: "New",    at: "2025-05-26T08:00:00Z" },
    { state: "Active", at: "2025-05-26T14:00:00Z" },
    { state: "Resolved", at: "2025-05-28T11:00:00Z" },
    { state: "Closed", at: "2025-05-29T09:00:00Z" },
  ],
  1004: [
    { state: "New", at: "2025-05-30T08:00:00Z" },
    // Still new — not started
  ],
  1005: [
    { state: "New",    at: "2025-05-26T08:00:00Z" },
    { state: "Active", at: "2025-05-26T08:30:00Z" },
    // Huge bottleneck — been active since day 1
  ],
  1006: [
    { state: "New",      at: "2025-05-26T08:00:00Z" },
    { state: "Active",   at: "2025-05-27T13:00:00Z" },
    { state: "Resolved", at: "2025-06-02T10:00:00Z" },
  ],
  1007: [
    { state: "New",    at: "2025-05-26T08:00:00Z" },
    { state: "Active", at: "2025-05-28T09:00:00Z" },
  ],
};

function buildUpdates(history: Array<{ state: string; at: string }>): any[] {
  return history.map((entry, idx) => ({
    id: idx + 1,
    rev: idx + 1,
    revisedDate: entry.at,
    fields: {
      "System.State": {
        oldValue: idx === 0 ? null : history[idx - 1].state,
        newValue: entry.state,
      },
    },
  }));
}

export class WorkItemTrackingRestClient {
  async getWorkItemsBatch(request: { ids: number[]; fields?: string[] }, _project?: string): Promise<any[]> {
    return request.ids
      .filter(id => mockWorkItemFields[id])
      .map(id => ({
        id,
        fields: mockWorkItemFields[id],
        url: `http://localhost:3000/_apis/wit/workItems/${id}`,
        _links: { html: { href: `http://localhost:3000/_workitems/edit/${id}` } },
      }));
  }

  async getWorkItemUpdates(id: number, _top?: number, _skip?: number, _project?: string): Promise<any[]> {
    const history = mockStateHistory[id] ?? [];
    return buildUpdates(history);
  }

  async getWorkItemTypeStates(project: string, type: string): Promise<any[]> {
    // Return standard Agile states with categories
    return [
      { name: "New",      color: "b2b2b2", category: "Proposed" },
      { name: "Active",   color: "007acc", category: "InProgress" },
      { name: "Resolved", color: "ff9d00", category: "Resolved" },
      { name: "Closed",   color: "339933", category: "Completed" },
    ];
  }
}
