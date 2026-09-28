import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, DEMO, body, title } from "./brand";
import env from "./envelope.json";

export const FPS = 30;
export const DURATION = 480;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.32, 0.72, 0, 1); // --ease-premium
const dbToGain = (db: number) => 10 ** (db / 20);

// Instagram UI covers roughly the top 250px and bottom 340px of a reel.
const SAFE_TOP = 250;
const SAFE_BOTTOM = 340;

const useRise = (delay: number, dist = 40) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200, mass: 0.9 } });
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)`, filter: `blur(${(1 - p) * 8}px)` };
};

const Brand: React.FC = () => (
  <div style={{ position: "absolute", top: SAFE_TOP - 60, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 16, fontFamily: title, fontWeight: 500, fontSize: 30, letterSpacing: "0.32em", color: C.text, textTransform: "uppercase" }}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 30 }}>
      {[0.5, 1, 0.7].map((h, i) => <i key={i} style={{ width: 5, height: 30 * h, borderRadius: 3, background: C.accent }} />)}
    </span>
    Auralith Forge
  </div>
);

const Background: React.FC = () => {
  const f = useCurrentFrame();
  const x = 50 + Math.sin(f / 90) * 12;
  const y = 42 + Math.cos(f / 110) * 8;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(90% 55% at ${x}% ${y}%, rgba(130,117,255,0.20), transparent 70%)` }} />
    </AbsoluteFill>
  );
};

// A scene fades in over 12 frames and out over its last 12.
const Scene: React.FC<{ from: number; duration: number; children: React.ReactNode }> = ({ from, duration, children }) => (
  <Sequence from={from} durationInFrames={duration} layout="none">
    <SceneFade duration={duration}>{children}</SceneFade>
  </Sequence>
);
const SceneFade: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 12, duration - 12, duration], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

