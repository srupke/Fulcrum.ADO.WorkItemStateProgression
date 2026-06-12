import { CoreRestClient } from "./core-client";
import { WorkRestClient } from "./work-client";
import { WorkItemTrackingRestClient } from "./work-item-tracking-client";

export function getClient(clientClass: any): any {
  const name = clientClass?.name ?? "";
  if (name === "CoreRestClient") return new CoreRestClient();
  if (name === "WorkRestClient") return new WorkRestClient();
  if (name === "WorkItemTrackingRestClient") return new WorkItemTrackingRestClient();
  return {};
}
