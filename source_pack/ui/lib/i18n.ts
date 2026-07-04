export const SUPPORTED_LOCALES = ["en", "ja"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string | undefined | null): value is SupportedLocale {
  return value === "en" || value === "ja";
}

export function resolveServerLocale(): SupportedLocale {
  const configured = process.env.GAME_STUDIO_UI_LOCALE?.trim();
  return isSupportedLocale(configured) ? configured : "ja";
}

const operatorMessages = {
  en: {
    readiness: {
      receiptRequirementsDetail: "Confirm intake receipt and game_requirements.json are present.",
      planningArtifactsDetail: "Review game plan, scene map, and release checklist coverage.",
      sceneOutputDetail: "Check generated scene files for the playable package.",
      latestRunDetail: "Review the latest plan-game / run-game result.",
      summaryReady:
        "Core artifacts and the latest run are in place. The workspace is ready for source-pack handoff.",
      summaryWarning:
        "Some items are present, but pre-delivery checks or the latest run still need review.",
      summaryBlocked: "Required pre-delivery artifacts or run results are still missing.",
    },
    nextActions: {
      signedOffShare: "Keep signed-off status and share the handoff markdown / bundle.",
      signedOffAttach: "Attach raw artifact files if the buyer needs them.",
      passedShare: "Share the source-pack handoff markdown.",
      passedReview: "Review scene files and the release checklist.",
      passedSignoff: "Record customer signoff.",
      runAgain: "Complete the latest run.",
      fillArtifacts: "Fill missing artifacts, then review the bundle again.",
    },
    overview: {
      noRunsYet: "no runs yet",
      primaryReady: "Confirm operator signoff and export the handoff package.",
      primaryWarning: "Review missing checks and run plan-game / run-game again.",
      primaryBlocked: "Resolve required artifacts or a failed run before handoff.",
    },
    errors: {
      intakeFailed: "Failed to generate intake receipt.",
      snapshotFailed: "Failed to load workspace snapshot.",
      copyFailed: "Copy failed.",
      receiptRequired: "Generate an intake receipt first.",
      workspaceRequired: "Create a workspace first.",
      runFailed: "Failed to start workspace run.",
      signoffFailed: "Failed to update signoff.",
    },
    localeLabel: "Language",
    localeEn: "English",
    localeJa: "日本語",
  },
  ja: {
    readiness: {
      receiptRequirementsDetail: "intake receipt と game_requirements.json が揃っているか確認します。",
      planningArtifactsDetail: "game plan / scene map / release checklist の揃い具合を確認します。",
      sceneOutputDetail: "playable package 用 scene files の生成状況を確認します。",
      latestRunDetail: "直近の plan-game / run-game 実行結果を確認します。",
      summaryReady:
        "主要 artifact と最新 run が揃っており、source pack handoff 可能な状態です。",
      summaryWarning:
        "一部は揃っていますが、納品前チェックまたは最新 run の確認が必要です。",
      summaryBlocked: "まだ納品前の必須 artifact または run 結果が不足しています。",
    },
    nextActions: {
      signedOffShare: "signed off 状態を維持しつつ handoff markdown / bundle を共有",
      signedOffAttach: "必要なら artifact raw files を添付",
      passedShare: "source pack handoff markdown を共有",
      passedReview: "scene files と release checklist を最終確認",
      passedSignoff: "customer signoff を記録",
      runAgain: "最新 run を完了させる",
      fillArtifacts: "不足 artifact を埋めてから再度 bundle を確認",
    },
    overview: {
      noRunsYet: "run なし",
      primaryReady: "operator signoff を確認して handoff を出力",
      primaryWarning: "不足チェックを確認して再度 run / review",
      primaryBlocked: "必須 artifact または failed run を解消",
    },
    errors: {
      intakeFailed: "受付データの生成に失敗しました。",
      snapshotFailed: "workspace snapshot の取得に失敗しました。",
      copyFailed: "コピーに失敗しました。",
      receiptRequired: "先に intake receipt を生成してください。",
      workspaceRequired: "先に workspace を生成してください。",
      runFailed: "workspace run の起動に失敗しました。",
      signoffFailed: "signoff の更新に失敗しました。",
    },
    localeLabel: "表示言語",
    localeEn: "English",
    localeJa: "日本語",
  },
} as const;

export function operatorText(locale: SupportedLocale) {
  return operatorMessages[locale];
}
