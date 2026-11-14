import { DEMO_MASTER } from "@/content/demoMaster";

// Real before/after clips — the homepage "hear the difference" section and
// the matching /master/<genre> page. Files live in /public/audio/demos/.
// Audio is never fabricated: add an entry only for a real render of the
// current engine on a track you have the right to publish (own work or
// CC-BY), produced with backend/scripts/render_homepage_demo.py.
//
//   genreKey         the /master/<genre> slug this demo appears on
//   loudnessGapDb    master LUFS − mix LUFS, from the render's own report.
//                    The player turns the master down by this much so the
//                    A/B compares tone and dynamics, not volume.
//
// The first entry is the homepage's main demo (HearTheDifference.jsx);
// any further entries also appear in the homepage's "more demos" grid.
export const BEFORE_AFTER_DEMOS = [
  {
    genre: "Pop",
    genreKey: "pop",
    label: "Pop — \"Maya\"",
    beforeSrc: "/audio/demos/maya-before.mp3",
    afterSrc: "/audio/demos/maya-after.mp3",
    loudnessGapDb: DEMO_MASTER.after_lufs - DEMO_MASTER.before_lufs,
  },
  // Next, in order of expected demand (see docs/audits/GROWTH_PLAN.md §4):
  // { genre: "Hip-Hop", genreKey: "hiphop", label: "...", beforeSrc: "/audio/demos/<name>-before.mp3", afterSrc: "/audio/demos/<name>-after.mp3", loudnessGapDb: <after − before LUFS> },
  // { genre: "EDM", genreKey: "edm", ... },
];

export function demoForGenre(genreKey) {
  return BEFORE_AFTER_DEMOS.find((demo) => demo.genreKey === genreKey) || null;
}
