export const calls = [];
const noop = async () => ({});
export const getCategories = noop, getGenres = noop, getMixPresets = noop, getStyles = noop, getTags = noop;
export const postImportPreset = noop, deleteCustomPreset = noop, createUserPreset = noop, updateUserPreset = noop;
export const postCodecPreview = noop, postAnalyzeAudio = noop, postPreviewParams = noop;
export async function postMaster(formData) {
  calls.push(formData);
  return { job_id: "job1", download_url: "/download/job1.wav" };
}
export async function toAuthedDownloadUrl(u) { return u; }
