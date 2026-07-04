import { readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import type { WorkspaceRunHistoryEntry, WorkspaceRunStatus } from "@/lib/game-studio";
import {
  buildRuntimeCommand,
  buildWorkspaceArtifactPath,
  resolveWorkspaceAdapterConfig,
  workspacePathForCustomer,
} from "@/lib/workspace-adapter";

type RunMode = "plan-game" | "run-game";

function runStatusPath(customerId: string) {
  return buildWorkspaceArtifactPath(customerId, "website_run_status.json");
}

function runLogPath(customerId: string) {
  return buildWorkspaceArtifactPath(customerId, "website_run.log");
}

function runHistoryPath(customerId: string) {
  return buildWorkspaceArtifactPath(customerId, "website_run_history.json");
}

function workerScriptPath() {
  return path.resolve(process.cwd(), "scripts", "game-runner-worker.mjs");
}

async function workspaceExists(customerId: string) {
  try {
    const info = await stat(workspacePathForCustomer(customerId, resolveWorkspaceAdapterConfig()));
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function writeRunStatus(status: WorkspaceRunStatus) {
  await writeFile(runStatusPath(status.customerId), JSON.stringify(status, null, 2), "utf-8");
}

function buildRunId(customerId: string, mode: RunMode) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${mode}-${customerId}-${stamp}`;
}

async function readRunHistoryFile(customerId: string): Promise<WorkspaceRunHistoryEntry[]> {
  try {
    const raw = await readFile(runHistoryPath(customerId), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WorkspaceRunHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeRunHistory(customerId: string, entries: WorkspaceRunHistoryEntry[]) {
  await writeFile(runHistoryPath(customerId), JSON.stringify(entries, null, 2), "utf-8");
}

async function upsertRunHistory(entry: WorkspaceRunHistoryEntry) {
  const current = await readRunHistoryFile(entry.customerId);
  const next = current.filter((item) => item.runId !== entry.runId);
  next.unshift(entry);
  await writeRunHistory(entry.customerId, next.slice(0, 20));
}

export async function readRunStatus(customerId: string): Promise<WorkspaceRunStatus | null> {
  try {
    const raw = await readFile(runStatusPath(customerId), "utf-8");
    return JSON.parse(raw) as WorkspaceRunStatus;
  } catch {
    return null;
  }
}

export async function readRunHistory(customerId: string): Promise<WorkspaceRunHistoryEntry[]> {
  return readRunHistoryFile(customerId);
}

export async function triggerWorkspaceRun(
  customerId: string,
  mode: RunMode
): Promise<WorkspaceRunStatus> {
  if (!(await workspaceExists(customerId))) {
    throw new Error(`workspace not found for ${customerId}`);
  }

  const adapter = resolveWorkspaceAdapterConfig();
  if (adapter.mode === "artifact-only") {
    throw new Error(
      "Runtime adapter is disabled. Set GAME_STUDIO_RUNTIME_MODE=bundled-cli before running plan-game/run-game."
    );
  }
  if (!adapter.runtimeRoot) {
    throw new Error("Runtime adapter root is not configured.");
  }

  const root = adapter.runtimeRoot;
  const logPath = runLogPath(customerId);
  const statusPath = runStatusPath(customerId);
  const historyPath = runHistoryPath(customerId);
  const command = buildRuntimeCommand(customerId, mode, adapter);
  const runId = buildRunId(customerId, mode);

  const runningStatus: WorkspaceRunStatus = {
    customerId,
    mode,
    status: "running",
    command,
    logPath,
    startedAt: new Date().toISOString(),
  };
  await writeRunStatus(runningStatus);
  await upsertRunHistory({
    ...runningStatus,
    runId,
  });

  const worker = spawn(
    process.execPath,
    [
      workerScriptPath(),
      customerId,
      mode,
      root,
      statusPath,
      historyPath,
      logPath,
      runId,
      adapter.pythonPathEntries.join(path.delimiter),
    ],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        GAME_STUDIO_WORKSPACE_ROOT: adapter.workspaceRoot,
      },
    }
  );

  await writeRunStatus({
    ...runningStatus,
    pid: worker.pid,
  });
  await upsertRunHistory({
    ...runningStatus,
    pid: worker.pid,
    runId,
  });

  worker.unref();
  return {
    ...runningStatus,
    pid: worker.pid,
  };
}
