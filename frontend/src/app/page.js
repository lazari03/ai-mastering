import Link from "next/link";

import CircularText from "@/components/reactbits/CircularText";
import MagicBento from "@/components/reactbits/MagicBento";
import Threads from "@/components/reactbits/Threads";

export default function HomePage() {
  return (
    <main className="px-3 py-6 sm:px-4 md:px-8 md:py-12">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <div className="glass-panel reveal overflow-hidden rounded-3xl border border-white/10">
          <div className="relative h-[78vh] min-h-[520px] w-full sm:h-[72vh] lg:h-[640px]">
            <Threads amplitude={1.05} distance={0.08} enableMouseInteraction color={[0.9, 0.55, 0.25]} />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/80" />

            <header className="absolute left-0 top-0 z-10 flex w-full items-center justify-between p-4 sm:p-5 md:p-8">
              <p className="text-xs uppercase tracking-[0.22em] text-brass">Auralith Forge</p>
              <Link
                href="/app"
                className="rounded-full border border-brass/50 bg-brass/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-brass transition hover:bg-brass/30"
              >
                Open App
              </Link>
            </header>

            <div className="absolute right-4 top-20 z-10 hidden md:block">
              <CircularText
                text="AURALITH*FORGE*MASTERING*SUITE*"
                onHover="speedUp"
                spinDuration={18}
                className="scale-[0.7] opacity-90"
              />
            </div>

            <div className="absolute bottom-0 left-0 z-10 max-w-3xl p-4 sm:p-5 md:p-10">
              <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-zinc-300 sm:text-xs">Realtime Adaptive Mastering</p>
              <h1 className="font-[var(--font-title)] text-3xl leading-[1.03] text-white sm:text-4xl md:text-6xl">
                Shape Loudness,
                <span className="block text-ember">Keep Emotion.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm text-zinc-200 md:text-base">
                Production-ready mastering with style profiles, intelligent spectral correction, stem-aware options, and
                one-click export tuned for modern platforms.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/app"
                  className="rounded-xl bg-ember px-6 py-3 text-center text-sm font-semibold uppercase tracking-[0.16em] text-black transition hover:bg-brass"
                >
                  Take Me To App
                </Link>
                <a
                  href="#features"
                  className="rounded-xl border border-white/20 bg-black/20 px-6 py-3 text-center text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:border-white/40"
                >
                  Explore Features
                </a>
              </div>
            </div>
          </div>
        </div>

        <section id="features" className="reveal reveal-delay-1 grid gap-4 md:grid-cols-3">
          <article className="glass-panel rounded-2xl p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Precision</p>
            <h2 className="mt-2 font-[var(--font-title)] text-2xl">Adaptive DSP</h2>
            <p className="mt-2 text-sm text-zinc-300">Automatic analysis-first processing for tonal balance, loudness, and dynamics.</p>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Workflow</p>
            <h2 className="mt-2 font-[var(--font-title)] text-2xl">Pro Presets</h2>
            <p className="mt-2 text-sm text-zinc-300">Editable JSON mixing presets for repeatable release chains and team consistency.</p>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Control</p>
            <h2 className="mt-2 font-[var(--font-title)] text-2xl">Instant A/B</h2>
            <p className="mt-2 text-sm text-zinc-300">Compare original and mastered output instantly with downloadable final export.</p>
          </article>
        </section>

        <section className="reveal reveal-delay-2 glass-panel rounded-3xl p-4 md:p-6">
          <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <h2 className="font-[var(--font-title)] text-2xl text-white md:text-3xl">Inside Auralith Forge</h2>
            <Link href="/app" className="text-xs uppercase tracking-[0.16em] text-brass hover:text-ember">
              Jump to app
            </Link>
          </div>
          <MagicBento
            textAutoHide
            enableStars
            enableSpotlight
            enableBorderGlow
            enableTilt
            enableMagnetism
            clickEffect
            spotlightRadius={300}
            particleCount={12}
            glowColor="232, 93, 42"
          />
        </section>
      </section>
    </main>
  );
}
