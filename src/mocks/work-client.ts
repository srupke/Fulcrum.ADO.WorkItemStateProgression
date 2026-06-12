// Sprint dates: Sprint 23 = May 26 – June 6, 2025
const sprint23Start = new Date("2025-05-26T00:00:00Z");
const sprint23End = new Date("2025-06-06T23:59:59Z");

export const mockIterations: Record<string, any[]> = {
  "team-001": [
    { id: "iter-021", name: "Sprint 21", path: "FulcrumProject\\Sprint 21", attributes: { startDate: new Date("2025-04-28"), finishDate: new Date("2025-05-09") } },
    { id: "iter-022", name: "Sprint 22", path: "FulcrumProject\\Sprint 22", attributes: { startDate: new Date("2025-05-12"), finishDate: new Date("2025-05-23") } },
    { id: "iter-023", name: "Sprint 23", path: "FulcrumProject\\Sprint 23", attributes: { startDate: sprint23Start, finishDate: sprint23End } },
  ],
  "team-002": [
    { id: "iter-022", name: "Sprint 22", path: "FulcrumProject\\Sprint 22", attributes: { startDate: new Date("2025-05-12"), finishDate: new Date("2025-05-23") } },
    { id: "iter-023", name: "Sprint 23", path: "FulcrumProject\\Sprint 23", attributes: { startDate: sprint23Start, finishDate: sprint23End } },
  ],
  "team-003": [
    { id: "iter-023", name: "Sprint 23", path: "PlatformServices\\Sprint 23", attributes: { startDate: sprint23Start, finishDate: sprint23End } },
  ],
};

// Work item IDs assigned to each team/iteration
export const mockIterationWorkItems: Record<string, number[]> = {
  "team-001_iter-023": [1001, 1002, 1003, 1004],
  "team-002_iter-023": [1005, 1006],
  "team-003_iter-023": [1007],
};

export class WorkRestClient {
  async getTeamIterations(teamContext: any, _timeframe?: string): Promise<any[]> {
    const teamId = teamContext.teamId ?? teamContext.team;
    return mockIterations[teamId] ?? [];
  }

  async getIterationWorkItems(teamContext: any, iterationId: string): Promise<any> {
    const teamId = teamContext.teamId ?? teamContext.team;
    const key = `${teamId}_${iterationId}`;
    const ids = mockIterationWorkItems[key] ?? [];
    return {
      workItemRelations: ids.map(id => ({
        rel: null,
        source: null,
        target: { id, url: `http://localhost:3000/_apis/wit/workItems/${id}` },
      })),
    };
  }
}
