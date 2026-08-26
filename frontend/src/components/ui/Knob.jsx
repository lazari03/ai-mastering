"use client";

import { useEffect, useRef, useState } from "react";

// Real drag-to-adjust rotary knob, not a decorative image — maps min..max
// onto a 270° sweep (-135°..+135°, like real hardware) and reports back
// through the same onChange(number) every plain number input in this app
// already uses. Vertical drag changes the value (standard for on-screen
// knobs — a true rotary drag is fussier with a mouse); arrow keys nudge by
// one step for accessibility; clicking the numeric readout below the knob
// swaps it for a real text input so an exact value can be typed rather
// than dragged or nudged one step at a time — Enter/blur commits (clamped
// to min/max), Escape cancels without changing anything.
function arcPath(startDeg, endDeg, radius) {
  const cx = 50;
  const cy = 50;
  const toXY = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };
  const start = toXY(startDeg);
  const end = toXY(endDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// 5 reference ticks (min, 1/4, half, 3/4, max) around the rim, like the
// printed marks on a real hardware knob — purely visual, not interactive.
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function formatValue(value, step) {
  const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  return Number(value.toFixed(decimals));
}

export default function Knob({ label, unit, value, min, max, step = 1, onChange, size = 40 }) {
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const dragState = useRef({ startY: 0, startValue: 0 });
  const inputRef = useRef(null);

  const beginEdit = () => {
    setDraftText(String(formatValue(value, step)));
    setEditing(true);
  };

  const commitEdit = () => {
    const parsed = Number(draftText);
    if (Number.isFinite(parsed)) {
      onChange(formatValue(clamp(Math.round(parsed / step) * step, min, max), step));
    }
    setEditing(false);
  };

  const pct = clamp((value - min) / (max - min), 0, 1);
  const angle = -135 + pct * 270;

  const handlePointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    dragState.current = { startY: event.clientY, startValue: value };

    const handleMove = (moveEvent) => {
      const deltaY = dragState.current.startY - moveEvent.clientY; // drag up = increase
      const sensitivity = (max - min) / 150; // full range over ~150px of drag
      const next = clamp(dragState.current.startValue + deltaY * sensitivity, min, max);
      onChange(formatValue(Math.round(next / step) * step, step));
    };
    const handleUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      onChange(formatValue(clamp(value + step, min, max), step));
      event.preventDefault();
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      onChange(formatValue(clamp(value - step, min, max), step));
      event.preventDefault();
    } else if (event.key === "Enter" || event.key === " ") {
      beginEdit();
      event.preventDefault();
    }
  };

  const handleEditKeyDown = (event) => {
    if (event.key === "Enter") {
      commitEdit();
      event.preventDefault();
    } else if (event.key === "Escape") {
      setEditing(false);
      event.preventDefault();
    }
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none" style={{ width: size + 8 }}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        title={`${label}: ${formatValue(value, step)}${unit || ""}`}
        className={`relative flex touch-none items-center justify-center rounded-full border outline-none transition-transform ${
          dragging ? "scale-110 cursor-grabbing" : "cursor-grab hover:scale-105"
        }`}
        style={{
          width: size,
          height: size,
          background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.16), rgba(0,0,0,0.5) 65%)",
          borderColor: dragging ? "var(--brass)" : "rgba(255,255,255,0.15)",
          boxShadow: dragging
            ? "0 0 10px 1px rgba(223,201,90,0.55), inset 0 1px 2px rgba(255,255,255,0.15)"
            : "0 1px 3px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.1)",
        }}
      >
        <svg className="pointer-events-none absolute inset-0 overflow-visible" viewBox="0 0 100 100">
          {TICK_FRACTIONS.map((f) => {
            const deg = -135 + f * 270;
            const rad = ((deg - 90) * Math.PI) / 180;
            const x1 = 50 + 49 * Math.cos(rad);
            const y1 = 50 + 49 * Math.sin(rad);
            const x2 = 50 + 42 * Math.cos(rad);
            const y2 = 50 + 42 * Math.sin(rad);
            return <line key={f} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.18)" strokeWidth="2.5" strokeLinecap="round" />;
          })}
          <path d={arcPath(-135, 135, 36)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" strokeLinecap="round" />
          <path d={arcPath(-135, angle, 36)} fill="none" stroke="var(--brass)" strokeWidth="7" strokeLinecap="round" style={{ filter: dragging ? "drop-shadow(0 0 3px var(--brass))" : "none" }} />
        </svg>
        <div
          className="absolute rounded-full bg-white"
          style={{
            width: 2,
            height: size * 0.3,
            top: "14%",
            transformOrigin: `50% ${size * 0.36}px`,
            transform: `rotate(${angle}deg)`,
            boxShadow: dragging ? "0 0 4px rgba(255,255,255,0.9)" : "none",
          }}
        />
      </div>

      {editing ? (
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          value={draftText}
          min={min}
          max={max}
          step={step}
          onChange={(event) => setDraftText(event.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={commitEdit}
          aria-label={`${label} value`}
          className="w-[52px] rounded border border-brass/50 bg-black/60 px-0.5 py-px text-center text-[10px] font-semibold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      ) : (
        <button
          type="button"
          onClick={beginEdit}
          title="Click to type an exact value"
          className="whitespace-nowrap rounded text-[10px] font-semibold leading-tight text-white outline-none hover:text-brass focus-visible:text-brass"
        >
          {formatValue(value, step)}
          {unit ? <span className="text-zinc-500">{unit}</span> : null}
        </button>
      )}
      <span className="max-w-[56px] truncate text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-zinc-500">{label}</span>
    </div>
  );
}
