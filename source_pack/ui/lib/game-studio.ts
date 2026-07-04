export type Goal = "lead" | "coupon" | "fan" | "event" | "education";
export type Template = "quiz" | "omikuji" | "tap" | "puzzle" | "story";
export type AssetLevel = "ready" | "partial" | "idea";
export type GamePackageName = "lite" | "campaign" | "studio";

export const goalValues = ["lead", "coupon", "fan", "event", "education"] as const;
export const templateValues = ["quiz", "omikuji", "tap", "puzzle", "story"] as const;
export const assetLevelValues = ["ready", "partial", "idea"] as const;

export interface GameIntakeInput {
  projectName: string;
  goal: Goal;
  template: Template;
  assetLevel: AssetLevel;
  brief: string;
}

export interface PackageRecommendation {
  name: GamePackageName;
  badge: string;
  note: string;
  scenes: number;
}

export interface GameIntakeReceipt {
  customerId: string;
  projectName: string;
  summary: string;
  recommendedPackage: PackageRecommendation;
  sceneMap: string[];
  assetChecklist: string[];
  opsChecklist: string[];
  generatedBrief: string;
  nextCommands: string[];
  operatorNotes: string[];
}

export interface WorkspaceSyncReceipt {
  workspacePath: string;
  artifacts: string[];
  adapterMode: string;
  adapterLabel: string;
  runtimeRoot?: string;
}

export interface WorkspaceArtifactStatus {
  name: string;
  exists: boolean;
}

export interface WorkspaceArtifactContent {
  name: string;
  kind: "json" | "markdown" | "text" | "log";
  exists: boolean;
  preview: string[];
  raw?: string;
  json?: unknown;
}

export interface WorkspaceRunHistoryEntry extends WorkspaceRunStatus {
  runId: string;
}

export interface ReleaseReadinessCheck {
  label: string;
  status: "ready" | "warning" | "blocked";
  detail: string;
}

export interface ReleaseReadinessReport {
  score: number;
  status: "ready" | "warning" | "blocked";
  checks: ReleaseReadinessCheck[];
  summary: string;
}

export interface DeliveryBundleManifest {
  customerId: string;
  generatedAt: string;
  includedArtifacts: string[];
  missingArtifacts: string[];
  codeDirectories: string[];
  sceneFiles: string[];
  latestRun?: {
    mode: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
  };
  recommendedNextActions: string[];
}

export interface WorkspaceOverview {
  existingArtifactCount: number;
  missingArtifactCount: number;
  sceneFileCount: number;
  latestRunLabel: string;
  primaryAction: string;
}

export interface WorkspaceSignoff {
  status: "pending" | "signed_off" | "revoked";
  signedOffAt?: string;
  signedOffBy?: string;
  note?: string;
  readinessScore?: number;
}

export interface WorkspaceSnapshot {
  customerId: string;
  workspacePath: string;
  artifacts: WorkspaceArtifactStatus[];
  artifactContents: WorkspaceArtifactContent[];
  codeDirectories: string[];
  sceneFiles: string[];
  runHistory: WorkspaceRunHistoryEntry[];
  overview: WorkspaceOverview;
  signoff: WorkspaceSignoff;
  readiness: ReleaseReadinessReport;
  deliveryBundle: DeliveryBundleManifest;
  hasGamePlan: boolean;
  hasReceipt: boolean;
  summary: string;
}

export interface WorkspaceRunStatus {
  customerId: string;
  mode: "plan-game" | "run-game";
  status: "idle" | "running" | "passed" | "failed";
  command: string;
  logPath: string;
  startedAt: string;
  finishedAt?: string;
  pid?: number;
  error?: string;
}

export interface GamePlanPreview {
  customerId: string;
  packageName: GamePackageName;
  primaryTemplate: string;
  summary: string;
  scenes: Array<{
    name: string;
    purpose: string;
    keyUi: string[];
  }>;
  assets: Array<{
    name: string;
    kind: string;
    source: string;
  }>;
  sitePages: string[];
  opsFeatures: string[];
  analyticsEvents: string[];
  releaseChecks: string[];
}

export const goalLabels: Record<Goal, string> = {
  lead: "見込み客を集めたい",
  coupon: "クーポン配布をしたい",
  fan: "ファン施策をしたい",
  event: "イベント導線を作りたい",
  education: "学習・啓発体験にしたい",
};

export const templateLabels: Record<Template, string> = {
  quiz: "クイズ",
  omikuji: "おみくじ",
  tap: "タップゲーム",
  puzzle: "パズル",
  story: "分岐ストーリー",
};

export const assetLabels: Record<AssetLevel, string> = {
  ready: "ロゴ・KV・文言が揃っている",
  partial: "一部だけある",
  idea: "まだ企画段階",
};

function shortStableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 8);
}

export function slugifyProject(value: string) {
  const normalized = value.normalize("NFKC").trim();
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const fallback = slug || "jp-game";
  return `${fallback}-${shortStableHash(normalized || "project")}`.slice(0, 32);
}

export function packageFromInputs(goal: Goal, template: Template, assetLevel: AssetLevel): PackageRecommendation {
  let score = 0;
  if (goal === "fan" || goal === "event") score += 1;
  if (template === "puzzle" || template === "story") score += 2;
  if (template === "tap" || template === "omikuji") score += 1;
  if (assetLevel === "idea") score += 2;
  if (assetLevel === "partial") score += 1;

  if (score >= 4) {
    return {
      name: "studio",
      badge: "拡張制作向け",
      note: "画面数や演出の自由度が高い案件向けです。",
      scenes: 8,
    };
  }
  if (score >= 2) {
    return {
      name: "campaign",
      badge: "販促キャンペーン向け",
      note: "公開スピードと演出のバランスが良い標準プランです。",
      scenes: 5,
    };
  }
  return {
    name: "lite",
    badge: "最短公開向け",
    note: "短納期で試したい小規模ゲーム向けです。",
    scenes: 3,
  };
}

export function sceneMapForPackage(pkg: PackageRecommendation) {
  const base = ["title", "play", "result"];
  if (pkg.scenes >= 5) base.push("reward", "share");
  if (pkg.scenes >= 8) base.push("story-hub", "bonus", "ending");
  return base;
}

export function buildAssetChecklist(template: Template, assetLevel: AssetLevel) {
  const base = ["ロゴ", "KV画像", "結果画面コピー"];
  if (template === "story") base.push("キャラクター立ち絵", "分岐用バナー");
  if (template === "puzzle") base.push("タイル素材");
  if (template === "omikuji") base.push("おみくじ結果ラベル");
  if (assetLevel !== "ready") base.push("preview用 placeholder");
  return base;
}

export function buildOpsChecklist(goal: Goal, template: Template) {
  const items = ["公開前のスマホ確認", "景品・文言チェック"];
  if (goal === "coupon") items.push("クーポン導線確認");
  if (goal === "lead") items.push("フォーム導線確認");
  if (goal === "event") items.push("QR導線確認");
  if (template === "quiz" || template === "story") items.push("結果シェア文言確認");
  return items;
}

export function buildNextCommands(customerId: string, brief: string, pkg: GamePackageName) {
  return [
    `smbagent new ${customerId}`,
    `smbagent qualify-game ${customerId} --brief "${brief}"`,
    `smbagent negotiate-game ${customerId} --package ${pkg}`,
    `smbagent plan-game ${customerId}`,
    `smbagent run-game ${customerId} --package ${pkg}`,
  ];
}

export function buildGameIntakeReceipt(input: GameIntakeInput): GameIntakeReceipt {
  const recommendedPackage = packageFromInputs(input.goal, input.template, input.assetLevel);
  const customerId = slugifyProject(input.projectName);
  const sceneMap = sceneMapForPackage(recommendedPackage);
  const assetChecklist = buildAssetChecklist(input.template, input.assetLevel);
  const opsChecklist = buildOpsChecklist(input.goal, input.template);
  const generatedBrief = [
    `${goalLabels[input.goal]} を主目的にした ${templateLabels[input.template]} 型の日本向けブラウザゲーム。`,
    `${assetLabels[input.assetLevel]} 前提で、${recommendedPackage.name} package 相当の構成を想定。`,
    input.brief,
  ].join(" ");

  return {
    customerId,
    projectName: input.projectName,
    summary: `${templateLabels[input.template]} を軸にした ${recommendedPackage.badge} のソースパック納品案件です。`,
    recommendedPackage,
    sceneMap,
    assetChecklist,
    opsChecklist,
    generatedBrief,
    nextCommands: buildNextCommands(customerId, input.brief, recommendedPackage.name),
    operatorNotes: [
      "この receipt は source pack operator が案件要件を整理した結果です。",
      "次段では qualify-game / negotiate-game / plan-game に渡して、納品対象の requirements を固めます。",
      "素材不足がある場合は placeholder preview 前提で plan し、最終差し替え責任を handoff documents に明記してください。",
    ],
  };
}

export function toSmbagentTemplate(template: Template) {
  if (template === "story") return "visual-novel";
  return template;
}

export function buildCoreMechanics(template: Template) {
  switch (template) {
    case "quiz":
      return ["3問クイズ", "結果表示", "シェア導線"];
    case "omikuji":
      return ["おみくじ抽選", "結果表示", "クーポン導線"];
    case "tap":
      return ["タップスコア", "タイム制", "結果表示"];
    case "puzzle":
      return ["ピース配置", "クリア判定", "結果表示"];
    case "story":
      return ["分岐選択", "ストーリー進行", "エンディング表示"];
  }
}

