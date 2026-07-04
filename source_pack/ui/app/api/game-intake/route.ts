import { NextRequest, NextResponse } from "next/server";
import {
  assetLevelValues,
  buildGameIntakeReceipt,
  buildPlanPreview,
  goalValues,
  templateValues,
  type GameIntakeInput,
} from "@/lib/game-studio";
import { persistGameIntakeToWorkspaceAdapter } from "@/lib/workspace-sync";
import { triggerWorkspaceRun } from "@/lib/game-runner";
import {
  buildDeliveryBundleManifest,
  buildOperatorHandoffMarkdown,
  readWorkspaceBrowserPayload,
  readWorkspaceArtifact,
  writeWorkspaceSignoff,
} from "@/lib/workspace-browser";

function isValidBody(body: unknown): body is GameIntakeInput {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.projectName === "string" &&
    candidate.projectName.trim().length > 0 &&
    typeof candidate.goal === "string" &&
    goalValues.includes(candidate.goal as (typeof goalValues)[number]) &&
    typeof candidate.template === "string" &&
    templateValues.includes(candidate.template as (typeof templateValues)[number]) &&
    typeof candidate.assetLevel === "string" &&
    assetLevelValues.includes(candidate.assetLevel as (typeof assetLevelValues)[number]) &&
    typeof candidate.brief === "string" &&
    candidate.brief.trim().length > 0
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isValidBody(body)) {
      return NextResponse.json(
        { ok: false, error: "Invalid game intake payload" },
        { status: 400 }
      );
    }

    const receipt = buildGameIntakeReceipt(body);
    const planPreview = buildPlanPreview(body, receipt);
    const workspaceSync = await persistGameIntakeToWorkspaceAdapter(body, receipt);

    return NextResponse.json({
      ok: true,
      receipt,
      planPreview,
      workspaceSync,
    });
  } catch (error) {
    console.error("game-intake failed", error);
    return NextResponse.json(
      { ok: false, error: "Failed to generate game intake receipt" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const customerId = req.nextUrl.searchParams.get("customerId");
    const artifact = req.nextUrl.searchParams.get("artifact");
    const exportType = req.nextUrl.searchParams.get("export");
    const download = req.nextUrl.searchParams.get("download") === "1";
    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "customerId is required" },
        { status: 400 }
      );
    }

    if (exportType === "operator-handoff") {
      const markdown = await buildOperatorHandoffMarkdown(customerId);
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          ...(download
            ? {
                "Content-Disposition": `attachment; filename="${customerId}-source-pack-handoff.md"`,
              }
            : {}),
        },
      });
    }

    if (exportType === "delivery-bundle") {
      const manifest = await buildDeliveryBundleManifest(customerId);
      return new NextResponse(JSON.stringify(manifest, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...(download
            ? {
                "Content-Disposition": `attachment; filename="${customerId}-delivery-bundle.json"`,
              }
            : {}),
        },
      });
    }

    if (artifact) {
      const content = await readWorkspaceArtifact(customerId, artifact);
      if (!content.exists) {
        return NextResponse.json(
          { ok: false, error: "artifact not found" },
          { status: 404 }
        );
      }
      const body = content.raw ?? content.preview.join("\n");
      const contentType = content.kind === "json"
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8";
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          ...(download
            ? {
                "Content-Disposition": `attachment; filename="${artifact}"`,
              }
            : {}),
        },
      });
    }

    const payload = await readWorkspaceBrowserPayload(customerId);
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    console.error("game-workspace lookup failed", error);
    return NextResponse.json(
      { ok: false, error: "Failed to read workspace snapshot" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const customerId = typeof body.customerId === "string" ? body.customerId : "";
    const action = typeof body.action === "string" ? body.action : "";
    const mode = body.mode === "plan-game" || body.mode === "run-game" ? body.mode : null;

    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "customerId is required" },
        { status: 400 }
      );
    }

    if (action === "signoff" || action === "revoke-signoff") {
      const payload = await readWorkspaceBrowserPayload(customerId);
      const current = payload.snapshot.signoff;
      const nextStatus = action === "signoff" ? "signed_off" : "revoked";
      await writeWorkspaceSignoff(customerId, {
        status: nextStatus,
        signedOffAt: new Date().toISOString(),
        signedOffBy: typeof body.signedOffBy === "string" && body.signedOffBy.trim()
          ? body.signedOffBy.trim()
          : "customer-operator",
        note: typeof body.note === "string" ? body.note.trim() : "",
        readinessScore: payload.snapshot.readiness.score,
      });
      return NextResponse.json({
        ok: true,
        previousSignoff: current,
        signoff: {
          status: nextStatus,
        },
      });
    }

    if (!mode) {
      return NextResponse.json(
        { ok: false, error: "mode is required for run actions" },
        { status: 400 }
      );
    }

    const runStatus = await triggerWorkspaceRun(customerId, mode);
    return NextResponse.json({ ok: true, runStatus });
  } catch (error) {
    console.error("game trigger failed", error);
    return NextResponse.json(
      { ok: false, error: "Failed to trigger workspace run" },
      { status: 500 }
    );
  }
}
