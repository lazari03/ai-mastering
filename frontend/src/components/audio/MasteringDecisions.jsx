"use client";

import { useId, useState } from "react";

import { useLanguage } from "@/lib/i18n";
import { summarizeDecisions, detailedMetrics, formatHz, humanizeProblem } from "@/lib/masteringDecisions";
import { trackEvent } from "@/lib/analytics";

// "What Auralith changed" — built only from the engine's recorded decisions
// (lib/masteringDecisions.js). Renders nothing for jobs that predate
// diagnostics; the caller keeps showing ProcessingSummary for those.
//
// Status is always a text label plus a glyph, never colour alone.
const GLYPH = { corrected: "●", light: "◐", preserved: "○", noted: "◌" };

function Status({ status, t }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        status === "corrected" ? "border-text-primary/25 bg-text-primary text-bg" : "border-border-subtle text-text-secondary"
      }`}
    >
      <span aria-hidden="true">{GLYPH[status]}</span>
      {t(`decisions.status.${status}`)}
    </span>
  );
}

function Row({ label, status, t, children }) {
  return (
    <li className="decision-row border-b border-border-subtle py-3.5 last:border-0">
      <span className="decision-label text-[13px] font-semibold text-text-primary">{label}</span>
      <div className="decision-body text-[14px] leading-relaxed text-text-secondary">{children}</div>
      {status ? (
        <div className="decision-status">
          <Status status={status} t={t} />
        </div>
      ) : null}
    </li>
  );
}

const fmtDb = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}`;
const fmtNum = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "—");

export default function MasteringDecisions({ result, source = "result_view" }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const summary = summarizeDecisions(result);
  if (!summary) return null;
  const { regions, dynamics, stereo, loudness, verification, counts } = summary;
  const metrics = detailedMetrics(result);

  return (
    <section aria-labelledby={`${detailsId}-title`} className="decisions-card rounded-[20px] border border-border-subtle bg-white/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${detailsId}-title`} className="m-0 text-[18px] font-semibold text-text-primary">
          {t("decisions.title")}
        </h2>
        <p className="m-0 text-[13px] text-text-secondary">{t("decisions.summary", { c: counts.corrections, u: counts.untouched })}</p>
      </div>
      <p className="m-0 mt-1 text-[12px] text-text-secondary">{t("decisions.intro")}</p>

      <ul className="m-0 mt-3 list-none p-0">
        {regions.map((r) => (
          <Row key={r.key} label={t(`decisions.region.${r.key}`)} status={r.status} t={t}>
            {r.moves.length
              ? r.moves.map((m) => (
                  <span key={`${m.hz}-${m.problem}`} className="block">
                    {t(m.dynamic ? "decisions.moveDynamic" : "decisions.move", { problem: humanizeProblem(m.problem), hz: formatHz(m.hz) })}{" "}
                    <span className="whitespace-nowrap font-mono text-text-primary">{fmtDb(m.gainDb)} dB</span>
                  </span>
                ))
              : r.noted.length
                ? r.noted.map((n) => (
                    <span key={n.problem} className="block">
                      {t("decisions.noted", { problem: humanizeProblem(n.problem), hz: formatHz(n.hz) })}
                    </span>
                  ))
                : t("decisions.preservedBody")}
          </Row>
        ))}

        <Row label={t("decisions.dynamics")} status={dynamics.status} t={t}>
          <span className="block">
            {dynamics.status === "corrected"
              ? [dynamics.multiband ? t("decisions.dyn.multiband") : null, dynamics.glue ? t("decisions.dyn.glue") : null].filter(Boolean).join(" · ")
              : dynamics.status === "light"
                ? t("decisions.dyn.limiterLight", { db: fmtNum(dynamics.limiterGrDb) })
                : dynamics.limiterOnly
                  ? t("decisions.dyn.limiterOnly")
                  : t("decisions.dyn.preserved")}
          </span>
          {dynamics.crestBefore != null && dynamics.crestAfter != null ? (
            <span className="block text-[12px]">{t("decisions.dyn.crest", { b: fmtNum(dynamics.crestBefore), a: fmtNum(dynamics.crestAfter) })}</span>
          ) : null}
        </Row>

        <Row label={t("decisions.stereo")} status={stereo.status} t={t}>
          {stereo.status === "preserved"
            ? t("decisions.stereo.preserved")
            : [
                stereo.lowEndMonoHz ? t("decisions.stereo.mono", { hz: formatHz(stereo.lowEndMonoHz) }) : null,
                stereo.sideGainDb != null ? t("decisions.stereo.side", { db: fmtDb(stereo.sideGainDb) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </Row>

        <Row label={t("decisions.loudness")} t={t}>
          {loudness.beforeLufs != null && loudness.afterLufs != null ? (
            <span className="block">
              <span className="font-mono text-text-primary">{t("decisions.loud.change", { b: fmtNum(loudness.beforeLufs), a: fmtNum(loudness.afterLufs) })}</span>
              {loudness.changeLu != null ? <span className="ml-2 whitespace-nowrap font-mono">({fmtDb(loudness.changeLu)} LU)</span> : null}
            </span>
          ) : null}
          {loudness.truePeakBefore != null && loudness.truePeakAfter != null ? (
            <span className="block text-[12px]">{t("decisions.loud.peak", { b: fmtNum(loudness.truePeakBefore), a: fmtNum(loudness.truePeakAfter) })}</span>
          ) : null}
          {loudness.heldBackForTransients && loudness.preferredLufs != null ? (
            <span className="block text-[12px]">{t("decisions.loud.heldBack", { p: fmtNum(loudness.preferredLufs) })}</span>
          ) : null}
        </Row>

        <Row label={t("decisions.verify")} t={t}>
          <span className="block">{t(verification.passed ? "decisions.verify.passed" : "decisions.verify.failed")}</span>
          {verification.checked ? <span className="block text-[12px]">{t("decisions.verify.improved", { i: verification.improved, n: verification.checked })}</span> : null}
          {verification.backoffApplied ? <span className="block text-[12px]">{t("decisions.verify.backoff")}</span> : null}
        </Row>
      </ul>

      {metrics.length ? (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${detailsId}-details`}
            onClick={() => {
              if (!open) trackEvent("advanced_analysis_opened", { source });
              setOpen((v) => !v);
            }}
            className="btn-secondary btn-sm"
          >
            {t(open ? "decisions.details.hide" : "decisions.details.show")}
          </button>
          {open ? (
            <div id={`${detailsId}-details`} className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-[12px] sm:text-[13px]">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-[0.1em] text-text-secondary">
                    <th scope="col" className="py-2 pr-3 font-medium">{t("decisions.col.metric")}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t("result.before")}</th>
                    <th scope="col" className="py-2 text-right font-medium">{t("result.after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.key} className="border-b border-border-subtle last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-text-primary">
                        {t(`decisions.metric.${m.key}`)}
                        {m.unit ? <span className="ml-1 text-text-secondary">({m.unit})</span> : null}
                      </th>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-mono text-text-secondary">{Number.isFinite(m.before) ? fmtNum(m.before, m.key === "correlation" ? 2 : 1) : "—"}</td>
                      <td className="whitespace-nowrap py-2 text-right font-mono text-text-primary">{Number.isFinite(m.after) ? fmtNum(m.after, m.key === "correlation" ? 2 : 1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
