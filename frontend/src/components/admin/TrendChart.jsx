"use client";

import { useId, useMemo, useState } from "react";

// A small, dependency-free line/area chart — no charting library pulled in
// for what's fundamentally a handful of trend lines over a date range,
// consistent with this codebase's existing convention of hand-rolled
// SVG/canvas visualizations (SpectrumAnalyzer, LoudnessMeter, Knob) rather
// than reaching for recharts/d3 for a small, fixed set of chart shapes.
//
// Follows the project's dataviz method: a crosshair tracks the nearest X
// and one tooltip lists every series at that point (never per-line hit
// testing), a legend appears only once there are >=2 series, marks are
// 2px round-joined lines with an ~10% opacity area wash on a single
// series, and every value the tooltip shows is also in the raw `points`
// data — nothing is chart-only.
//
// series: [{ key, label, color }]
// points: [{ x: string label (e.g. a date), [seriesKey]: number, ... }]
export default function TrendChart({ series, points, height = 200, formatValue = (v) => v.toLocaleString(), ariaLabel }) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState(null);

  const width = 600; // viewBox unit width — scales via CSS width:100%, not a real pixel size
  const paddingLeft = 40;
  const paddingRight = 12;
  const paddingTop = 12;
  const paddingBottom = 24;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const { maxValue, minValue } = useMemo(() => {
    let max = 0;
    let min = 0;
    for (const p of points) {
      for (const s of series) {
        const v = p[s.key];
        if (typeof v === "number") {
          if (v > max) max = v;
          if (v < min) min = v;
        }
      }
    }
    // A little headroom so the tallest point isn't glued to the top edge.
    return { maxValue: max === 0 ? 1 : max * 1.12, minValue: min };
  }, [points, series]);

  const xFor = (i) => paddingLeft + (points.length > 1 ? (i / (points.length - 1)) * plotWidth : plotWidth / 2);
  const yFor = (v) => paddingTop + plotHeight - ((v - minValue) / (maxValue - minValue || 1)) * plotHeight;

  const linePathFor = (key) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(p[key] || 0).toFixed(2)}`)
      .join(" ");

  const areaPathFor = (key) => `${linePathFor(key)} L ${xFor(points.length - 1).toFixed(2)} ${yFor(minValue).toFixed(2)} L ${xFor(0).toFixed(2)} ${yFor(minValue).toFixed(2)} Z`;

  const gridSteps = 3;
  const gridValues = Array.from({ length: gridSteps + 1 }, (_, i) => minValue + ((maxValue - minValue) * i) / gridSteps);

  const handlePointerMove = (event) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = plotWidth > 0 ? (px - paddingLeft) / plotWidth : 0;
    const index = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, index)));
  };

  const handleKeyDown = (event) => {
    if (hoverIndex == null) return;
    if (event.key === "ArrowRight") setHoverIndex(Math.min(points.length - 1, hoverIndex + 1));
    if (event.key === "ArrowLeft") setHoverIndex(Math.max(0, hoverIndex - 1));
  };

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const isSingleSeries = series.length === 1;

  if (!points.length) return null;

  return (
    <div className="relative">
      {series.length >= 2 ? (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span className="inline-block h-[2px] w-3 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.label}
            </div>
          ))}
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-none"
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        onKeyDown={handleKeyDown}
        onFocus={() => hoverIndex == null && setHoverIndex(points.length - 1)}
      >
        {isSingleSeries ? (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series[0].color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
            </linearGradient>
          </defs>
        ) : null}

        {gridValues.map((v) => (
          <g key={v}>
            <line x1={paddingLeft} x2={width - paddingRight} y1={yFor(v)} y2={yFor(v)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            <text x={paddingLeft - 8} y={yFor(v)} textAnchor="end" dominantBaseline="middle" className="fill-zinc-500" fontSize={9}>
              {formatValue(Math.round(v))}
            </text>
          </g>
        ))}

        {isSingleSeries ? <path d={areaPathFor(series[0].key)} fill={`url(#${gradientId})`} stroke="none" /> : null}

        {series.map((s) => (
          <path key={s.key} d={linePathFor(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {hoverIndex != null ? (
          <line
            x1={xFor(hoverIndex)}
            x2={xFor(hoverIndex)}
            y1={paddingTop}
            y2={paddingTop + plotHeight}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
          />
        ) : null}

        {hoverIndex != null
          ? series.map((s) => (
              <circle key={s.key} cx={xFor(hoverIndex)} cy={yFor(points[hoverIndex][s.key] || 0)} r={4} fill={s.color} stroke="#0b0d10" strokeWidth={2} />
            ))
          : null}
      </svg>

      {hovered ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[120px] rounded-lg border border-white/10 bg-[#151412] p-2.5 shadow-panel"
          style={{
            left: `${Math.min(88, Math.max(2, (hoverIndex / Math.max(1, points.length - 1)) * 100))}%`,
            transform: hoverIndex / Math.max(1, points.length - 1) > 0.75 ? "translateX(-100%)" : "translateX(0)",
          }}
        >
          <p className="m-0 text-[10px] uppercase tracking-[0.08em] text-zinc-500">{hovered.x}</p>
          <div className="mt-1 space-y-0.5">
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="inline-block h-[2px] w-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                  {s.label}
                </span>
                <span className="font-semibold text-white">{formatValue(hovered[s.key] || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
