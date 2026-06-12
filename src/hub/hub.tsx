import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { CoreRestClient } from "azure-devops-extension-api/Core";
import { WorkRestClient } from "azure-devops-extension-api/Work";
import { WorkItemTrackingRestClient } from "azure-devops-extension-api/WorkItemTracking";
import "./hub.scss";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BusinessHoursConfig {
  enabled: boolean;
  startHour: number;
  endHour: number;
}

interface ExtensionConfig {
  showAssignedTo: boolean;
  showWorkItemType: boolean;
  showTitle: boolean;
  showEffort: boolean;
  excludeWeekends: boolean;
  businessHours: BusinessHoursConfig;
  stateOrder: string[];
  newStates: string[];
  doneStates: string[];
  yellowThresholdHours: number;
  redThresholdHours: number;
  excludedWorkItemTypes: string[];
}

interface WorkItemRow {
  id: number;
  title: string;
  workItemType: string;
  assignedTo: string;
  effort: number | null;
  currentState: string;
  team: string;
  url: string;
  stateDurations: Record<string, number>;
}

interface SortState {
  column: string;
  ascending: boolean;
}

const DEFAULT_CONFIG: ExtensionConfig = {
  showAssignedTo: true,
  showWorkItemType: true,
  showTitle: true,
  showEffort: true,
  excludeWeekends: true,
  businessHours: { enabled: true, startHour: 8, endHour: 17 },
  stateOrder: [],
  newStates: ["New", "Proposed"],
  doneStates: ["Done", "Closed"],
  yellowThresholdHours: 24,
  redThresholdHours: 48,
  excludedWorkItemTypes: [],
};

const CONFIG_KEY = "workItemStateProgressionConfig_v1";

// ── Time calculation helpers ─────────────────────────────────────────────────

function calculateHours(
  start: Date,
  end: Date,
  excludeWeekends: boolean,
  bh: BusinessHoursConfig
): number {
  if (end <= start) return 0;

  let hours = 0;
  const cur = new Date(start);

  while (cur < end) {
    const dow = cur.getDay();
    const isWeekend = dow === 0 || dow === 6;

    if (excludeWeekends && isWeekend) {
      // Jump to next Monday at midnight
      const daysToAdd = dow === 0 ? 1 : 2;
      cur.setDate(cur.getDate() + daysToAdd);
      cur.setHours(0, 0, 0, 0);
      continue;
    }

    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    const windowStart = bh.enabled
      ? new Date(y, m, d, bh.startHour, 0, 0, 0)
      : new Date(y, m, d, 0, 0, 0, 0);
    const windowEnd = bh.enabled
      ? new Date(y, m, d, bh.endHour, 0, 0, 0)
      : new Date(y, m, d + 1, 0, 0, 0, 0);

    const effectiveStart = cur > windowStart ? new Date(cur) : windowStart;
    const effectiveEnd = end < windowEnd ? end : windowEnd;

    if (effectiveEnd > effectiveStart) {
      hours += (effectiveEnd.getTime() - effectiveStart.getTime()) / 3_600_000;
    }

    // Advance to start of next day
    cur.setDate(cur.getDate() + 1);
    cur.setHours(0, 0, 0, 0);
  }

  return hours;
}

function buildStateDurations(
  updates: any[],
  cfg: ExtensionConfig
): Record<string, number> {
  // Collect state transitions in order
  const transitions: Array<{ state: string; at: Date }> = [];
  for (const u of updates) {
    const sf = u.fields?.["System.State"];
    if (sf?.newValue) {
      transitions.push({ state: sf.newValue as string, at: new Date(u.revisedDate) });
    }
  }

  const durations: Record<string, number> = {};
  const now = new Date();

  for (let i = 0; i < transitions.length; i++) {
    const { state, at } = transitions[i];
    const end = i + 1 < transitions.length ? transitions[i + 1].at : now;
    const h = calculateHours(at, end, cfg.excludeWeekends, cfg.businessHours);
    durations[state] = (durations[state] ?? 0) + h;
  }

  return durations;
}

// ── Cell rendering helpers ────────────────────────────────────────────────────

