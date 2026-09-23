"use client";

import { useEffect, useMemo, useState } from "react";

import DirectionControls from "@/components/audio/DirectionControls";
import StatePanel from "@/components/site/StatePanel";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";
import { DEFAULT_DIRECTION, TWEAK_KEYS, TONE_CURVES, curvePath, tweaksForDirection, directionFromPreset } from "@/domain/mastering/directions";
import { useLanguage } from "@/lib/i18n";
import { useMasteringStore } from "@/store/masteringStore";

const label = (s) => String(s || "").replaceAll("_", " ");

function emptyDraft(genre) {
  return {
    name: "",
    description: "",
    genre: genre || "pop",
    style: "modern",
    tags: [],
    category: "",
    flavour: "",
    direction: { ...DEFAULT_DIRECTION },
    tweaks: tweaksForDirection(DEFAULT_DIRECTION),
  };
}

function draftFromPreset(preset, nameOverride) {
  const tweaks = Object.fromEntries(TWEAK_KEYS.map((k) => [k, Number(preset.tweaks?.[k]) || 0]));
  return {
    name: nameOverride ?? preset.display_name ?? preset.name,
    description: preset.description || "",
    genre: preset.genre || "pop",
    style: preset.style || "modern",
    tags: preset.tags || [],
    category: preset.category || "",
    flavour: preset.flavour || "",
    direction: directionFromPreset(preset, tweaks),
    tweaks,
  };
}

// 7 centre-zero bars: what the preset actually sends the engine.
function TweakBars({ tweaks }) {
  return (
    <div className="flex h-9 shrink-0 items-stretch gap-1" aria-hidden="true">
      {TWEAK_KEYS.map((key) => {
        const v = Math.max(-1, Math.min(1, Number(tweaks?.[key]) || 0));
        const pct = Math.abs(v) * 50;
        return (
          <span key={key} className="relative w-1.5 overflow-hidden rounded-full bg-black/[0.06]">
            <span className="absolute inset-x-0 top-1/2 h-px bg-black/[0.12]" />
            {pct ? <span className="absolute inset-x-0 rounded-full bg-accent" style={v >= 0 ? { bottom: "50%", height: `${pct}%` } : { top: "50%", height: `${pct}%` }} /> : null}
          </span>
        );
      })}
    </div>
  );
}

