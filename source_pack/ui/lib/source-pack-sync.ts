import { mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  buildAcceptanceCriteria,
  buildAssetChecklist,
  buildCoreMechanics,
  buildPlanPreview,
  buildRewardFlow,
  sceneMapForPackage,
  toSmbagentTemplate,
  type GameIntakeInput,
  type GameIntakeReceipt,
  type WorkspaceSyncReceipt,
} from "@/lib/game-studio";
import { resolveWorkspaceAdapterConfig, workspacePathForCustomer } from "@/lib/workspace-adapter";

function buildGameQualificationPayload(input: GameIntakeInput, receipt: GameIntakeReceipt) {
  return {
    customer_id: receipt.customerId,
    go: true,
    recommended_package: receipt.recommendedPackage.name,
    recommended_templates: [toSmbagentTemplate(input.template)],
    summary_ja: receipt.summary,
    reasoning_en: `Derived from source pack intake for ${receipt.projectName}.`,
  };
}

function buildGameRequirementsPayload(input: GameIntakeInput, receipt: GameIntakeReceipt) {
  const availableAssets = input.assetLevel === "ready"
    ? buildAssetChecklist(input.template, input.assetLevel)
    : [];
  const missingAssets = input.assetLevel === "ready"
    ? []
    : buildAssetChecklist(input.template, input.assetLevel);

  return {
    customer_id: receipt.customerId,
    package: receipt.recommendedPackage.name,
    project_name: input.projectName,
    business_goal: input.brief,
    summary_ja: receipt.generatedBrief,
    target_audience: [input.goal === "education" ? "学習参加者" : "スマホユーザー"],
    preferred_templates: [toSmbagentTemplate(input.template)],
    core_mechanics: buildCoreMechanics(input.template),
    required_scenes: sceneMapForPackage(receipt.recommendedPackage),
    reward_flow: buildRewardFlow(input.goal),
    brand_notes: [
      `${receipt.recommendedPackage.badge} 想定`,
      `${input.assetLevel} の素材状況`,
    ],
    available_assets: availableAssets,
    missing_assets: missingAssets,
    analytics_events: ["page_view", "game_start", "game_complete", "reward_view"],
    integrations: ["Google Analytics"],
    acceptance_criteria: buildAcceptanceCriteria(input.goal),
  };
}

export async function persistGameIntakeToWorkspaceAdapter(
  input: GameIntakeInput,
  receipt: GameIntakeReceipt
): Promise<WorkspaceSyncReceipt> {
  const adapter = resolveWorkspaceAdapterConfig();
  const workspacePath = workspacePathForCustomer(receipt.customerId, adapter);
  const codePath = path.join(workspacePath, "code");
  const runsPath = path.join(workspacePath, "runs");

  await mkdir(codePath, { recursive: true });
  await mkdir(runsPath, { recursive: true });

  const planPreview = buildPlanPreview(input, receipt);

  const artifacts: Array<{ name: string; content: string }> = [
    {
      name: "frontend_intake_receipt.json",
      content: JSON.stringify(receipt, null, 2),
    },
    {
      name: "frontend_plan_preview.json",
      content: JSON.stringify(planPreview, null, 2),
    },
    {
      name: "game_qualification.json",
      content: JSON.stringify(buildGameQualificationPayload(input, receipt), null, 2),
    },
    {
      name: "game_requirements.json",
      content: JSON.stringify(buildGameRequirementsPayload(input, receipt), null, 2),
    },
    {
      name: "game_transcript.txt",
      content: [
        "FRONTEND INTAKE",
        "",
        `project_name: ${input.projectName}`,
        `goal: ${input.goal}`,
        `template: ${input.template}`,
        `asset_level: ${input.assetLevel}`,
        "",
        "brief:",
        input.brief,
      ].join("\n"),
    },
  ];

  for (const artifact of artifacts) {
    await writeFile(path.join(workspacePath, artifact.name), artifact.content, "utf-8");
  }

  return {
    workspacePath,
    artifacts: artifacts.map((artifact) => artifact.name),
    adapterMode: adapter.mode,
    adapterLabel: adapter.label,
    runtimeRoot: adapter.runtimeRoot,
  };
}