// ---------- Scene 1: the promise ----------
const Idle: React.FC = () => {
  const f = useCurrentFrame();
  const n = 43;
  return (
    <div style={{ position: "absolute", left: 70, right: 70, bottom: SAFE_BOTTOM + 60, height: 260, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      {Array.from({ length: n }, (_, k) => {
        const e = env.after[Math.floor((k / n) * env.after.length)];
        const wave = 0.5 + 0.5 * Math.sin(f / 9 - k * 0.42);
        const h = 10 + (0.35 + e * 0.9) * 190 * (0.55 + 0.45 * wave);
        return <i key={k} style={{ width: 12, height: h, borderRadius: 6, background: k % 5 === 0 ? C.accent : "rgba(245,245,243,0.16)" }} />;
      })}
    </div>
  );
};

const Promise_: React.FC = () => {
  const eyebrow = useRise(6, 20);
  const l1 = useRise(14);
  const l2 = useRise(30);
  const sub = useRise(52, 24);
  return (
    <AbsoluteFill style={{ padding: "0 80px" }}>
      <div style={{ position: "absolute", left: 80, right: 80, top: 470 }}>
        <div style={{ ...eyebrow, fontFamily: body, fontWeight: 600, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", color: C.accent }}>Adaptive mastering engine</div>
        <div style={{ ...l1, marginTop: 36, fontFamily: title, fontWeight: 700, fontSize: 132, lineHeight: 1.0, letterSpacing: "-0.03em", color: C.text }}>Master your music.</div>
        <div style={{ ...l2, marginTop: 28, fontFamily: title, fontWeight: 700, fontSize: 132, lineHeight: 1.0, letterSpacing: "-0.03em", color: C.muted }}>Keep what makes it yours.</div>
        <div style={{ ...sub, marginTop: 44, fontFamily: body, fontWeight: 500, fontSize: 36, lineHeight: 1.4, color: C.muted }}>Measures first. Fixes only what it hears.</div>
      </div>
      <Idle />
    </AbsoluteFill>
  );
};

// ---------- Scene 2: hear it (real audio, real waveforms) ----------
const SWITCH = 90; // scene-local frame where Before flips to After
const HEAD_START = 15; // scene-local frame where playback begins
const BARS = 84;

const Player: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f, fps, config: { damping: 200 } });
  const after = f >= SWITCH;
  const flip = spring({ frame: f - SWITCH, fps, config: { damping: 18, stiffness: 160 } });
  const matchDb = DEMO.beforeLufs - DEMO.afterLufs; // negative: attenuate the louder master
  const pos = env.start + Math.max(0, f - HEAD_START) / fps;
  const progress = Math.min(1, pos / env.seconds);
  const lufs = after
    ? interpolate(f, [SWITCH, SWITCH + 40], [DEMO.beforeLufs, DEMO.afterLufs], { ...clamp, easing: ease })
    : DEMO.beforeLufs;
  const active = after ? C.accent : C.text;
  const W = 860, H = 320, pitch = W / BARS;
  const bars = Array.from({ length: BARS }, (_, k) => {
    const from = Math.floor((k / BARS) * env.before.length), to = Math.max(from + 1, Math.floor(((k + 1) / BARS) * env.before.length));
    const avg = (arr: number[]) => arr.slice(from, to).reduce((s, v) => s + v, 0) / (to - from);
    const b = avg(env.before), a = avg(env.after) * dbToGain(matchDb); // matched, like the site's demo player
    const mix = after ? flip : 0;
    const h = (0.06 + 0.94 * Math.min(1, (b + (a - b) * mix) * 1.15)) * H;
    const lit = (k + 0.5) / BARS <= progress && f >= HEAD_START;
    return { h, lit };
  });
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 470, opacity: enter, transform: `translateY(${(1 - enter) * 60}px) scale(${0.96 + 0.04 * enter})`, borderRadius: 48, background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 40px 120px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)", padding: "48px 50px 44px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: body, fontWeight: 600, fontSize: 26, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Pop · one mix</div>
        <div style={{ display: "inline-flex", padding: 6, borderRadius: 999, background: "rgba(255,255,255,0.06)", fontFamily: body, fontWeight: 700, fontSize: 24, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          <span style={{ padding: "12px 28px", borderRadius: 999, background: after ? "transparent" : C.text, color: after ? C.muted : C.bg }}>Before</span>
          <span style={{ padding: "12px 28px", borderRadius: 999, background: after ? C.accent : "transparent", color: after ? "#fff" : C.muted }}>After</span>
        </div>
      </div>
      <div style={{ marginTop: 44, display: "flex", alignItems: "baseline", gap: 18 }}>
        <span style={{ fontFamily: title, fontWeight: 700, fontSize: 150, letterSpacing: "-0.02em", lineHeight: 1, color: after ? C.accent : C.text, fontVariantNumeric: "tabular-nums" }}>{lufs.toFixed(1)}</span>
        <span style={{ fontFamily: body, fontWeight: 600, fontSize: 34, color: C.muted }}>LUFS</span>
      </div>
      <div style={{ marginTop: 40, height: H, width: W, display: "flex", alignItems: "center" }}>
        {bars.map((b, k) => (
          <i key={k} style={{ width: 8, marginRight: pitch - 8, height: b.h, borderRadius: 4, background: b.lit ? active : "rgba(245,245,243,0.14)" }} />
        ))}
      </div>
      <div style={{ marginTop: 34, display: "flex", justifyContent: "space-between", fontFamily: body, fontWeight: 500, fontSize: 25, color: C.muted }}>
        <span>Levels matched for listening</span>
        <span style={{ color: C.text }}>True peak {DEMO.truePeak.toFixed(1)} dBTP</span>
      </div>
    </div>
  );
};

const Hear: React.FC = () => {
  const cap = useRise(20, 20);
  const f = useCurrentFrame();
  const after = f >= SWITCH;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 80, right: 80, top: 330, ...cap }}>
        <div style={{ fontFamily: body, fontWeight: 600, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", color: C.accent }}>Hear it</div>
      </div>
      <Player />
      <div style={{ position: "absolute", left: 80, right: 80, top: 1330, fontFamily: title, fontWeight: 700, fontSize: 64, lineHeight: 1.1, letterSpacing: "-0.02em", color: C.text }}>
        {after ? "Louder, cleaner — still your mix." : "Your mix, as it is."}
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 3: how it thinks ----------
const PILLARS = [
  ["Analyze", "Measures loudness, tone, dynamics and stereo first."],
  ["Correct", "Fixes only what the measurements justify."],
  ["Preserve", "Leaves what already works alone."],
  ["Verify", "Re-measures the result and backs off if needed."],
];
const Pillar: React.FC<{ i: number; name: string; text: string }> = ({ i, name, text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = 8 + i * 12;
  const p = spring({ frame: f - d, fps, config: { damping: 200 } });
  const tick = interpolate(f, [d + 16, d + 30], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ opacity: p, transform: `translateX(${(1 - p) * 70}px)`, display: "flex", alignItems: "center", gap: 36, padding: "34px 40px", borderRadius: 36, background: C.surface, border: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: title, fontWeight: 500, fontSize: 34, color: C.accent, width: 56 }}>0{i + 1}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: title, fontWeight: 700, fontSize: 60, letterSpacing: "-0.02em", color: C.text }}>{name}</div>
        <div style={{ marginTop: 8, fontFamily: body, fontWeight: 500, fontSize: 29, lineHeight: 1.35, color: C.muted }}>{text}</div>
      </div>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r="24" fill="none" stroke={C.accent} strokeWidth="3" opacity={0.35 + 0.65 * tick} />
        <path d="M15 27 l8 8 l15 -17" fill="none" stroke={C.accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40" strokeDashoffset={40 * (1 - tick)} />
      </svg>
    </div>
  );
};
const Pillars: React.FC = () => {
  const head = useRise(0, 30);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 80, right: 80, top: 330, ...head }}>
        <div style={{ fontFamily: body, fontWeight: 600, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", color: C.accent }}>How it listens</div>
        <div style={{ marginTop: 24, fontFamily: title, fontWeight: 700, fontSize: 92, lineHeight: 1.02, letterSpacing: "-0.03em", color: C.text }}>It doesn’t guess.<br />It measures.</div>
      </div>
      <div style={{ position: "absolute", left: 60, right: 60, top: 780, display: "flex", flexDirection: "column", gap: 22 }}>
        {PILLARS.map(([n, t], i) => <Pillar key={n} i={i} name={n} text={t} />)}
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 4: call to action ----------
const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const a = useRise(4);
  const b = useRise(16);
  const btn = useRise(30, 30);
  const foot = useRise(46, 20);
  const pulse = 1 + 0.015 * Math.sin(f / 7);
  return (
    <AbsoluteFill>
      <Idle />
      <div style={{ position: "absolute", left: 80, right: 80, top: 430 }}>
        <div style={{ ...a, fontFamily: title, fontWeight: 700, fontSize: 140, lineHeight: 0.98, letterSpacing: "-0.035em", color: C.text }}>Master a track.</div>
        <div style={{ ...b, marginTop: 20, fontFamily: title, fontWeight: 700, fontSize: 140, lineHeight: 0.98, letterSpacing: "-0.035em", color: C.accent }}>Free.</div>
        <div style={{ ...btn, marginTop: 90 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 20, padding: "38px 64px", borderRadius: 999, background: C.text, color: C.bg, fontFamily: body, fontWeight: 700, fontSize: 38, letterSpacing: "0.12em", textTransform: "uppercase", transform: `scale(${pulse})` }}>
            auralithforge.app
            <svg width="34" height="34" viewBox="0 0 34 34"><path d="M6 17h20M18 8l9 9-9 9" fill="none" stroke={C.bg} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
        <div style={{ ...foot, marginTop: 48, fontFamily: body, fontWeight: 500, fontSize: 32, color: C.muted }}>No signup needed to try it.</div>
      </div>
    </AbsoluteFill>
  );
};

export const Reel: React.FC = () => {
  // Scene 2 starts at frame 95; playback begins HEAD_START frames in, and the
  // switch to After keeps the same position in the track, like the real player.
  const S2 = 95;
  const beforeFrames = SWITCH - HEAD_START;
  const afterFrames = 200 - SWITCH;
  const fade = (n: number) => (fr: number) => Math.min(1, fr / 6, (n - fr) / 6);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Background />
      <Brand />
      <Scene from={0} duration={108}><Promise_ /></Scene>
      <Scene from={S2} duration={200}><Hear /></Scene>
      <Scene from={290} duration={110}><Pillars /></Scene>
      <Scene from={388} duration={92}><Cta /></Scene>
      <Sequence from={S2 + HEAD_START} durationInFrames={beforeFrames}>
        <Audio src={staticFile("pop-before.mp3")} trimBefore={Math.round(env.start * FPS)} volume={fade(beforeFrames)} />
      </Sequence>
      <Sequence from={S2 + SWITCH} durationInFrames={afterFrames}>
        <Audio src={staticFile("pop-after.mp3")} trimBefore={Math.round((env.start + beforeFrames / FPS) * FPS)} volume={(fr) => fade(afterFrames)(fr) * dbToGain(DEMO.beforeLufs - DEMO.afterLufs)} />
      </Sequence>
    </AbsoluteFill>
  );
};
