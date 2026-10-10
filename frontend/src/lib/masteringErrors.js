// Stable API error codes (backend X-Error-Code / payload.code) that have a
// localized message under "masterError.<code>" in i18n.js. Anything else
// falls back to the server's own detail text, so an unrecognised code never
// blanks the message.
export const MASTERING_ERROR_CODES = [
  "at_capacity",
  "queue_timeout",
  "processing_timeout",
  "cancelled",
  "worker_crashed",
  "too_large_for_server",
  "too_long",
  "stems_too_long",
  "invalid_audio",
  "stems_unavailable",
  "render_failed",
  "duplicate_job",
  "billing_unavailable",
  "master_reservation_conflict",
  "stem_reservation_conflict",
  "reservation_expired",
  "no_file",
  "no_genre",
];

export function masteringErrorText(t, error, code) {
  if (code && MASTERING_ERROR_CODES.includes(code)) return t(`masterError.${code}`);
  return error;
}

// Localizes engine source warnings. Each warning string may have a twin in
// processing_applied.source_warning_codes ({code, params, text}); matched by
// text so older job records (no codes) and any unknown code keep showing the
// original English sentence instead of a raw key.
export function localizeSourceWarnings(t, warnings, processingApplied) {
  const coded = Array.isArray(processingApplied?.source_warning_codes) ? processingApplied.source_warning_codes : [];
  return (warnings || []).map((text) => {
    const item = coded.find((c) => c && c.text === text);
    if (!item?.code) return text;
    const key = `warn.${item.code}`;
    const params = { ...(item.params || {}) };
    if (params.channel === "left" || params.channel === "right") params.channel = t(`warn.channel.${params.channel}`);
    if (item.code === "quieter_than_upload") {
      const reasons = (params.reasons || []).map((r) => t(`warn.quieter.${r.code}`, r.params || {}));
      params.reasons = reasons.length ? `: ${reasons.join("; ")}.` : t("warn.quieter.default");
    }
    const out = t(key, params);
    return out === key ? text : out;
  });
}
