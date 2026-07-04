import GameStudioWizard from "@/components/GameStudioWizard";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,108,44,0.16),_transparent_28%),linear-gradient(135deg,_var(--paper)_0%,_#fff7ea_52%,_#f2f6f2_100%)] px-4 py-6 md:px-8 md:py-10">
      <GameStudioWizard />
    </main>
  );
}
