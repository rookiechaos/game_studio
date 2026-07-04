import { readdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import type {
  DeliveryBundleManifest,
  ReleaseReadinessCheck,
  ReleaseReadinessReport,
  WorkspaceOverview,
  WorkspaceSignoff,
  WorkspaceArtifactContent,
  WorkspaceArtifactStatus,
  WorkspaceSnapshot,
} from "@/lib/game-studio";
import { readRunHistory, readRunStatus } from "@/lib/game-runner";
import {
  buildWorkspaceArtifactPath,
  resolveWorkspaceAdapterConfig,
  SOURCE_PACK_CORE_ARTIFACTS,
  workspacePathForCustomer as workspacePathForCustomerFromAdapter,
} from "@/lib/workspace-adapter";
import { operatorText, resolveServerLocale } from "@/lib/i18n";

const CORE_ARTIFACTS = [...SOURCE_PACK_CORE_ARTIFACTS];

const DOWNLOADABLE_ARTIFACTS = new Set<string>(CORE_ARTIFACTS);

async function exists(target: string) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function artifactStatuses(workspacePath: string): Promise<WorkspaceArtifactStatus[]> {
  const results: WorkspaceArtifactStatus[] = [];
  for (const name of CORE_ARTIFACTS) {
    results.push({
      name,
      exists: await exists(path.join(workspacePath, name)),
    });
  }
  return results;
}

function artifactKind(name: string): WorkspaceArtifactContent["kind"] {
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".md")) return "markdown";
  if (name.endsWith(".log")) return "log";
  return "text";
}

function buildPreviewLines(raw: string, kind: WorkspaceArtifactContent["kind"]) {
  if (kind === "json") {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2).split("\n").slice(0, 18);
    } catch {
      return raw.split("\n").slice(0, 18);
    }
  }
  return raw.split("\n").slice(0, 18);
}

async function readArtifactContent(
  workspacePath: string,
  name: string
): Promise<WorkspaceArtifactContent> {
  const targetPath = path.join(workspacePath, name);
  const kind = artifactKind(name);

  if (!(await exists(targetPath))) {
    return {
      name,
      kind,
      exists: false,
      preview: [],
    };
  }

  try {
    const raw = await readFile(targetPath, "utf-8");
    const content: WorkspaceArtifactContent = {
      name,
      kind,
      exists: true,
      preview: buildPreviewLines(raw, kind),
      raw,
    };
    if (kind === "json") {
      try {
        content.json = JSON.parse(raw);
      } catch {
        content.json = undefined;
      }
    }
    return content;
  } catch {
    return {
      name,
      kind,
      exists: true,
      preview: ["failed to read artifact content"],
    };
  }
}

function workspacePathForCustomer(customerId: string) {
  return workspacePathForCustomerFromAdapter(customerId, resolveWorkspaceAdapterConfig());
}

function signoffPath(customerId: string) {
  return buildWorkspaceArtifactPath(customerId, "website_signoff.json");
}

async function readArtifactContents(workspacePath: string) {
  const preferred = [
    "frontend_plan_preview.json",
    "game_plan.json",
    "scene_map.json",
    "release_checklist.json",
    "website_run_status.json",
    "website_run_history.json",
    "website_signoff.json",
    "website_run.log",
  ];
  const results: WorkspaceArtifactContent[] = [];
  for (const name of preferred) {
    results.push(await readArtifactContent(workspacePath, name));
  }
  return results;
}