export function buildRewardFlow(goal: Goal) {
  switch (goal) {
    case "coupon":
      return ["結果後にクーポン表示", "利用条件の案内"];
    case "lead":
      return ["結果後にフォーム誘導", "送信完了メッセージ"];
    case "event":
      return ["結果後にイベント導線表示", "QR案内"];
    case "fan":
      return ["結果後にシェア導線表示", "SNS投稿導線"];
    case "education":
      return ["結果後に学習まとめ表示", "次の導線案内"];
  }
}

export function buildAcceptanceCriteria(goal: Goal) {
  const base = ["スマホで快適に遊べる", "日本語UIが自然で崩れない"];
  if (goal === "coupon") base.push("結果画面からクーポン導線に進める");
  if (goal === "lead") base.push("結果画面からリード取得導線に進める");
  if (goal === "event") base.push("イベント導線またはQR導線が明確");
  if (goal === "fan") base.push("結果シェア文言が成立している");
  if (goal === "education") base.push("遊んだ後に学習要点が伝わる");
  return base;
}

function assetSourceLabel(assetLevel: AssetLevel) {
  if (assetLevel === "ready") return "customer-uploaded";
  if (assetLevel === "partial") return "mixed";
  return "placeholder-preview";
}

function scenePurpose(scene: string, goal: Goal) {
  switch (scene) {
    case "title":
      return "企画の導入とゲーム開始導線";
    case "play":
      return "メインのゲーム体験";
    case "result":
      return "結果表示と次アクション導線";
    case "reward":
      return goal === "coupon" ? "クーポン表示" : "特典導線";
    case "share":
      return "SNS共有または紹介導線";
    case "story-hub":
      return "分岐ストーリーの起点";
    case "bonus":
      return "追加体験や隠し導線";
    case "ending":
      return "完了演出と締め";
    default:
      return "補助シーン";
  }
}

function sceneKeyUi(scene: string, template: Template) {
  switch (scene) {
    case "title":
      return ["hero visual", "start button", "campaign copy"];
    case "play":
      if (template === "quiz") return ["question text", "answer buttons", "progress"];
      if (template === "omikuji") return ["draw button", "fortune card", "effect"];
      if (template === "tap") return ["score", "timer", "tap target"];
      if (template === "puzzle") return ["pieces", "board", "clear state"];
      return ["choice buttons", "story text", "branch indicator"];
    case "result":
      return ["score or outcome", "result copy", "primary CTA"];
    case "reward":
      return ["coupon block", "usage note", "claim CTA"];
    case "share":
      return ["share copy", "social buttons", "campaign hashtag"];
    case "story-hub":
      return ["chapter card", "route selector", "progress marker"];
    case "bonus":
      return ["bonus CTA", "unlock copy", "secondary reward"];
    case "ending":
      return ["ending visual", "completion copy", "replay CTA"];
    default:
      return ["content block"];
  }
}

export function buildPlanPreview(
  input: GameIntakeInput,
  receipt: GameIntakeReceipt
): GamePlanPreview {
  const source = assetSourceLabel(input.assetLevel);
  const scenes = receipt.sceneMap.map((scene) => ({
    name: scene,
    purpose: scenePurpose(scene, input.goal),
    keyUi: sceneKeyUi(scene, input.template),
  }));

  const assets = buildAssetChecklist(input.template, input.assetLevel).map((asset) => ({
    name: asset,
    kind: asset.includes("ロゴ")
      ? "logo"
      : asset.includes("KV")
        ? "key-visual"
        : asset.includes("コピー")
          ? "copy"
          : asset.includes("placeholder")
            ? "placeholder"
            : "supporting-asset",
    source,
  }));

  const opsFeatures = buildOpsChecklist(input.goal, input.template);
  const analyticsEvents = ["page_view", "game_start", "game_complete", "reward_view"];
  if (input.goal === "lead") analyticsEvents.push("lead_submit");
  if (input.goal === "coupon") analyticsEvents.push("coupon_open");
  if (input.goal === "fan") analyticsEvents.push("share_open");

  return {
    customerId: receipt.customerId,
    packageName: receipt.recommendedPackage.name,
    primaryTemplate: toSmbagentTemplate(input.template),
    summary: `${receipt.summary} scenes=${receipt.sceneMap.length}, assets=${assets.length}, ops=${opsFeatures.length}`,
    scenes,
    assets,
    sitePages: ["/", "/result"],
    opsFeatures,
    analyticsEvents,
    releaseChecks: buildAcceptanceCriteria(input.goal),
  };
}
