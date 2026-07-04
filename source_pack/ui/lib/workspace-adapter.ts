import path from "path";

export type WorkspaceAdapterMode = "artifact-only" | "bundled-cli";

export interface WorkspaceAdapterConfig {
  mode: WorkspaceAdapterMode;
  label: string;
  workspaceRoot: string;
  runtimeRoot?: string;
  pythonPathEntries: string[];
  notes: string[];
}

export const SOURCE_PACK_CORE_ARTIFACTS = [
  "frontend_intake_receipt.json",
  "frontend_plan_preview.json",
  "game_qualification.json",
  "game_requirements.json",
  "game_transcript.txt",
  "game_design.md",
  "game_plan.json",
  "scene_map.json",
  "asset_manifest.json",
  "release_checklist.json",
  "website_run_status.json",
  "website_run_history.json",
  "website_signoff.json",
  "website_run.log",
] as const;

function normalizeMode(value: string | undefined): WorkspaceAdapterMode {
  if (value === "bundled-cli" || value === "artifact-only") {
    return value;
  }
  return "artifact-only";
}

export function resolveWorkspaceAdapterConfig(): WorkspaceAdapterConfig {
  const workspaceRoot = path.resolve(
    process.cwd(),
    process.env.GAME_STUDIO_WORKSPACE_ROOT?.trim() || "../workspaces"
  );
  const runtimeMode = normalizeMode(process.env.GAME_STUDIO_RUNTIME_MODE?.trim());
  const configuredRuntimeRoot = process.env.GAME_STUDIO_RUNTIME_ROOT?.trim();

  if (runtimeMode === "bundled-cli") {
    const runtimeRoot = path.resolve(
      process.cwd(),
      configuredRuntimeRoot || "../runtime/python"
    );
    return {
      mode: "bundled-cli",
      label: "Bundled CLI Adapter",
      workspaceRoot,
      runtimeRoot,
      pythonPathEntries: [runtimeRoot],
      notes: [
        "Uses the bundled source-pack runtime as the primary CLI adapter root.",
        "Recommended delivery mode for buyers who want one packaged workflow bundle.",
      ],
    };
  }

  return {
    mode: "artifact-only",
    label: "Artifact-Only Adapter",
    workspaceRoot,
    pythonPathEntries: [],
    notes: [
      "Default source-pack mode: generate intake, handoff, and delivery artifacts locally.",
      "CLI execution is intentionally disabled until the buyer enables the bundled runtime adapter.",
    ],
  };
}

export function workspacePathForCustomer(customerId: string, config = resolveWorkspaceAdapterConfig()) {
  return path.join(config.workspaceRoot, customerId);
}

export function buildWorkspaceArtifactPath(
  customerId: string,
  artifactName: string,
  config = resolveWorkspaceAdapterConfig()
) {
  return path.join(workspacePathForCustomer(customerId, config), artifactName);
}

export function buildRuntimeCommand(
  customerId: string,
  mode: "plan-game" | "run-game",
  config = resolveWorkspaceAdapterConfig()
) {
  if (config.mode === "artifact-only") {
    return `runtime adapter disabled: configure GAME_STUDIO_RUNTIME_MODE=bundled-cli before running ${mode} ${customerId}`;
  }

  const prefix = config.pythonPathEntries.length
    ? `PYTHONPATH=${config.pythonPathEntries.join(path.delimiter)} `
    : "";
  return `${prefix}python3 -m smbagent.cli ${mode} ${customerId}`;
}