async function listDirectories(codePath: string) {
  try {
    const entries = await readdir(codePath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function listSceneFiles(codePath: string) {
  const scenesPath = path.join(codePath, "game", "scenes");
  try {
    const entries = await readdir(scenesPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function buildSummary(workspacePath: string) {
  const requirementsPath = path.join(workspacePath, "game_requirements.json");
  try {
    const raw = await readFile(requirementsPath, "utf-8");
    const data = JSON.parse(raw) as { project_name?: string; package?: string; summary_ja?: string };
    return [
      data.project_name ? `project: ${data.project_name}` : null,
      data.package ? `package: ${data.package}` : null,
      data.summary_ja ? `summary: ${data.summary_ja}` : null,
    ]
      .filter(Boolean)
      .join(" / ");
  } catch {
    return "workspace created, awaiting further game artifacts";
  }
}

function artifactExists(artifacts: WorkspaceArtifactStatus[], name: string) {
  return artifacts.some((artifact) => artifact.name === name && artifact.exists);
}

function buildReleaseReadiness(snapshot: {
  artifacts: WorkspaceArtifactStatus[];
  sceneFiles: string[];
  runHistory: Awaited<ReturnType<typeof readRunHistory>>;
}): ReleaseReadinessReport {
  const text = operatorText(resolveServerLocale());
  const latestRun = snapshot.runHistory[0];
  const checks: ReleaseReadinessCheck[] = [
    {
      label: "Receipt + Requirements",
      status:
        artifactExists(snapshot.artifacts, "frontend_intake_receipt.json") &&
        artifactExists(snapshot.artifacts, "game_requirements.json")
          ? "ready"
          : "blocked",
      detail: text.readiness.receiptRequirementsDetail,
    },
    {
      label: "Planning Artifacts",
      status:
        artifactExists(snapshot.artifacts, "game_plan.json") &&
        artifactExists(snapshot.artifacts, "scene_map.json") &&
        artifactExists(snapshot.artifacts, "release_checklist.json")
          ? "ready"
          : artifactExists(snapshot.artifacts, "frontend_plan_preview.json")
            ? "warning"
            : "blocked",
      detail: text.readiness.planningArtifactsDetail,
    },
    {
      label: "Scene Output",
      status:
        snapshot.sceneFiles.length >= 3
          ? "ready"
          : snapshot.sceneFiles.length > 0
            ? "warning"
            : "blocked",
      detail: text.readiness.sceneOutputDetail,
    },
    {
      label: "Latest Run",
      status:
        latestRun?.status === "passed"
          ? "ready"
          : latestRun?.status === "running"
            ? "warning"
            : latestRun
              ? "blocked"
              : "warning",
      detail: text.readiness.latestRunDetail,
    },
  ];

  const score = checks.reduce((total, check) => {
    if (check.status === "ready") return total + 25;
    if (check.status === "warning") return total + 12;
    return total;
  }, 0);

  const status: ReleaseReadinessReport["status"] = checks.some((check) => check.status === "blocked")
    ? "blocked"
    : checks.some((check) => check.status === "warning")
      ? "warning"
      : "ready";

  const summary =
    status === "ready"
      ? text.readiness.summaryReady
      : status === "warning"
        ? text.readiness.summaryWarning
        : text.readiness.summaryBlocked;

  return { score, status, checks, summary };
}

function buildDeliveryBundle(snapshot: {
  customerId: string;
  artifacts: WorkspaceArtifactStatus[];
  codeDirectories: string[];
  sceneFiles: string[];
  runHistory: Awaited<ReturnType<typeof readRunHistory>>;
  signoff: WorkspaceSignoff;
}): DeliveryBundleManifest {
  const text = operatorText(resolveServerLocale());
  const latestRun = snapshot.runHistory[0];
  const includedArtifacts = snapshot.artifacts.filter((artifact) => artifact.exists).map((artifact) => artifact.name);
  const missingArtifacts = snapshot.artifacts.filter((artifact) => !artifact.exists).map((artifact) => artifact.name);
  const recommendedNextActions =
    snapshot.signoff.status === "signed_off"
      ? [text.nextActions.signedOffShare, text.nextActions.signedOffAttach]
      : latestRun?.status === "passed"
        ? [text.nextActions.passedShare, text.nextActions.passedReview, text.nextActions.passedSignoff]
        : [text.nextActions.runAgain, text.nextActions.fillArtifacts];

  return {
    customerId: snapshot.customerId,
    generatedAt: new Date().toISOString(),
    includedArtifacts,
    missingArtifacts,
    codeDirectories: snapshot.codeDirectories,
    sceneFiles: snapshot.sceneFiles,
    latestRun: latestRun
      ? {
          mode: latestRun.mode,
          status: latestRun.status,
          startedAt: latestRun.startedAt,
          finishedAt: latestRun.finishedAt,
        }
      : undefined,
    recommendedNextActions,
  };
}

function buildWorkspaceOverview(snapshot: {
  artifacts: WorkspaceArtifactStatus[];
  sceneFiles: string[];
  runHistory: Awaited<ReturnType<typeof readRunHistory>>;
  readiness: ReleaseReadinessReport;
}): WorkspaceOverview {
  const text = operatorText(resolveServerLocale());
  const existingArtifactCount = snapshot.artifacts.filter((artifact) => artifact.exists).length;
  const missingArtifactCount = snapshot.artifacts.length - existingArtifactCount;
  const latestRun = snapshot.runHistory[0];
  const latestRunLabel = latestRun
    ? `${latestRun.mode} / ${latestRun.status}`
    : text.overview.noRunsYet;
  const primaryAction =
    snapshot.readiness.status === "ready"
      ? text.overview.primaryReady
      : snapshot.readiness.status === "warning"
        ? text.overview.primaryWarning
        : text.overview.primaryBlocked;

  return {
    existingArtifactCount,
    missingArtifactCount,
    sceneFileCount: snapshot.sceneFiles.length,
    latestRunLabel,
    primaryAction,
  };
}

export async function readWorkspaceSignoff(customerId: string): Promise<WorkspaceSignoff> {
  try {
    const raw = await readFile(signoffPath(customerId), "utf-8");
    const parsed = JSON.parse(raw) as WorkspaceSignoff;
    return parsed;
  } catch {
    return { status: "pending" };
  }
}

export async function writeWorkspaceSignoff(customerId: string, signoff: WorkspaceSignoff) {
  await writeFile(signoffPath(customerId), JSON.stringify(signoff, null, 2), "utf-8");
}

export async function readWorkspaceSnapshot(customerId: string): Promise<WorkspaceSnapshot> {
  const workspacePath = workspacePathForCustomer(customerId);
  const codePath = path.join(workspacePath, "code");
  const artifacts = await artifactStatuses(workspacePath);
  const artifactContents = await readArtifactContents(workspacePath);
  const codeDirectories = await listDirectories(codePath);
  const sceneFiles = await listSceneFiles(codePath);
  const runHistory = await readRunHistory(customerId);
  const readiness = buildReleaseReadiness({ artifacts, sceneFiles, runHistory });
  const signoff = await readWorkspaceSignoff(customerId);
  const overview = buildWorkspaceOverview({ artifacts, sceneFiles, runHistory, readiness });
  const deliveryBundle = buildDeliveryBundle({
    customerId,
    artifacts,
    codeDirectories,
    sceneFiles,
    runHistory,
    signoff,
  });

  return {
    customerId,
    workspacePath,
    artifacts,
    artifactContents,
    codeDirectories,
    sceneFiles,
    runHistory,
    overview,
    signoff,
    readiness,
    deliveryBundle,
    hasGamePlan: artifacts.some((artifact) => artifact.name === "game_plan.json" && artifact.exists),
    hasReceipt: artifacts.some((artifact) => artifact.name === "frontend_intake_receipt.json" && artifact.exists),
    summary: await buildSummary(workspacePath),
  };
}

export async function readWorkspaceBrowserPayload(customerId: string) {
  const snapshot = await readWorkspaceSnapshot(customerId);
  const runStatus = await readRunStatus(customerId);
  return { snapshot, runStatus };
}

export async function readWorkspaceArtifact(customerId: string, name: string) {
  if (!DOWNLOADABLE_ARTIFACTS.has(name)) {
    throw new Error(`artifact not allowed: ${name}`);
  }
  return readArtifactContent(workspacePathForCustomer(customerId), name);
}

export async function buildOperatorHandoffMarkdown(customerId: string) {
  const snapshot = await readWorkspaceSnapshot(customerId);
  const latestRun = snapshot.runHistory[0];
  const signoff = snapshot.signoff;
  const existingArtifacts = snapshot.artifacts.filter((artifact) => artifact.exists).map((artifact) => artifact.name);
  const missingArtifacts = snapshot.artifacts.filter((artifact) => !artifact.exists).map((artifact) => artifact.name);
  const latestPreview = snapshot.artifactContents.find((artifact) => artifact.name === "frontend_plan_preview.json");
  const summary = snapshot.summary || "summary unavailable";

  return [
    `# Operator Handoff`,
    ``,
    `- customerId: ${snapshot.customerId}`,
    `- workspacePath: ${snapshot.workspacePath}`,
    `- summary: ${summary}`,
    latestRun ? `- latestRun: ${latestRun.mode} / ${latestRun.status} / ${latestRun.startedAt}` : `- latestRun: none`,
    `- signoff: ${signoff.status}${signoff.signedOffAt ? ` / ${signoff.signedOffAt}` : ""}`,
    ``,
    `## Existing Artifacts`,
    ...existingArtifacts.map((artifact) => `- ${artifact}`),
    ``,
    `## Missing Artifacts`,
    ...(missingArtifacts.length ? missingArtifacts.map((artifact) => `- ${artifact}`) : ["- none"]),
    ``,
    `## Code Directories`,
    ...(snapshot.codeDirectories.length ? snapshot.codeDirectories.map((directory) => `- ${directory}`) : ["- none"]),
    ``,
    `## Scene Files`,
    ...(snapshot.sceneFiles.length ? snapshot.sceneFiles.map((scene) => `- ${scene}`) : ["- none"]),
    ``,
    `## Plan Preview`,
    ...(latestPreview?.preview.length ? ["```json", ...latestPreview.preview, "```"] : ["not available"]),
    ``,
    `## Suggested Next Actions`,
    ...(snapshot.hasGamePlan
      ? ["- review generated scene files and release checklist", "- trigger run-game again if assets or ops changed"]
      : ["- generate or review game_plan.json", "- trigger plan-game before handoff to coding"]),
  ].join("\n");
}

export async function buildDeliveryBundleManifest(customerId: string) {
  const snapshot = await readWorkspaceSnapshot(customerId);
  return snapshot.deliveryBundle;
}
