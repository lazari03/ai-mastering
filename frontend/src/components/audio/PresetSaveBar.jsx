"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";
import { useMasteringStore } from "@/store/masteringStore";

// Save the console's current Quick-mode settings as a user preset, or —
// after applying one of your presets and changing something — write the
// changes back to it ("Update") or fork them ("Save as new").
export default function PresetSaveBar({ onOpenPresets }) {
  const { t } = useLanguage();
  const {
    presets,
    basePreset,
    selectedPreset,
    selectedGenre,
    isSavingPreset,
    presetSaveError,
    saveCurrentAsPreset,
    updateBasePreset,
    clearPresetSaveError,
  } = useMasteringStore();

  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [flash, setFlash] = useState("");

  const base = presets.find((p) => p.name === basePreset) || null;
  const edited = Boolean(base) && selectedPreset !== basePreset;
  const builtIn = presets.find((p) => p.name === selectedPreset && !p.custom) || null;

  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(""), 2600);
    return () => clearTimeout(id);
  }, [flash]);

  const startNaming = () => {
    clearPresetSaveError();
    const source = base || builtIn;
    setName(source ? t("presetBar.copyName", { name: source.display_name || source.name }) : "");
    setNaming(true);
  };

  const doSave = async () => {
    if (!name.trim()) return;
    const saved = await saveCurrentAsPreset(name.trim());
    if (saved) {
      setNaming(false);
      setFlash(t("presetBar.savedAs", { name: saved.display_name }));
    }
  };

  const doUpdate = async () => {
    const saved = await updateBasePreset();
    if (saved) setFlash(t("presetBar.updated", { name: saved.display_name }));
  };

  const btn = "rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition disabled:cursor-not-allowed disabled:opacity-45";
  const primary = `${btn} bg-accent text-white hover:opacity-90`;
  const secondary = `${btn} border border-border-subtle bg-black/[0.045] text-text-primary hover:border-text-primary/30`;

  let status;
  if (base && edited) status = t("presetBar.editedFrom", { name: base.display_name });
  else if (base) status = t("presetBar.using", { name: base.display_name });
  else if (builtIn) status = t("presetBar.usingBuiltIn", { name: builtIn.display_name });
  else status = t("presetBar.unsaved");

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 flex min-w-0 items-center gap-1.5 text-[11px] text-text-secondary">
          {edited ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" /> : null}
          <span className="truncate">{flash || status}</span>
        </p>
        {!naming ? (
          <div className="flex flex-wrap gap-2">
            {base && edited ? (
              <button type="button" onClick={doUpdate} disabled={isSavingPreset} className={primary}>
                {isSavingPreset ? <Spinner size={10} /> : t("presetBar.update", { name: base.display_name })}
              </button>
            ) : null}
            <button type="button" onClick={startNaming} disabled={isSavingPreset || !selectedGenre} className={base && edited ? secondary : base ? secondary : primary}>
              {base || builtIn ? t("presetBar.saveAsNew") : t("presetBar.save")}
            </button>
            {onOpenPresets ? (
              <button type="button" onClick={onOpenPresets} className={`${btn} text-text-secondary hover:text-accent`}>
                {t("presetBar.manage")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {naming ? (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            doSave();
          }}
        >
          <input
            autoFocus
            type="text"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("presetBar.namePlaceholder")}
            aria-label={t("presetBar.namePlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-black/[0.045] px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={isSavingPreset || !name.trim()} className={`${primary} flex-1 sm:flex-none`}>
              {isSavingPreset ? <Spinner size={10} /> : t("presetBar.saveConfirm")}
            </button>
            <button type="button" onClick={() => setNaming(false)} className={`${secondary} flex-1 sm:flex-none`}>
              {t("presetBar.cancel")}
            </button>
          </div>
        </form>
      ) : null}

      {presetSaveError ? <p className="m-0 mt-2 text-[11px] text-red-700">{presetSaveError}</p> : null}
    </div>
  );
}
