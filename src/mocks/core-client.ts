export const mockProjects = [
  { id: "proj-001", name: "FulcrumProject" },
  { id: "proj-002", name: "PlatformServices" },
];

export const mockTeams: Record<string, any[]> = {
  "proj-001": [
    { id: "team-001", name: "Team Alpha" },
    { id: "team-002", name: "Team Beta" },
  ],
  "proj-002": [
    { id: "team-003", name: "Platform Core" },
  ],
};

export class CoreRestClient {
  async getProjects(): Promise<any[]> {
    return mockProjects;
  }

  async getTeams(projectId: string, _mine?: boolean, top?: number, skip?: number): Promise<any[]> {
    return mockTeams[projectId] ?? [];
  }
}
