import { openSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import path from "node:path";
import { spawn } from "child_process";

const [, , customerId, mode, smbagentRoot, statusPath, historyPath, logPath, runId, pythonPathArg] =
  process.argv;

async function writeStatus(status) {
  await writeFile(statusPath, JSON.stringify(status, null, 2), "utf-8");
}

async function readHistory() {
  try {
    const raw = await readFile(historyPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeHistoryEntry(status) {
  const current = await readHistory();
  const next = current.filter((entry) => entry.runId !== runId);
  next.unshift({
    ...status,
    runId,
  });
  await writeFile(historyPath, JSON.stringify(next.slice(0, 20), null, 2), "utf-8");
}

async function main() {
  const outFd = openSync(logPath, "a");
  const command = `python3 -m smbagent.cli ${mode} ${customerId}`;
  const startedAt = new Date().toISOString();
  const pythonPath = pythonPathArg
    ? process.env.PYTHONPATH
      ? `${pythonPathArg}${path.delimiter}${process.env.PYTHONPATH}`
      : pythonPathArg
    : process.env.PYTHONPATH;

  const child = spawn("python3", ["-m", "smbagent.cli", mode, customerId], {
    cwd: smbagentRoot,
    env: {
      ...process.env,
      ...(pythonPath ? { PYTHONPATH: pythonPath } : {}),
    },
    stdio: ["ignore", outFd, outFd],
  });

  const runningStatus = {
    customerId,
    mode,
    status: "running",
    command,
    logPath,
    startedAt,
    pid: child.pid,
  };

  await writeStatus(runningStatus);
  await writeHistoryEntry(runningStatus);

  child.on("error", async (error) => {
    const nextStatus = {
      ...runningStatus,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: error.message,
    };
    await writeStatus(nextStatus);
    await writeHistoryEntry(nextStatus);
    process.exit(1);
  });

  child.on("exit", async (code) => {
    const nextStatus = {
      ...runningStatus,
      status: code === 0 ? "passed" : "failed",
      finishedAt: new Date().toISOString(),
      error: code === 0 ? undefined : `process exited with code ${code ?? "unknown"}`,
    };
    await writeStatus(nextStatus);
    await writeHistoryEntry(nextStatus);
    process.exit(code ?? 1);
  });
}

main().catch(async (error) => {
  const fallbackStatus = {
    customerId,
    mode,
    status: "failed",
    command: `python3 -m smbagent.cli ${mode} ${customerId}`,
    logPath,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : "worker bootstrap failed",
  };
  try {
    await writeStatus(fallbackStatus);
    await writeHistoryEntry(fallbackStatus);
  } finally {
    process.exit(1);
  }
});
