"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  assetLabels,
  buildNextCommands,
  goalLabels,
  packageFromInputs,
  sceneMapForPackage,
  slugifyProject,
  templateLabels,
  type AssetLevel,
  type GameIntakeInput,
  type GameIntakeReceipt,
  type GamePlanPreview,
  type Goal,
  type Template,
  type WorkspaceRunStatus,
  type WorkspaceSnapshot,
  type WorkspaceSyncReceipt,
} from "@/lib/game-studio";
import {
  isSupportedLocale,
  operatorText,
  type SupportedLocale,
} from "@/lib/i18n";

function readStoredLocale(): SupportedLocale {
  if (typeof window === "undefined") return "ja";
  const stored = window.localStorage.getItem("game-studio-locale");
  return isSupportedLocale(stored) ? stored : "ja";
}

export default function GameStudioWizard() {
  const [locale, setLocale] = useState<SupportedLocale>("ja");
  const ui = useMemo(() => operatorText(locale), [locale]);
  const [projectName, setProjectName] = useState("夏の来店キャンペーン");
  const [goal, setGoal] = useState<Goal>("coupon");
  const [template, setTemplate] = useState<Template>("quiz");
  const [assetLevel, setAssetLevel] = useState<AssetLevel>("partial");
  const [brief, setBrief] = useState(
    "来店前に気軽に遊べて、結果画面からクーポン取得につながるスマホ向けミニゲームにしたい。"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<GameIntakeReceipt | null>(null);
  const [planPreview, setPlanPreview] = useState<GamePlanPreview | null>(null);
  const [workspaceSync, setWorkspaceSync] = useState<WorkspaceSyncReceipt | null>(null);
  const [runStatus, setRunStatus] = useState<WorkspaceRunStatus | null>(null);
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [selectedArtifactName, setSelectedArtifactName] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    const stored = readStoredLocale();
    setLocale(stored);
    document.documentElement.lang = stored;
  }, []);

  useEffect(() => {
    if (runStatus?.status !== "running") return;

    const customerId = receipt?.customerId ?? workspaceSnapshot?.customerId;
    if (!customerId) return;

    const timer = window.setInterval(() => {
      void refreshWorkspaceSnapshot(customerId);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [runStatus?.status, receipt?.customerId, workspaceSnapshot?.customerId]);

  function switchLocale(nextLocale: SupportedLocale) {
    setLocale(nextLocale);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("game-studio-locale", nextLocale);
      document.documentElement.lang = nextLocale;
    }
  }
  const [signoffBy, setSignoffBy] = useState("customer-operator");
  const [signoffNote, setSignoffNote] = useState("");

  const deferredName = useDeferredValue(projectName);
  const recommended = useMemo(
    () => packageFromInputs(goal, template, assetLevel),
    [goal, template, assetLevel]
  );
  const customerId = useMemo(() => slugifyProject(deferredName), [deferredName]);
  const scenes = useMemo(() => sceneMapForPackage(recommended), [recommended]);

  const cliPreview = buildNextCommands(customerId, brief, recommended.name).join("\n");

  async function handleGenerate() {
    setLoading(true);
    setError("");

    const payload: GameIntakeInput = {
      projectName,
      goal,
      template,
      assetLevel,
      brief,
    };

    try {
      const response = await fetch("/api/game-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to generate receipt");
      }

      setReceipt(data.receipt);
      setPlanPreview(data.planPreview ?? null);
      setWorkspaceSync(data.workspaceSync ?? null);
      if (data.receipt?.customerId) {
        await refreshWorkspaceSnapshot(data.receipt.customerId);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : ui.errors.intakeFailed
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshWorkspaceSnapshot(nextCustomerId: string) {
    try {
      const response = await fetch(`/api/game-intake?customerId=${encodeURIComponent(nextCustomerId)}`);
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to read workspace snapshot");
      }
      setWorkspaceSnapshot(data.snapshot);
      setRunStatus(data.runStatus ?? null);
      const artifactNames = (data.snapshot?.artifactContents ?? [])
        .filter((artifact: WorkspaceSnapshot["artifactContents"][number]) => artifact.exists)
        .map((artifact: WorkspaceSnapshot["artifactContents"][number]) => artifact.name);
      setSelectedArtifactName((current) => current || artifactNames[0] || "");
    } catch (snapshotError) {
      setError(
        snapshotError instanceof Error ? snapshotError.message : ui.errors.snapshotFailed
      );
    }
  }

  async function copyText(value: string, successLabel: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(successLabel);
      window.setTimeout(() => setCopyMessage(""), 1800);
    } catch {
      setError(ui.errors.copyFailed);
    }
  }

  function buildArtifactUrl(name: string, download = false) {
    const nextCustomerId = receipt?.customerId ?? workspaceSnapshot?.customerId;
    if (!nextCustomerId) return "#";
    const params = new URLSearchParams({ customerId: nextCustomerId, artifact: name });
    if (download) params.set("download", "1");
    return `/api/game-intake?${params.toString()}`;
  }

  function buildHandoffUrl(download = false) {
    const nextCustomerId = receipt?.customerId ?? workspaceSnapshot?.customerId;
    if (!nextCustomerId) return "#";
    const params = new URLSearchParams({ customerId: nextCustomerId, export: "operator-handoff" });
    if (download) params.set("download", "1");
    return `/api/game-intake?${params.toString()}`;
  }

  function buildDeliveryBundleUrl(download = false) {
    const nextCustomerId = receipt?.customerId ?? workspaceSnapshot?.customerId;
    if (!nextCustomerId) return "#";
    const params = new URLSearchParams({ customerId: nextCustomerId, export: "delivery-bundle" });
    if (download) params.set("download", "1");
    return `/api/game-intake?${params.toString()}`;
  }

  const selectedArtifact = useMemo(() => {
    if (!workspaceSnapshot) return null;
    return (
      workspaceSnapshot.artifactContents.find((artifact) => artifact.name === selectedArtifactName) ??
      workspaceSnapshot.artifactContents.find((artifact) => artifact.exists) ??
      null
    );
  }, [selectedArtifactName, workspaceSnapshot]);

  async function triggerWorkspaceRun(mode: "plan-game" | "run-game") {
    const nextCustomerId = receipt?.customerId ?? workspaceSnapshot?.customerId;
    if (!nextCustomerId) {
      setError(ui.errors.receiptRequired);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/game-intake", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: nextCustomerId, mode }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to trigger workspace run");
      }
      setRunStatus(data.runStatus ?? null);
      await refreshWorkspaceSnapshot(nextCustomerId);
    } catch (triggerError) {
      setError(triggerError instanceof Error ? triggerError.message : ui.errors.runFailed);
    } finally {
      setLoading(false);
    }
  }

  async function updateSignoff(action: "signoff" | "revoke-signoff") {
    const nextCustomerId = receipt?.customerId ?? workspaceSnapshot?.customerId;
    if (!nextCustomerId) {
      setError(ui.errors.workspaceRequired);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/game-intake", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: nextCustomerId,
          action,
          signedOffBy: signoffBy,
          note: signoffNote,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to update signoff");
      }
      await refreshWorkspaceSnapshot(nextCustomerId);
    } catch (signoffError) {
      setError(signoffError instanceof Error ? signoffError.message : ui.errors.signoffFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="animate-fade-up rounded-[32px] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[0_30px_90px_rgba(66,43,16,0.09)] backdrop-blur md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(36,92,74,0.18)] bg-white/80 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-[var(--moss)] uppercase">
              <span className="pulse-ring inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
              Japan Game Source Pack
            </p>
            <h1 className="text-4xl font-black leading-[1.05] tracking-[-0.04em] md:text-6xl">
              AIゲーム工房
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--muted)] md:text-base">
              日本の代理店、制作会社、企業内デジタルチーム向けに、ゲーム企画、納品範囲、素材要件、
              handoff artifacts を一つの operator console で整理するための reference UI です。
              まず案件の輪郭を固め、次の自動生成と source pack handoff に渡します。
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="rounded-[24px] border border-[var(--line)] bg-white/85 px-3 py-2 text-xs">
              <div className="font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
                {ui.localeLabel}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => switchLocale("en")}
                  className={`rounded-full px-3 py-1 font-semibold ${
                    locale === "en"
                      ? "bg-[var(--moss)] text-white"
                      : "bg-[#f8f5ef] text-[var(--ink)]"
                  }`}
                >
                  {ui.localeEn}
                </button>
                <button
                  type="button"
                  onClick={() => switchLocale("ja")}
                  className={`rounded-full px-3 py-1 font-semibold ${
                    locale === "ja"
                      ? "bg-[var(--moss)] text-white"
                      : "bg-[#f8f5ef] text-[var(--ink)]"
                  }`}
                >
                  {ui.localeJa}
                </button>
              </div>
            </div>
            <div className="rounded-[28px] border border-[rgba(183,138,45,0.24)] bg-[linear-gradient(180deg,_rgba(255,255,255,0.82),_rgba(246,233,203,0.8))] px-4 py-4 text-sm shadow-[0_18px_40px_rgba(183,138,45,0.12)]">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-[var(--gold)] uppercase">
              Recommended
            </div>
            <div className="mt-2 text-2xl font-black">{recommended.name}</div>
            <div className="mt-1 text-[13px] text-[var(--muted)]">{recommended.badge}</div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <label className="rounded-[24px] border border-[var(--line)] bg-white/85 p-4">
            <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
              Project Name
            </div>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="mt-3 w-full border-0 bg-transparent p-0 text-xl font-bold outline-none"
              placeholder="例: 夏の来店キャンペーン"
            />
          </label>

          <div className="rounded-[24px] border border-[var(--line)] bg-[linear-gradient(180deg,_rgba(255,255,255,0.88),_rgba(245,108,44,0.06))] p-4">
            <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
              Project ID Preview
            </div>
            <div className="mt-3 font-mono text-lg font-semibold text-[var(--accent-deep)]">
              {customerId}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              後続の `qualify-game` や `run-game`、および source pack handoff 一式にそのまま渡せる想定 ID です。
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5">
          <WizardBlock title="1. 目的を選ぶ" subtitle="何を納品し、どの導線まで含めるかは目的によって変わります。">
            <ChipRow<Goal> value={goal} onChange={setGoal} labels={goalLabels} />
          </WizardBlock>

          <WizardBlock title="2. テンプレートを決める" subtitle="再利用しやすいテンプレートから始めると source pack 化しやすくなります。">
            <ChipRow<Template> value={template} onChange={setTemplate} labels={templateLabels} />
          </WizardBlock>

          <WizardBlock title="3. 素材の準備度" subtitle="素材が少ない案件ほど preview placeholder と引き継ぎメモが重要になります。">
            <ChipRow<AssetLevel> value={assetLevel} onChange={setAssetLevel} labels={assetLabels} />
          </WizardBlock>

          <WizardBlock title="4. ゲーム概要" subtitle="後続の game negotiation、plan、handoff documents に渡す brief 草案です。">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={5}
              className="w-full rounded-[22px] border border-[var(--line)] bg-white px-4 py-4 text-sm leading-7 outline-none transition focus:border-[rgba(245,108,44,0.38)] focus:shadow-[0_0_0_4px_rgba(245,108,44,0.08)]"
            />
          </WizardBlock>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white shadow-[0_18px_36px_rgba(245,108,44,0.28)] transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? "案件ドラフトを生成中..." : "案件ドラフトを生成する"}
          </button>
          <p className="text-sm leading-6 text-[var(--muted)]">
            ここで作るのは source pack 用の intake draft です。実際の build と納品 bundle 整理はこの後の `run-game` に渡します。
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-[20px] border border-[rgba(197,62,47,0.22)] bg-[rgba(255,239,236,0.88)] px-4 py-3 text-sm text-[#9a2b1b]">
            {error}
          </div>
        )}
        {copyMessage && (
          <div className="mt-4 rounded-[20px] border border-[rgba(36,92,74,0.18)] bg-[rgba(235,247,242,0.92)] px-4 py-3 text-sm text-[var(--moss)]">
            {copyMessage}
          </div>
        )}
      </div>

      <div className="animate-fade-up space-y-6 [animation-delay:120ms]">
        <section className="rounded-[32px] border border-[var(--line)] bg-[#18221e] p-6 text-white shadow-[0_26px_70px_rgba(24,34,30,0.24)] md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-[rgba(255,255,255,0.58)] uppercase">
                Package Preview
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
                {recommended.name}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-[rgba(255,255,255,0.72)]">
                {recommended.note}
              </p>
            </div>
            <div className="rounded-[24px] bg-[rgba(245,108,44,0.14)] px-4 py-3 text-right">
              <div className="text-xs text-[rgba(255,255,255,0.62)]">想定シーン数</div>
              <div className="mt-1 text-3xl font-black">{recommended.scenes}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {scenes.map((scene, index) => (
              <div
                key={scene}
                className="flex items-center justify-between rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3"
              >
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.12em] text-[rgba(255,255,255,0.46)] uppercase">
                    Scene {index + 1}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{scene}</div>
                </div>
                <span className="rounded-full bg-[rgba(255,255,255,0.08)] px-3 py-1 text-xs text-[rgba(255,255,255,0.72)]">
                  {templateLabels[template]}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-[var(--line)] bg-white/90 p-6 shadow-[0_22px_60px_rgba(39,29,15,0.08)] md:p-7">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
            CLI Workflow
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">次の自動生成フロー</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
            現在の UI は reference console ですが、裏ではすでに `qualify-game / plan-game / run-game`
            の chain が存在します。ここで作った入力は、そのまま source pack 制作 CLI に渡せます。
          </p>
          <pre className="mt-5 overflow-x-auto rounded-[24px] bg-[#111714] p-5 text-[13px] leading-7 text-[#ecf3ee] shadow-inner">
            <code>{cliPreview}</code>
          </pre>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => copyText(cliPreview, "CLI handoff をコピーしました。")}
              className="rounded-full border border-[rgba(30,34,32,0.08)] bg-[#f8f5ef] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-white"
            >
              CLI をコピー
            </button>
          </div>
        </section>

        <section className="rounded-[32px] border border-[rgba(36,92,74,0.18)] bg-[linear-gradient(180deg,_rgba(36,92,74,0.08),_rgba(255,255,255,0.82))] p-6 md:p-7">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--moss)] uppercase">
            Deliverables
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DeliverableCard title="game/" body="scene manifest と playable package の核" />
            <DeliverableCard title="site/" body="キャンペーンページ、結果導線、入口" />
            <DeliverableCard title="assets/" body="ロゴ、KV、placeholder 素材管理" />
            <DeliverableCard title="ops/" body="クーポン、応募、運用メモ" />
          </div>
        </section>

        {receipt && (
          <section className="rounded-[32px] border border-[rgba(245,108,44,0.24)] bg-[linear-gradient(180deg,_rgba(255,255,255,0.95),_rgba(255,244,236,0.9))] p-6 shadow-[0_24px_70px_rgba(245,108,44,0.12)] md:p-7">
            <p className="text-xs font-semibold tracking-[0.14em] text-[var(--accent-deep)] uppercase">
              Step 9 Result View
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">案件ドラフトレシート</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
              operator console で作られた intake を、後続 pipeline と handoff package が扱いやすい形に並べ替えた結果です。
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ResultCard title="Customer ID" body={receipt.customerId} mono />
              <ResultCard title="Recommended Package" body={`${receipt.recommendedPackage.name} / ${receipt.recommendedPackage.badge}`} />
              <ResultCard title="Project Summary" body={receipt.summary} />
              <ResultCard title="Generated Brief" body={receipt.generatedBrief} />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <ResultList title="Scene Map" items={receipt.sceneMap} />
              <ResultList title="Asset Checklist" items={receipt.assetChecklist} />
              <ResultList title="Ops Checklist" items={receipt.opsChecklist} />
            </div>

            <div className="mt-5 rounded-[24px] bg-[#161c19] p-5 text-[#ecf3ee]">
              <div className="text-xs font-semibold tracking-[0.14em] text-[rgba(255,255,255,0.56)] uppercase">
                Source Pack Notes
              </div>
              <div className="mt-3 space-y-2 text-sm leading-7">
                {receipt.operatorNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-[24px] bg-[#111714] p-5 text-[#ecf3ee] shadow-inner">
              <div className="text-xs font-semibold tracking-[0.14em] text-[rgba(255,255,255,0.56)] uppercase">
                Receipt Commands
              </div>
              <pre className="mt-3 overflow-x-auto text-[13px] leading-7">
                <code>{receipt.nextCommands.join("\n")}</code>
              </pre>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => copyText(receipt.nextCommands.join("\n"), "Receipt commands をコピーしました。")}
                  className="rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[rgba(255,255,255,0.12)]"
                >
                  Commands をコピー
                </button>
              </div>
            </div>

            {planPreview && (
              <div className="mt-5 rounded-[24px] border border-[rgba(183,138,45,0.22)] bg-[linear-gradient(180deg,_rgba(255,252,245,0.96),_rgba(247,239,220,0.92))] p-5">
                <div className="text-xs font-semibold tracking-[0.14em] text-[var(--gold)] uppercase">
                  Step 12 Plan Preview
                </div>
                <h3 className="mt-3 text-xl font-black tracking-[-0.03em]">
                  `plan-game` に近い構造プレビュー
                </h3>
                <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                  これは intake draft から推定した planning layer の草稿です。後続の `plan-game`
                  でさらに詰める前の preview として扱い、最終的には source pack の納品範囲定義に使います。
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <ResultCard title="Primary Template" body={planPreview.primaryTemplate} mono />
                  <ResultCard title="Plan Summary" body={planPreview.summary} />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <StructuredSceneList scenes={planPreview.scenes} />
                  <StructuredAssetList assets={planPreview.assets} />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <ResultList title="Site Pages" items={planPreview.sitePages} />
                  <ResultList title="Ops Features" items={planPreview.opsFeatures} />
                  <ResultList title="Release Checks" items={planPreview.releaseChecks} />
                </div>

                <div className="mt-4 rounded-[20px] bg-white px-4 py-4">
                  <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
                    Analytics Events
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {planPreview.analyticsEvents.map((event) => (
                      <span
                        key={event}
                        className="rounded-full bg-[rgba(36,92,74,0.1)] px-3 py-2 text-xs font-semibold text-[var(--moss)]"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {workspaceSync && (
              <div className="mt-5 rounded-[24px] border border-[rgba(36,92,74,0.18)] bg-[rgba(36,92,74,0.08)] p-5">
                <div className="text-xs font-semibold tracking-[0.14em] text-[var(--moss)] uppercase">
                  Workspace Adapter Sync
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[var(--moss)] shadow-sm">
                    {workspaceSync.adapterLabel}
                  </span>
                  <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[var(--moss)] shadow-sm">
                    mode: {workspaceSync.adapterMode}
                  </span>
                </div>
                <p className="mt-3 break-all font-mono text-sm leading-7 text-[var(--ink)]">
                  {workspaceSync.workspacePath}
                </p>
                {workspaceSync.runtimeRoot && (
                  <p className="mt-2 break-all text-xs leading-6 text-[var(--muted)]">
                    runtime root: {workspaceSync.runtimeRoot}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {workspaceSync.artifacts.map((artifact) => (
                    <span
                      key={artifact}
                      className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[var(--moss)] shadow-sm"
                    >
                      {artifact}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {workspaceSnapshot && (
              <div className="mt-5 rounded-[24px] border border-[rgba(30,34,32,0.08)] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
                      Workspace Browser
                    </div>
                    <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                      {workspaceSnapshot.summary}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => refreshWorkspaceSnapshot(workspaceSnapshot.customerId)}
                    className="rounded-full border border-[var(--line)] bg-[#f8f5ef] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-white"
                  >
                    再読込
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <ResultCard title="Workspace Path" body={workspaceSnapshot.workspacePath} mono />
                  <ResultCard
                    title="Code Directories"
                    body={workspaceSnapshot.codeDirectories.length ? workspaceSnapshot.codeDirectories.join(", ") : "none yet"}
                  />
                </div>

                <div className="mt-4">
                  <WorkspaceOverviewPanel overview={workspaceSnapshot.overview} />
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => triggerWorkspaceRun("plan-game")}
                    disabled={loading}
                    className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-55"
                  >
                    plan-game を起動
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerWorkspaceRun("run-game")}
                    disabled={loading}
                    className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-55"
                  >
                    run-game を起動
                  </button>
                  <a
                    href={buildHandoffUrl(true)}
                    className="rounded-full border border-[var(--line)] bg-[#f8f5ef] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-white"
                  >
                    source-pack-handoff.md を出力
                  </a>
                </div>

                {runStatus && (
                  <div className="mt-4 rounded-[20px] bg-[#111714] px-4 py-4 text-[#ecf3ee]">
                    <div className="text-xs font-semibold tracking-[0.14em] text-[rgba(255,255,255,0.56)] uppercase">
                      Run Status
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <ResultCard title="Mode" body={runStatus.mode} mono />
                      <ResultCard title="Status" body={runStatus.status} mono />
                      <ResultCard title="Started At" body={runStatus.startedAt} mono />
                      <ResultCard title="Log Path" body={runStatus.logPath} mono />
                    </div>
                    <pre className="mt-4 overflow-x-auto rounded-[18px] bg-[rgba(255,255,255,0.04)] p-4 text-[12px] leading-6 text-[rgba(255,255,255,0.86)]">
                      <code>{runStatus.command}</code>
                    </pre>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => copyText(runStatus.command, "Run command をコピーしました。")}
                        className="rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[rgba(255,255,255,0.12)]"
                      >
                        command をコピー
                      </button>
                    </div>
                    {runStatus.error && (
                      <p className="mt-3 text-sm text-[#ffb7aa]">{runStatus.error}</p>
                    )}
                  </div>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <StatusList
                    title="Artifacts"
                    items={workspaceSnapshot.artifacts.map((artifact) => ({
                      label: artifact.name,
                      status: artifact.exists ? "present" : "missing",
                    }))}
                  />
                  <StatusList
                    title="Scene Files"
                    items={workspaceSnapshot.sceneFiles.length
                      ? workspaceSnapshot.sceneFiles.map((scene) => ({
                          label: scene,
                          status: "present",
                        }))
                      : [{ label: "scene files not generated yet", status: "pending" }]}
                  />
                </div>

                {workspaceSnapshot.runHistory.length > 0 && (
                  <div className="mt-4">
                    <RunHistoryList runHistory={workspaceSnapshot.runHistory} />
                  </div>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <ReleaseReadinessPanel readiness={workspaceSnapshot.readiness} />
                  <DeliveryBundlePanel
                    bundle={workspaceSnapshot.deliveryBundle}
                    downloadHref={buildDeliveryBundleUrl(true)}
                    onCopy={() =>
                      copyText(
                        JSON.stringify(workspaceSnapshot.deliveryBundle, null, 2),
                        "delivery bundle をコピーしました。"
                      )
                    }
                  />
                </div>

                <div className="mt-4">
                  <SignoffPanel
                    signoff={workspaceSnapshot.signoff}
                    signoffBy={signoffBy}
                    signoffNote={signoffNote}
                    onChangeSignoffBy={setSignoffBy}
                    onChangeSignoffNote={setSignoffNote}
                    onSignoff={() => updateSignoff("signoff")}
                    onRevoke={() => updateSignoff("revoke-signoff")}
                    loading={loading}
                  />
                </div>

                {selectedArtifact && (
                  <div className="mt-4">
                    <ArtifactDetailPanel
                      artifact={selectedArtifact}
                      onCopy={() =>
                        copyText(
                          selectedArtifact.raw ?? selectedArtifact.preview.join("\n"),
                          `${selectedArtifact.name} をコピーしました。`
                        )
                      }
                      downloadHref={buildArtifactUrl(selectedArtifact.name, true)}
                    />
                  </div>
                )}

                <div className="mt-4">
                  <ArtifactViewerList
                    artifactContents={workspaceSnapshot.artifactContents}
                    selectedArtifactName={selectedArtifact?.name ?? ""}
                    onSelectArtifact={setSelectedArtifactName}
                    onCopyArtifact={(artifact) =>
                      copyText(
                        artifact.raw ?? artifact.preview.join("\n"),
                        `${artifact.name} をコピーしました。`
                      )
                    }
                    buildDownloadHref={(artifactName) => buildArtifactUrl(artifactName, true)}
                  />
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}

function WizardBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[var(--line)] bg-[rgba(255,255,255,0.72)] p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-black tracking-[-0.03em]">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ChipRow<T extends string>({
  value,
  onChange,
  labels,
}: {
  value: T;
  onChange: (value: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {(Object.entries(labels) as Array<[T, string]>).map(([key, label]) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key as T)}
            className={`rounded-full px-4 py-3 text-sm font-semibold transition ${
              active
                ? "border border-[rgba(245,108,44,0.32)] bg-[var(--accent)] text-white shadow-[0_16px_32px_rgba(245,108,44,0.28)]"
                : "border border-[var(--line)] bg-white text-[var(--ink)] hover:border-[rgba(245,108,44,0.25)] hover:bg-[#fff4ec]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DeliverableCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-[22px] border border-[rgba(36,92,74,0.14)] bg-white/85 p-4">
      <div className="font-mono text-sm font-bold text-[var(--moss)]">{title}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </article>
  );
}

function ResultCard({
  title,
  body,
  mono = false,
}: {
  title: string;
  body: string;
  mono?: boolean;
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(30,34,32,0.08)] bg-white px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        {title}
      </div>
      <p className={`mt-2 text-sm leading-7 text-[var(--ink)] ${mono ? "font-mono" : ""}`}>
        {body}
      </p>
    </article>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="rounded-[22px] border border-[rgba(30,34,32,0.08)] bg-white px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-full bg-[rgba(245,108,44,0.08)] px-3 py-2 text-sm font-medium text-[var(--accent-deep)]"
          >
            {item}
          </div>
        ))}
      </div>
    </article>
  );
}

function StatusList({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; status: string }>;
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(30,34,32,0.08)] bg-[#fbfbf8] px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div
            key={`${title}-${item.label}`}
            className="flex items-center justify-between rounded-[18px] border border-[rgba(30,34,32,0.06)] bg-white px-3 py-3 text-sm"
          >
            <span className="break-all pr-3">{item.label}</span>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                item.status === "present"
                  ? "bg-[rgba(36,92,74,0.12)] text-[var(--moss)]"
                  : item.status === "missing"
                    ? "bg-[rgba(197,62,47,0.12)] text-[#a33b2b]"
                    : "bg-[rgba(183,138,45,0.12)] text-[var(--gold)]"
              }`}
            >
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function StructuredSceneList({
  scenes,
}: {
  scenes: GamePlanPreview["scenes"];
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(30,34,32,0.08)] bg-white px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        Planned Scenes
      </div>
      <div className="mt-3 space-y-3">
        {scenes.map((scene) => (
          <div
            key={scene.name}
            className="rounded-[18px] border border-[rgba(30,34,32,0.06)] bg-[#fbfbf8] px-3 py-3"
          >
            <div className="font-mono text-sm font-bold text-[var(--accent-deep)]">
              {scene.name}
            </div>
            <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{scene.purpose}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {scene.keyUi.map((ui) => (
                <span
                  key={`${scene.name}-${ui}`}
                  className="rounded-full bg-[rgba(245,108,44,0.08)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-deep)]"
                >
                  {ui}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function StructuredAssetList({
  assets,
}: {
  assets: GamePlanPreview["assets"];
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(30,34,32,0.08)] bg-white px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        Planned Assets
      </div>
      <div className="mt-3 space-y-3">
        {assets.map((asset) => (
          <div
            key={asset.name}
            className="flex items-start justify-between gap-3 rounded-[18px] border border-[rgba(30,34,32,0.06)] bg-[#fbfbf8] px-3 py-3"
          >
            <div>
              <div className="text-sm font-bold text-[var(--ink)]">{asset.name}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{asset.kind}</div>
            </div>
            <span className="rounded-full bg-[rgba(36,92,74,0.1)] px-3 py-1 text-[11px] font-semibold text-[var(--moss)]">
              {asset.source}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function ArtifactViewerList({
  artifactContents,
  selectedArtifactName,
  onSelectArtifact,
  onCopyArtifact,
  buildDownloadHref,
}: {
  artifactContents: WorkspaceSnapshot["artifactContents"];
  selectedArtifactName: string;
  onSelectArtifact: (name: string) => void;
  onCopyArtifact: (artifact: WorkspaceSnapshot["artifactContents"][number]) => void;
  buildDownloadHref: (artifactName: string) => string;
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(30,34,32,0.08)] bg-[#f8f6f0] px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        Step 17 Artifact Actions
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        artifact ごとに focus、copy、download を行えます。下の detail viewer と組み合わせて operator が確認しやすい形にしています。
      </p>
      <div className="mt-4 space-y-4">
        {artifactContents.map((artifact) => (
          <div
            key={artifact.name}
            className="rounded-[20px] border border-[rgba(30,34,32,0.06)] bg-white px-4 py-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-sm font-bold text-[var(--ink)]">{artifact.name}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                  {artifact.kind}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                    artifact.exists
                      ? "bg-[rgba(36,92,74,0.12)] text-[var(--moss)]"
                      : "bg-[rgba(183,138,45,0.12)] text-[var(--gold)]"
                  }`}
                >
                  {artifact.exists ? "loaded" : "not found"}
                </span>
                {selectedArtifactName === artifact.name && (
                  <span className="rounded-full bg-[rgba(245,108,44,0.12)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                    focused
                  </span>
                )}
              </div>
            </div>

            {artifact.exists ? (
              <>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectArtifact(artifact.name)}
                    className="rounded-full border border-[var(--line)] bg-[#f8f5ef] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-white"
                  >
                    詳細を見る
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyArtifact(artifact)}
                    className="rounded-full border border-[var(--line)] bg-[#f8f5ef] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-white"
                  >
                    コピー
                  </button>
                  <a
                    href={buildDownloadHref(artifact.name)}
                    className="rounded-full border border-[var(--line)] bg-[#f8f5ef] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-white"
                  >
                    ダウンロード
                  </a>
                </div>
                <pre className="mt-4 overflow-x-auto rounded-[18px] bg-[#111714] p-4 text-[12px] leading-6 text-[#ecf3ee] shadow-inner">
                  <code>{artifact.preview.join("\n") || "(empty file)"}</code>
                </pre>
              </>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                この artifact はまだ生成されていません。
              </p>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

function ArtifactDetailPanel({
  artifact,
  onCopy,
  downloadHref,
}: {
  artifact: WorkspaceSnapshot["artifactContents"][number];
  onCopy: () => void;
  downloadHref: string;
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(245,108,44,0.18)] bg-[linear-gradient(180deg,_rgba(255,252,245,0.96),_rgba(255,244,236,0.92))] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.12em] text-[var(--accent-deep)] uppercase">
            Step 18 Detail Viewer
          </div>
          <div className="mt-2 font-mono text-lg font-bold text-[var(--ink)]">{artifact.name}</div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[#fffaf4]"
          >
            内容をコピー
          </button>
          <a
            href={downloadHref}
            className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[#fffaf4]"
          >
            raw を取得
          </a>
        </div>
      </div>
      <StructuredArtifactContent artifact={artifact} />
    </article>
  );
}

function WorkspaceOverviewPanel({
  overview,
}: {
  overview: WorkspaceSnapshot["overview"];
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(30,34,32,0.08)] bg-[linear-gradient(180deg,_rgba(248,246,240,0.95),_rgba(255,255,255,0.92))] px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        Step 21 Operator Overview
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ResultCard title="Existing Artifacts" body={String(overview.existingArtifactCount)} mono />
        <ResultCard title="Missing Artifacts" body={String(overview.missingArtifactCount)} mono />
        <ResultCard title="Scene Files" body={String(overview.sceneFileCount)} mono />
        <ResultCard title="Latest Run" body={overview.latestRunLabel} mono />
      </div>
      <div className="mt-4 rounded-[18px] border border-[rgba(245,108,44,0.12)] bg-[#fffaf4] px-4 py-4">
        <div className="text-xs font-semibold tracking-[0.12em] text-[var(--accent-deep)] uppercase">
          Primary Action
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{overview.primaryAction}</p>
      </div>
    </article>
  );
}

function ReleaseReadinessPanel({
  readiness,
}: {
  readiness: WorkspaceSnapshot["readiness"];
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(36,92,74,0.16)] bg-[linear-gradient(180deg,_rgba(239,248,244,0.96),_rgba(255,255,255,0.92))] px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.12em] text-[var(--moss)] uppercase">
        Step 22 Release Readiness
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-black text-[var(--ink)]">{readiness.score}/100</div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{readiness.summary}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
            readiness.status === "ready"
              ? "bg-[rgba(36,92,74,0.12)] text-[var(--moss)]"
              : readiness.status === "warning"
                ? "bg-[rgba(183,138,45,0.12)] text-[var(--gold)]"
                : "bg-[rgba(197,62,47,0.12)] text-[#a33b2b]"
          }`}
        >
          {readiness.status}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {readiness.checks.map((check) => (
          <div
            key={check.label}
            className="rounded-[18px] border border-[rgba(30,34,32,0.06)] bg-white px-3 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-[var(--ink)]">{check.label}</div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                  check.status === "ready"
                    ? "bg-[rgba(36,92,74,0.12)] text-[var(--moss)]"
                    : check.status === "warning"
                      ? "bg-[rgba(183,138,45,0.12)] text-[var(--gold)]"
                      : "bg-[rgba(197,62,47,0.12)] text-[#a33b2b]"
                }`}
              >
                {check.status}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{check.detail}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function SignoffPanel({
  signoff,
  signoffBy,
  signoffNote,
  onChangeSignoffBy,
  onChangeSignoffNote,
  onSignoff,
  onRevoke,
  loading,
}: {
  signoff: WorkspaceSnapshot["signoff"];
  signoffBy: string;
  signoffNote: string;
  onChangeSignoffBy: (value: string) => void;
  onChangeSignoffNote: (value: string) => void;
  onSignoff: () => void;
  onRevoke: () => void;
  loading: boolean;
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(36,92,74,0.16)] bg-[linear-gradient(180deg,_rgba(242,249,246,0.96),_rgba(255,255,255,0.92))] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.12em] text-[var(--moss)] uppercase">
            Step 24 Signoff
          </div>
          <div className="mt-2 text-lg font-black text-[var(--ink)]">
            {signoff.status}
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
            signoff.status === "signed_off"
              ? "bg-[rgba(36,92,74,0.12)] text-[var(--moss)]"
              : signoff.status === "revoked"
                ? "bg-[rgba(197,62,47,0.12)] text-[#a33b2b]"
                : "bg-[rgba(183,138,45,0.12)] text-[var(--gold)]"
          }`}
        >
          {signoff.status}
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="rounded-[18px] border border-[rgba(30,34,32,0.08)] bg-white px-4 py-4">
          <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Signed Off By
          </div>
          <input
            value={signoffBy}
            onChange={(event) => onChangeSignoffBy(event.target.value)}
            className="mt-3 w-full border-0 bg-transparent p-0 text-sm font-semibold outline-none"
          />
        </label>
        <ResultCard
          title="Signed Off At"
          body={signoff.signedOffAt ?? "not yet"}
          mono
        />
      </div>

      <div className="mt-4 rounded-[18px] border border-[rgba(30,34,32,0.08)] bg-white px-4 py-4">
        <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
          Signoff Note
        </div>
        <textarea
          value={signoffNote}
          onChange={(event) => onChangeSignoffNote(event.target.value)}
          rows={3}
          className="mt-3 w-full border-0 bg-transparent p-0 text-sm leading-7 outline-none"
          placeholder="交付判断メモや留意点を残します。"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSignoff}
          disabled={loading}
          className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-55"
        >
          signoff する
        </button>
        <button
          type="button"
          onClick={onRevoke}
          disabled={loading}
          className="rounded-full border border-[rgba(197,62,47,0.16)] bg-white px-4 py-2 text-xs font-bold text-[#a33b2b] transition hover:bg-[#fff4f1] disabled:opacity-55"
        >
          signoff を取り消す
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ResultCard title="Recorded By" body={signoff.signedOffBy ?? "n/a"} mono />
        <ResultCard
          title="Readiness Score"
          body={typeof signoff.readinessScore === "number" ? String(signoff.readinessScore) : "n/a"}
          mono
        />
      </div>
    </article>
  );
}

function DeliveryBundlePanel({
  bundle,
  downloadHref,
  onCopy,
}: {
  bundle: WorkspaceSnapshot["deliveryBundle"];
  downloadHref: string;
  onCopy: () => void;
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(245,108,44,0.16)] bg-[linear-gradient(180deg,_rgba(255,249,242,0.98),_rgba(255,255,255,0.92))] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.12em] text-[var(--accent-deep)] uppercase">
            Step 23 Delivery Bundle
          </div>
          <div className="mt-2 text-lg font-black text-[var(--ink)]">{bundle.customerId}</div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[#fffaf4]"
          >
            bundle をコピー
          </button>
          <a
            href={downloadHref}
            className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[#fffaf4]"
          >
            bundle.json を出力
          </a>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ResultList title="Included Artifacts" items={bundle.includedArtifacts} />
        <ResultList title="Missing Artifacts" items={bundle.missingArtifacts.length ? bundle.missingArtifacts : ["none"]} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ResultList title="Code Directories" items={bundle.codeDirectories.length ? bundle.codeDirectories : ["none"]} />
        <ResultList title="Scene Files" items={bundle.sceneFiles.length ? bundle.sceneFiles : ["none"]} />
      </div>
      <div className="mt-4">
        <ResultList title="Recommended Next Actions" items={bundle.recommendedNextActions} />
      </div>
    </article>
  );
}

function RunHistoryList({
  runHistory,
}: {
  runHistory: WorkspaceSnapshot["runHistory"];
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(30,34,32,0.08)] bg-[#f2f6f2] px-4 py-4">
      <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        Step 15 Run History
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        `plan-game` と `run-game` の実行履歴を workspace 単位で保持します。
      </p>
      <div className="mt-4 space-y-3">
        {runHistory.map((entry) => (
          <div
            key={entry.runId}
            className="rounded-[18px] border border-[rgba(30,34,32,0.06)] bg-white px-4 py-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-mono text-sm font-bold text-[var(--ink)]">{entry.runId}</div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                  entry.status === "passed"
                    ? "bg-[rgba(36,92,74,0.12)] text-[var(--moss)]"
                    : entry.status === "failed"
                      ? "bg-[rgba(197,62,47,0.12)] text-[#a33b2b]"
                      : "bg-[rgba(183,138,45,0.12)] text-[var(--gold)]"
                }`}
              >
                {entry.status}
              </span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ResultCard title="Mode" body={entry.mode} mono />
              <ResultCard title="Started At" body={entry.startedAt} mono />
              <ResultCard title="Finished At" body={entry.finishedAt ?? "still running"} mono />
              <ResultCard title="PID" body={entry.pid ? String(entry.pid) : "n/a"} mono />
            </div>
            <pre className="mt-3 overflow-x-auto rounded-[18px] bg-[#111714] p-4 text-[12px] leading-6 text-[#ecf3ee] shadow-inner">
              <code>{entry.command}</code>
            </pre>
            {entry.error && <p className="mt-3 text-sm text-[#a33b2b]">{entry.error}</p>}
          </div>
        ))}
      </div>
    </article>
  );
}

function StructuredArtifactContent({
  artifact,
}: {
  artifact: WorkspaceSnapshot["artifactContents"][number];
}) {
  const structured = buildStructuredArtifactView(artifact);

  if (!structured) {
    return (
      <pre className="mt-4 overflow-x-auto rounded-[18px] bg-[#111714] p-4 text-[12px] leading-6 text-[#ecf3ee] shadow-inner">
        <code>{artifact.preview.join("\n") || "(empty file)"}</code>
      </pre>
    );
  }

  return <div className="mt-4">{structured}</div>;
}

function buildStructuredArtifactView(
  artifact: WorkspaceSnapshot["artifactContents"][number]
): React.ReactNode | null {
  if (!artifact.json || typeof artifact.json !== "object") {
    return null;
  }

  if (artifact.name === "frontend_plan_preview.json") {
    const data = artifact.json as Partial<GamePlanPreview>;
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <ResultCard title="Package" body={data.packageName ?? "unknown"} mono />
        <ResultCard title="Template" body={data.primaryTemplate ?? "unknown"} mono />
        <ResultCard title="Summary" body={data.summary ?? "no summary"} />
        <ResultList title="Analytics Events" items={Array.isArray(data.analyticsEvents) ? data.analyticsEvents : []} />
        <StructuredSceneList scenes={Array.isArray(data.scenes) ? (data.scenes as GamePlanPreview["scenes"]) : []} />
        <StructuredAssetList assets={Array.isArray(data.assets) ? (data.assets as GamePlanPreview["assets"]) : []} />
      </div>
    );
  }

  if (artifact.name === "game_plan.json") {
    const data = artifact.json as Record<string, unknown>;
    const summary =
      typeof data.summary === "string"
        ? data.summary
        : typeof data.summary_ja === "string"
          ? data.summary_ja
          : "summary not available";
    const sceneItems = Array.isArray(data.scenes)
      ? data.scenes.map((scene) =>
          typeof scene === "object" && scene !== null && "name" in scene
            ? String((scene as { name?: string }).name)
            : String(scene)
        )
      : [];
    return (
      <div className="space-y-4">
        <ResultCard title="Plan Summary" body={summary} />
        <div className="grid gap-4 lg:grid-cols-2">
          <ResultList title="Scenes" items={sceneItems} />
          <ResultList
            title="Ops Features"
            items={Array.isArray(data.ops_features) ? data.ops_features.map(String) : []}
          />
        </div>
      </div>
    );
  }

  if (artifact.name === "scene_map.json") {
    const data = artifact.json as Record<string, unknown>;
    const sceneItems = Array.isArray(data.scenes)
      ? data.scenes.map((scene) =>
          typeof scene === "string"
            ? scene
            : typeof scene === "object" && scene && "name" in scene
              ? String((scene as { name?: unknown }).name ?? "scene")
              : "scene"
        )
      : [];
    return <ResultList title="Scene Map" items={sceneItems} />;
  }

  if (artifact.name === "release_checklist.json") {
    const data = artifact.json as Record<string, unknown>;
    const checklist = Array.isArray(data.checks)
      ? data.checks.map(String)
      : Array.isArray(data.items)
        ? data.items.map(String)
        : [];
    return <ResultList title="Release Checklist" items={checklist} />;
  }

  if (artifact.name === "website_run_status.json") {
    const data = artifact.json as Record<string, unknown>;
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <ResultCard title="Mode" body={String(data.mode ?? "unknown")} mono />
        <ResultCard title="Status" body={String(data.status ?? "unknown")} mono />
        <ResultCard title="Started At" body={String(data.startedAt ?? "unknown")} mono />
        <ResultCard title="Finished At" body={String(data.finishedAt ?? "pending")} mono />
      </div>
    );
  }

  if (artifact.name === "website_run_history.json") {
    const data = Array.isArray(artifact.json) ? artifact.json : [];
    return (
      <div className="space-y-3">
        {data.slice(0, 5).map((entry, index) => {
          const row = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : {};
          return (
            <div
              key={String(row.runId ?? index)}
              className="rounded-[18px] border border-[rgba(30,34,32,0.06)] bg-[#fbfbf8] px-3 py-3"
            >
              <div className="font-mono text-sm font-bold text-[var(--ink)]">
                {String(row.runId ?? `run-${index + 1}`)}
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <ResultCard title="Mode" body={String(row.mode ?? "unknown")} mono />
                <ResultCard title="Status" body={String(row.status ?? "unknown")} mono />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (artifact.name === "website_signoff.json") {
    const data = artifact.json as Record<string, unknown>;
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <ResultCard title="Status" body={String(data.status ?? "pending")} mono />
        <ResultCard title="Signed Off By" body={String(data.signedOffBy ?? "n/a")} mono />
        <ResultCard title="Signed Off At" body={String(data.signedOffAt ?? "n/a")} mono />
        <ResultCard title="Readiness Score" body={String(data.readinessScore ?? "n/a")} mono />
      </div>
    );
  }

  return null;
}