function PresetEditor({ initial, editingName, onDone }) {
  const { t } = useLanguage();
  const { genres, styles, tags, categories, flavoursByCategory, presets, isSavingPreset, presetSaveError, upsertUserPreset, clearPresetSaveError } = useMasteringStore();
  const [draft, setDraft] = useState(initial);
  const builtIns = useMemo(() => presets.filter((p) => !p.custom), [presets]);

  useEffect(() => clearPresetSaveError, [clearPresetSaveError]);

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const onDirection = (p) =>
    setDraft((d) => {
      const direction = { ...d.direction, ...p };
      return { ...d, direction, tweaks: tweaksForDirection(direction, d.tweaks) };
    });
  const onTweak = (key, value) =>
    setDraft((d) => ({
      ...d,
      tweaks: { ...d.tweaks, [key]: value },
      direction: key === "loudness" ? d.direction : { ...d.direction, tone: "custom" },
    }));
  const onReset = () => setDraft((d) => ({ ...d, direction: { ...DEFAULT_DIRECTION }, tweaks: tweaksForDirection(DEFAULT_DIRECTION) }));

  const save = async () => {
    const saved = await upsertUserPreset(draft, editingName || "");
    if (saved) onDone(saved);
  };

  const field = "w-full rounded-[10px] border border-border-subtle bg-black/[0.045] p-2.5 text-[13px] text-text-primary";
  const chip = (active) =>
    `rounded-full border px-3 py-1.5 text-[11px] font-semibold lowercase transition ${
      active ? "border-accent bg-accent/[0.12] text-accent" : "border-border-subtle bg-black/[0.03] text-text-secondary hover:border-text-primary/30"
    }`;

  return (
    <form
      className="glass-panel rounded-2xl p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h2 className="m-0 text-base font-bold text-text-primary">{editingName ? t("myPresets.editTitle") : t("myPresets.newTitle")}</h2>

      {!editingName && builtIns.length ? (
        <label className="mt-3 block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-text-secondary">{t("myPresets.startFrom")}</span>
          <select
            defaultValue=""
            onChange={(e) => {
              const src = builtIns.find((p) => p.name === e.target.value);
              if (src) setDraft((d) => ({ ...draftFromPreset(src, d.name), description: d.description }));
            }}
            className={field}
          >
            <option value="">{t("myPresets.startBlank")}</option>
            {builtIns.map((p) => (
              <option key={p.name} value={p.name}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-text-secondary">{t("myPresets.name")}</span>
          <input required maxLength={60} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder={t("presetBar.namePlaceholder")} className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-text-secondary">{t("myPresets.description")}</span>
          <input maxLength={200} value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder={t("myPresets.descriptionPlaceholder")} className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-text-secondary">{t("console.genre")}</span>
          <select value={draft.genre} onChange={(e) => patch({ genre: e.target.value })} className={`${field} capitalize`}>
            {genres.map((g) => (
              <option key={g} value={g}>
                {label(g)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-text-secondary">{t("console.masteringStyle")}</span>
          <select value={draft.style} onChange={(e) => patch({ style: e.target.value })} className={`${field} capitalize`}>
            {styles.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-text-secondary">{t("console.masteringObjective")}</span>
          <select value={draft.category} onChange={(e) => patch({ category: e.target.value, flavour: "" })} className={`${field} capitalize`}>
            <option value="">{t("console.objectiveAuto")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-text-secondary">{t("myPresets.flavour")}</span>
          <select
            value={draft.flavour}
            disabled={!draft.category}
            onChange={(e) => patch({ flavour: e.target.value })}
            className={`${field} capitalize disabled:opacity-45`}
          >
            <option value="">{t("console.objectiveAuto")}</option>
            {(flavoursByCategory[draft.category] || []).map((f) => (
              <option key={f} value={f}>
                {label(f)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3.5">
        <span className="mb-2 block text-[11px] uppercase tracking-[0.1em] text-text-secondary">{t("console.tags")}</span>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const on = draft.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => patch({ tags: on ? draft.tags.filter((x) => x !== tag) : [...draft.tags, tag] })}
                className={chip(on)}
              >
                {label(tag)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border-subtle bg-black/[0.03] p-3">
        <DirectionControls direction={draft.direction} tweaks={draft.tweaks} onDirection={onDirection} onTweak={onTweak} onReset={onReset} idPrefix="editor-dir" defaultOpen />
      </div>

      {presetSaveError ? <p className="m-0 mt-3 text-[12px] text-red-700">{presetSaveError}</p> : null}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => onDone(null)} className="rounded-lg border border-border-subtle bg-black/[0.045] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-primary hover:border-text-primary/30">
          {t("presetBar.cancel")}
        </button>
        <button type="submit" disabled={isSavingPreset || !draft.name.trim()} className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white hover:opacity-90 disabled:opacity-45">
          {isSavingPreset ? <Spinner size={11} /> : null}
          {editingName ? t("myPresets.saveChanges") : t("myPresets.create")}
        </button>
      </div>
    </form>
  );
}

export default function MyPresetsPanel({ onNavigate }) {
  const { t } = useLanguage();
  const { presets, isBootstrapping, genres, selectedGenre, bootstrap, setPreset, deletePreset } = useMasteringStore();
  const [editor, setEditor] = useState(null); // { initial, editingName }
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deleting, setDeleting] = useState("");

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const mine = useMemo(
    () => presets.filter((p) => p.custom).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))),
    [presets]
  );

  const use = (preset) => {
    setPreset(preset.name);
    onNavigate?.("master");
  };

  const remove = async (name) => {
    setDeleting(name);
    await deletePreset(name);
    setDeleting("");
    setConfirmDelete("");
  };

  if (isBootstrapping && !genres.length) return <LoadingBlock />;

  return (
    <div className="mx-auto w-full max-w-[960px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[26px]">{t("myPresets.title")}</h1>
          <p className="mt-2 max-w-[60ch] text-sm text-text-secondary">{t("myPresets.subtitle")}</p>
        </div>
        {!editor ? (
          <button
            type="button"
            onClick={() => setEditor({ initial: emptyDraft(selectedGenre || genres[0]), editingName: "" })}
            className="rounded-lg bg-accent px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white hover:opacity-90"
          >
            + {t("myPresets.new")}
          </button>
        ) : null}
      </div>

      {editor ? (
        <div className="mt-5">
          <PresetEditor key={editor.editingName || "new"} initial={editor.initial} editingName={editor.editingName} onDone={() => setEditor(null)} />
        </div>
      ) : null}

      {!editor && !mine.length ? (
        <StatePanel
          title={t("myPresets.emptyTitle")}
          body={t("myPresets.emptyBody")}
          compact
          actions={[{ label: t("myPresets.new"), onClick: () => setEditor({ initial: emptyDraft(selectedGenre || genres[0]), editingName: "" }) }]}
        />
      ) : null}

      {!editor && mine.length ? (
        <ul className="mt-5 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {mine.map((preset) => {
            const chain = preset.kind === "chain" || Boolean(preset.processing);
            const tone = preset.direction?.tone || (chain ? null : directionFromPreset(preset, preset.tweaks || {}).tone);
            return (
              <li key={preset.name} className="glass-panel flex flex-col rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-black/[0.03] px-1.5 text-accent">
                    {chain ? (
                      <span className="text-[9px] font-bold uppercase tracking-[0.08em]">{t("myPresets.chain")}</span>
                    ) : (
                      <svg viewBox="0 0 64 24" className="h-5 w-full" aria-hidden="true">
                        <path d={curvePath(TONE_CURVES[tone] || TONE_CURVES.custom)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-bold text-text-primary">{preset.display_name}</p>
                    <p className="m-0 mt-0.5 truncate text-[11px] capitalize text-text-secondary">
                      {[label(preset.genre), label(preset.style), preset.category ? label(preset.category) : null].filter(Boolean).join(" · ")}
                    </p>
                    {preset.direction ? (
                      <p className="m-0 mt-0.5 text-[11px] text-text-secondary">
                        {t(`direction.tone.${preset.direction.tone}`)} · {t(`direction.intensity.${preset.direction.intensity}`)} · {t(`direction.loudness.${preset.direction.loudness}`)}
                      </p>
                    ) : null}
                  </div>
                  {!chain ? <TweakBars tweaks={preset.tweaks} /> : null}
                </div>
                {preset.description ? <p className="m-0 mt-2 line-clamp-2 text-[12px] text-text-secondary">{preset.description}</p> : null}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                  <button type="button" onClick={() => use(preset)} className="rounded-lg bg-accent px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white hover:opacity-90">
                    {t("myPresets.use")}
                  </button>
                  {!chain ? (
                    <button
                      type="button"
                      onClick={() => setEditor({ initial: draftFromPreset(preset), editingName: preset.name })}
                      className="rounded-lg border border-border-subtle bg-black/[0.045] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-primary hover:border-text-primary/30"
                    >
                      {t("myPresets.edit")}
                    </button>
                  ) : null}
                  {!chain ? (
                    <button
                      type="button"
                      onClick={() => setEditor({ initial: draftFromPreset(preset, t("presetBar.copyName", { name: preset.display_name })), editingName: "" })}
                      className="rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-secondary hover:text-accent"
                    >
                      {t("myPresets.duplicate")}
                    </button>
                  ) : null}
                  <span className="flex-1" />
                  {confirmDelete === preset.name ? (
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={deleting === preset.name}
                        onClick={() => remove(preset.name)}
                        className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-red-700 disabled:opacity-50"
                      >
                        {deleting === preset.name ? <Spinner size={10} /> : t("myPresets.confirmDelete")}
                      </button>
                      <button type="button" onClick={() => setConfirmDelete("")} className="text-[11px] text-text-secondary hover:text-text-primary">
                        {t("presetBar.cancel")}
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(preset.name)} className="rounded-lg px-2 py-2 text-[11px] font-semibold text-text-secondary hover:text-red-700">
                      {t("console.remove")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-6 text-[11px] leading-relaxed text-text-secondary">{t("myPresets.howItWorks")}</p>
    </div>
  );
}