function cellColorClass(hours: number, yellowTh: number, redTh: number): string {
  if (!hours || hours === 0) return "";
  if (hours >= redTh) return "color-red";
  if (hours >= yellowTh) return "color-yellow";
  return "color-green";
}

function formatHours(hours: number | undefined): string {
  if (hours === undefined || hours === 0) return "";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Config persistence ────────────────────────────────────────────────────────

async function loadConfig(): Promise<ExtensionConfig | null> {
  try {
    const svc = await (SDK as any).getService("ms.vss-features.extension-data-service");
    const mgr = await svc.getDataManager();
    return (await mgr.getValue(CONFIG_KEY)) as ExtensionConfig ?? null;
  } catch {
    return null;
  }
}

async function saveConfig(cfg: ExtensionConfig): Promise<void> {
  try {
    const svc = await (SDK as any).getService("ms.vss-features.extension-data-service");
    const mgr = await svc.getDataManager();
    await mgr.setValue(CONFIG_KEY, cfg);
  } catch {}
}

// ── Main component ────────────────────────────────────────────────────────────

const Hub: React.FC = () => {
  // Selector state
  const [projects, setProjects] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [iterations, setIterations] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedIterationId, setSelectedIterationId] = useState("");

  // Data state
  const [rows, setRows] = useState<WorkItemRow[]>([]);
  const [discoveredStates, setDiscoveredStates] = useState<string[]>([]);
  const [discoveredWorkItemTypes, setDiscoveredWorkItemTypes] = useState<string[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);

  // Config
  const [config, setConfig] = useState<ExtensionConfig>(DEFAULT_CONFIG);
  const [draftConfig, setDraftConfig] = useState<ExtensionConfig>(DEFAULT_CONFIG);

  // ── SDK init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    (SDK as any).init({ loaded: false }).then(async () => {
      await (SDK as any).ready();
      const saved = await loadConfig();
      if (saved) setConfig(saved);
      (SDK as any).notifyLoadSucceeded?.();
    });
  }, []);

  // ── Load projects on mount ──────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const coreClient = getClient(CoreRestClient as any);
        const projs = await (coreClient as any).getProjects();
        setProjects(projs ?? []);
      } catch (e: any) {
        setError(`Failed to load projects: ${e.message}`);
      }
    })();
  }, []);

  // ── Load teams when project changes ────────────────────────────────────────

  useEffect(() => {
    if (!selectedProjectId) { setTeams([]); setSelectedTeamId(""); return; }
    (async () => {
      try {
        const coreClient = getClient(CoreRestClient as any);
        const t = await (coreClient as any).getTeams(selectedProjectId);
        setTeams(t ?? []);
        setSelectedTeamId("");
        setIterations([]);
        setSelectedIterationId("");
      } catch (e: any) {
        setError(`Failed to load teams: ${e.message}`);
      }
    })();
  }, [selectedProjectId]);

  // ── Load iterations when team changes ──────────────────────────────────────

  useEffect(() => {
    if (!selectedProjectId || !selectedTeamId) {
      setIterations([]); setSelectedIterationId(""); return;
    }
    (async () => {
      try {
        const workClient = getClient(WorkRestClient as any);
        const iters = await (workClient as any).getTeamIterations(
          { projectId: selectedProjectId, teamId: selectedTeamId }
        );
        const sorted = (iters ?? []).slice().sort(
          (a: any, b: any) =>
            new Date(b.attributes?.startDate ?? 0).getTime() -
            new Date(a.attributes?.startDate ?? 0).getTime()
        );
        setIterations(sorted);
        setSelectedIterationId(sorted[0]?.id ?? "");
      } catch (e: any) {
        setError(`Failed to load iterations: ${e.message}`);
      }
    })();
  }, [selectedProjectId, selectedTeamId]);

  // ── Load work items ─────────────────────────────────────────────────────────

  const handleLoad = useCallback(async () => {
    if (!selectedProjectId || !selectedTeamId || !selectedIterationId) return;
    setLoading(true);
    setError(null);
    setRows([]);

    try {
      const workClient = getClient(WorkRestClient as any);
      const witClient = getClient(WorkItemTrackingRestClient as any);
      const proj = projects.find(p => p.id === selectedProjectId);
      const team = teams.find(t => t.id === selectedTeamId);

      setLoadingMsg("Fetching sprint work items…");
      const iterWIs = await (workClient as any).getIterationWorkItems(
        { projectId: selectedProjectId, teamId: selectedTeamId },
        selectedIterationId
      );
      const ids: number[] = (iterWIs?.workItemRelations ?? [])
        .map((r: any) => r.target?.id)
        .filter(Boolean);

      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        setLoadingMsg("");
        return;
      }

      setLoadingMsg(`Loading ${ids.length} work items…`);
      const workItems = await (witClient as any).getWorkItemsBatch(
        {
          ids,
          fields: [
            "System.Id",
            "System.Title",
            "System.State",
            "System.WorkItemType",
            "System.AssignedTo",
            "Microsoft.VSTS.Scheduling.Effort",
            "Microsoft.VSTS.Scheduling.StoryPoints",
          ],
        },
        proj?.name
      );

      setLoadingMsg("Calculating state durations…");
      const allStateNames = new Set<string>();
      const builtRows: WorkItemRow[] = [];

      for (const wi of workItems) {
        const id: number = wi.id;
        const fields = wi.fields ?? {};
        const updates = await (witClient as any).getWorkItemUpdates(id, 200, 0, proj?.name);
        const durations = buildStateDurations(updates, config);
        Object.keys(durations).forEach(s => allStateNames.add(s));

        const assigned = fields["System.AssignedTo"];
        const effort =
          fields["Microsoft.VSTS.Scheduling.Effort"] ??
          fields["Microsoft.VSTS.Scheduling.StoryPoints"] ??
          null;

        const htmlHref =
          wi._links?.html?.href ??
          `${window.location.origin}/${proj?.name}/_workitems/edit/${id}`;

        builtRows.push({
          id,
          title: fields["System.Title"] ?? "",
          workItemType: fields["System.WorkItemType"] ?? "",
          assignedTo:
            typeof assigned === "object" ? assigned?.displayName ?? "" : assigned ?? "",
          effort: effort !== null ? Number(effort) : null,
          currentState: fields["System.State"] ?? "",
          team: team?.name ?? "",
          url: htmlHref,
          stateDurations: durations,
        });
      }

      // Derive ordered state list for columns
      const newSet = new Set(config.newStates.map(s => s.toLowerCase()));
      const doneSet = new Set(config.doneStates.map(s => s.toLowerCase()));
      const middleStates = Array.from(allStateNames).filter(
        s => !newSet.has(s.toLowerCase()) && !doneSet.has(s.toLowerCase())
      );

      // Respect user-defined order, append any newly discovered states at the end
      const orderedMiddle = [
        ...config.stateOrder.filter(s => middleStates.includes(s)),
        ...middleStates.filter(s => !config.stateOrder.includes(s)),
      ];

      setDiscoveredStates(orderedMiddle);
      setDiscoveredWorkItemTypes(
        Array.from(new Set(builtRows.map(r => r.workItemType).filter(Boolean))).sort()
      );
      setRows(builtRows);

      // Auto-update stateOrder in config with newly discovered states
      if (orderedMiddle.some(s => !config.stateOrder.includes(s))) {
        const updated = { ...config, stateOrder: orderedMiddle };
        setConfig(updated);
        await saveConfig(updated);
      }
    } catch (e: any) {
      setError(`Error loading data: ${e.message ?? String(e)}`);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }, [selectedProjectId, selectedTeamId, selectedIterationId, projects, teams, config]);

  // ── Sorting ─────────────────────────────────────────────────────────────────

  const handleSort = (col: string) => {
    setSort(prev =>
      prev?.column === col
        ? { column: col, ascending: !prev.ascending }
        : { column: col, ascending: true }
    );
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const { column, ascending } = sort;
    return [...rows].sort((a, b) => {
      let va: any, vb: any;
      switch (column) {
        case "team":       va = a.team; vb = b.team; break;
        case "id":         va = a.id; vb = b.id; break;
        case "title":      va = a.title; vb = b.title; break;
        case "type":       va = a.workItemType; vb = b.workItemType; break;
        case "assignedTo": va = a.assignedTo; vb = b.assignedTo; break;
        case "effort":     va = a.effort ?? -1; vb = b.effort ?? -1; break;
        default:
          va = a.stateDurations[column] ?? 0;
          vb = b.stateDurations[column] ?? 0;
      }
      if (typeof va === "string") {
        const cmp = va.localeCompare(vb);
        return ascending ? cmp : -cmp;
      }
      return ascending ? va - vb : vb - va;
    });
  }, [rows, sort]);

  const filteredRows = useMemo(() => {
    if (config.excludedWorkItemTypes.length === 0) return sortedRows;
    return sortedRows.filter(r => !config.excludedWorkItemTypes.includes(r.workItemType));
  }, [sortedRows, config.excludedWorkItemTypes]);

  // ── Column totals ────────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const s of discoveredStates) {
      t[s] = filteredRows.reduce((acc, r) => acc + (r.stateDurations[s] ?? 0), 0);
    }
    return t;
  }, [filteredRows, discoveredStates]);

  // ── Config modal handlers ────────────────────────────────────────────────────

  const toggleWorkItemType = (type: string, included: boolean) => {
    setDraftConfig(c => ({
      ...c,
      excludedWorkItemTypes: included
        ? c.excludedWorkItemTypes.filter(t => t !== type)
        : [...c.excludedWorkItemTypes, type],
    }));
  };

  const openConfig = () => { setDraftConfig({ ...config }); setShowConfig(true); };
  const saveConfigModal = async () => {
    setConfig(draftConfig);
    await saveConfig(draftConfig);
    setShowConfig(false);
  };

  const moveState = (idx: number, dir: -1 | 1) => {
    const arr = [...draftConfig.stateOrder];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setDraftConfig(c => ({ ...c, stateOrder: arr }));
  };

  // ── Render helpers ───────────────────────────────────────────────────────────

  const sortIcon = (col: string) =>
    sort?.column === col ? (sort.ascending ? " ▲" : " ▼") : " ⇅";

  const thSortable = (col: string, label: string) => (
    <th
      key={col}
      className={`sortable${sort?.column === col ? " sorted" : ""}`}
      onClick={() => handleSort(col)}
    >
      {label}<span className="sort-icon">{sortIcon(col)}</span>
    </th>
  );

  const renderNewCell = (row: WorkItemRow) => {
    const inNew = config.newStates.some(
      s => s.toLowerCase() === row.currentState.toLowerCase()
    );
    return (
      <td className="cell-new">
        {inNew ? <span className="new-indicator" title="Currently in New state">●</span> : ""}
      </td>
    );
  };

  const renderDoneCell = (row: WorkItemRow) => {
    const inDone = config.doneStates.some(
      s => s.toLowerCase() === row.currentState.toLowerCase()
    );
    return (
      <td className="cell-done">
        {inDone ? <span className="done-check" title="Completed">✔</span> : ""}
      </td>
    );
  };

  const renderHoursCell = (state: string, row: WorkItemRow) => {
    const h = row.stateDurations[state] ?? 0;
    const cls = cellColorClass(h, config.yellowThresholdHours, config.redThresholdHours);
    return (
      <td key={state} className={`cell-hours${cls ? " " + cls : ""}`}>
        {formatHours(h)}
      </td>
    );
  };

  // fixed column count for the "Total" label colspan
  const fixedColCount =
    1 + // Team
    1 + // ID
    (config.showTitle ? 1 : 0) +
    (config.showWorkItemType ? 1 : 0) +
    (config.showAssignedTo ? 1 : 0) +
    (config.showEffort ? 1 : 0) +
    1; // New column

  // ── Config modal ordering — only show states we've discovered ────────────────
  const configStateOrder = useMemo(() => {
    const discovered = new Set(discoveredStates);
    const inOrder = draftConfig.stateOrder.filter(s => discovered.has(s));
    const missing = discoveredStates.filter(s => !draftConfig.stateOrder.includes(s));
    return [...inOrder, ...missing];
  }, [draftConfig.stateOrder, discoveredStates]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="hub-root">
      {/* Toolbar */}
      <div className="toolbar">
        <h1>Work Item State Progression</h1>
        <div className="toolbar-sep" />
        <select
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
          disabled={loading}
        >
          <option value="">— Select Project —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={selectedTeamId}
          onChange={e => setSelectedTeamId(e.target.value)}
          disabled={loading || !selectedProjectId}
        >
          <option value="">— Select Team —</option>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={selectedIterationId}
          onChange={e => setSelectedIterationId(e.target.value)}
          disabled={loading || !selectedTeamId}
        >
          <option value="">— Select Sprint —</option>
          {iterations.map(i => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <button
          className="btn"
          onClick={handleLoad}
          disabled={loading || !selectedProjectId || !selectedTeamId || !selectedIterationId}
        >
          {loading ? <><span className="spinner" /> Loading…</> : "Load"}
        </button>
        <div className="toolbar-spacer" />
        <button className="btn btn-ghost" onClick={openConfig}>⚙ Settings</button>
      </div>

      {/* Content */}
      <div className="content">
        {error && <div className="error-msg">{error}</div>}

        {loading && (
          <div className="status-msg">
            <span className="spinner" /> {loadingMsg}
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="status-msg">
            {selectedIterationId
              ? "No work items found in this sprint."
              : "Select a project, team, and sprint, then click Load."}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="table-wrap">
            {filteredRows.length === 0 && (
              <div className="status-msg" style={{ height: 60 }}>
                No work items match the selected work item types.
              </div>
            )}
            <table className="state-table">
              <thead>
                <tr>
                  {thSortable("team", "Team")}
                  {thSortable("id", "ID")}
                  {config.showTitle && thSortable("title", "Title")}
                  {config.showWorkItemType && thSortable("type", "Type")}
                  {config.showAssignedTo && thSortable("assignedTo", "Assigned To")}
                  {config.showEffort && thSortable("effort", "Effort")}
                  <th>New</th>
                  {discoveredStates.map(s => thSortable(s, s))}
                  <th>Done</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.id}>
                    <td>{row.team}</td>
                    <td className="cell-id">
                      <a href={row.url} target="_blank" rel="noreferrer">{row.id}</a>
                    </td>
                    {config.showTitle && (
                      <td className="cell-title" title={row.title}>{row.title}</td>
                    )}
                    {config.showWorkItemType && (
                      <td><span className="wi-type-badge">{row.workItemType}</span></td>
                    )}
                    {config.showAssignedTo && <td>{row.assignedTo}</td>}
                    {config.showEffort && (
                      <td style={{ textAlign: "right" }}>{row.effort ?? ""}</td>
                    )}
                    {renderNewCell(row)}
                    {discoveredStates.map(s => renderHoursCell(s, row))}
                    {renderDoneCell(row)}
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="total-row">
                  <td colSpan={fixedColCount}>Totals</td>
                  {discoveredStates.map(s => (
                    <td key={s} className="cell-hours" style={{ textAlign: "right", fontWeight: 700 }}>
                      {formatHours(totals[s] ?? 0)}
                    </td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showConfig && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowConfig(false)}>
          <div className="modal">
            <h2>Settings</h2>

            <div className="modal-section">
              <h3>Visible Columns</h3>
              {(
                [
                  ["showTitle", "Work Item Title"],
                  ["showWorkItemType", "Work Item Type"],
                  ["showAssignedTo", "Assigned To"],
                  ["showEffort", "Effort (Story Points)"],
                ] as [keyof ExtensionConfig, string][]
              ).map(([key, label]) => (
                <div className="checkbox-row" key={key}>
                  <input
                    type="checkbox"
                    id={`chk-${key}`}
                    checked={draftConfig[key] as boolean}
                    onChange={e =>
                      setDraftConfig(c => ({ ...c, [key]: e.target.checked }))
                    }
                  />
                  <label htmlFor={`chk-${key}`}>{label}</label>
                </div>
              ))}
            </div>

            {discoveredWorkItemTypes.length > 0 && (
              <div className="modal-section">
                <h3>Work Item Types</h3>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ height: 22, fontSize: 11, padding: "0 8px" }}
                    onClick={() => setDraftConfig(c => ({ ...c, excludedWorkItemTypes: [] }))}
                  >
                    Select All
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ height: 22, fontSize: 11, padding: "0 8px" }}
                    onClick={() => setDraftConfig(c => ({ ...c, excludedWorkItemTypes: [...discoveredWorkItemTypes] }))}
                  >
                    Deselect All
                  </button>
                </div>
                {discoveredWorkItemTypes.map(type => (
                  <div className="checkbox-row" key={type}>
                    <input
                      type="checkbox"
                      id={`wit-${type}`}
                      checked={!draftConfig.excludedWorkItemTypes.includes(type)}
                      onChange={e => toggleWorkItemType(type, e.target.checked)}
                    />
                    <label htmlFor={`wit-${type}`}>{type}</label>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-section">
              <h3>Time Calculation</h3>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="chk-weekends"
                  checked={draftConfig.excludeWeekends}
                  onChange={e =>
                    setDraftConfig(c => ({ ...c, excludeWeekends: e.target.checked }))
                  }
                />
                <label htmlFor="chk-weekends">Exclude weekends</label>
              </div>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="chk-bh"
                  checked={draftConfig.businessHours.enabled}
                  onChange={e =>
                    setDraftConfig(c => ({
                      ...c,
                      businessHours: { ...c.businessHours, enabled: e.target.checked },
                    }))
                  }
                />
                <label htmlFor="chk-bh">Use business hours only</label>
              </div>
              {draftConfig.businessHours.enabled && (
                <div className="form-row" style={{ marginLeft: 24 }}>
                  <label>Hours:</label>
                  <input
                    type="number"
                    min={0} max={23}
                    value={draftConfig.businessHours.startHour}
                    onChange={e =>
                      setDraftConfig(c => ({
                        ...c,
                        businessHours: { ...c.businessHours, startHour: Number(e.target.value) },
                      }))
                    }
                  />
                  <span>to</span>
                  <input
                    type="number"
                    min={1} max={24}
                    value={draftConfig.businessHours.endHour}
                    onChange={e =>
                      setDraftConfig(c => ({
                        ...c,
                        businessHours: { ...c.businessHours, endHour: Number(e.target.value) },
                      }))
                    }
                  />
                </div>
              )}
            </div>

            <div className="modal-section">
              <h3>Color Thresholds</h3>
              <div className="form-row">
                <label>🟡 Yellow above:</label>
                <input
                  type="number" min={1}
                  value={draftConfig.yellowThresholdHours}
                  onChange={e =>
                    setDraftConfig(c => ({ ...c, yellowThresholdHours: Number(e.target.value) }))
                  }
                />
                <span>hours</span>
              </div>
              <div className="form-row">
                <label>🔴 Red above:</label>
                <input
                  type="number" min={1}
                  value={draftConfig.redThresholdHours}
                  onChange={e =>
                    setDraftConfig(c => ({ ...c, redThresholdHours: Number(e.target.value) }))
                  }
                />
                <span>hours</span>
              </div>
            </div>

            <div className="modal-section">
              <h3>New / Done State Names</h3>
              <div className="form-row">
                <label>"New" state names:</label>
                <input
                  type="text"
                  style={{ width: 200 }}
                  value={draftConfig.newStates.join(", ")}
                  onChange={e =>
                    setDraftConfig(c => ({
                      ...c,
                      newStates: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                    }))
                  }
                />
              </div>
              <div className="form-row">
                <label>"Done" state names:</label>
                <input
                  type="text"
                  style={{ width: 200 }}
                  value={draftConfig.doneStates.join(", ")}
                  onChange={e =>
                    setDraftConfig(c => ({
                      ...c,
                      doneStates: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                    }))
                  }
                />
              </div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                Comma-separated. These states appear in the fixed New/Done columns.
              </p>
            </div>

            {configStateOrder.length > 0 && (
              <div className="modal-section">
                <h3>State Column Order</h3>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
                  New (first) and Done (last) are fixed. Reorder the middle states below.
                </p>
                <ul className="state-order-list">
                  {configStateOrder.map((state, idx) => (
                    <li key={state}>
                      <span className="state-name">{state}</span>
                      <button onClick={() => moveState(idx, -1)} disabled={idx === 0} title="Move up">▲</button>
                      <button onClick={() => moveState(idx, 1)} disabled={idx === configStateOrder.length - 1} title="Move down">▼</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowConfig(false)}>Cancel</button>
              <button className="btn" onClick={saveConfigModal}>Save Settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Entry point ───────────────────────────────────────────────────────────────

(SDK as any).init({ loaded: false });
ReactDOM.render(<Hub />, document.getElementById("root"));
