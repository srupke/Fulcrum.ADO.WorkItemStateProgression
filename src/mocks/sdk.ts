const store: Record<string, any> = {};

const dataManager = {
  getValue: async (key: string) => store[key] ?? null,
  setValue: async (key: string, value: any) => { store[key] = value; },
};

const dataService = {
  getDataManager: async () => dataManager,
};

export function init(_opts?: any): Promise<void> {
  return Promise.resolve();
}

export function ready(): Promise<void> {
  return Promise.resolve();
}

export function notifyLoadSucceeded(): void {}

export function getHost() {
  return { name: "MockOrg", id: "mock-host-id", type: 0 };
}

export function getExtensionContext() {
  return { id: "mock-extension", publisherId: "MockPublisher", version: "1.0.0" };
}

export async function getService(serviceId: string): Promise<any> {
  if (serviceId === "ms.vss-features.extension-data-service") return dataService;
  return {};
}

export function getConfiguration(): any {
  return { rootUri: "http://localhost:3000" };
}
