// Content for /song-key-finder, /bpm-finder, /chord-progression-finder —
// each targets a distinct, narrower search than "/chord-detector" itself
// (which ranks, if it ranks at all, for the umbrella "chord detector"
// term), all three funneling into the same underlying tool. Same
// discipline as content/genrePages.js: genuinely distinct copy per page
// angled at what that specific searcher actually wants (a key, a tempo, a
// full progression), not one template with the keyword swapped in — that
// kind of doorway-page duplication is exactly what gets pages deindexed
// rather than ranked.
export const TOOL_LANDING_PAGES = {
  "song-key-finder": {
    label: "Song Key Finder",
    headline: "Song Key Finder — Find the Key of Any Track Instantly",
    description:
      "Upload a song and get its musical key detected automatically — for transposing, singing along, DJ set planning, or matching a cover to your vocal range. 3 free, no card required.",
    keywords: ["song key finder", "find the key of a song", "what key is this song in", "audio key detector", "key finder online"],
    heroImage: "https://images.pexels.com/photos/1246437/pexels-photo-1246437.jpeg?auto=compress&cs=tinysrgb&w=1200",
    heroAlt: "Hands playing a chord on a piano",
    heroCaption: "Song Key Finder",
    heroTitle: "What key is this song actually in?",
    intro:
      "Point it at a track and get the musical key back — the real detected key, not a guess from the title or a database lookup. Useful for transposing a cover into your vocal range, planning a harmonically-compatible DJ set, or just settling an argument about whether a song is major or minor.",
    howItWorks: [
      ["01", "Upload the track", "Any format, any source — a studio recording, a rough phone capture, or a reference track works the same."],
      ["02", "Key detection runs", "Real audio analysis (essentia) estimates the tonal center from the actual harmonic content, not metadata."],
      ["03", "Get the key back", "Major or minor, with the chord progression alongside it if you want the full picture, not just the key."],
    ],
    faq: [
      {
        question: "How accurate is the key detection?",
        answer:
          "Estimated from the actual audio's harmonic content, not a lookup — genuinely reliable on most recordings. Highly modulated tracks (key changes mid-song) or heavily distorted mixes are the cases where it's more of a starting point than a certainty.",
      },
      {
        question: "Does it work on a rough recording, not just a finished master?",
        answer: "Yes — a phone recording, a demo, or a reference track all work; the file doesn't need to be mixed or mastered first.",
      },
      {
        question: "Can I also get the chords, not just the key?",
        answer: "Yes — the same upload returns the full chord progression alongside the key and BPM, all from one analysis pass.",
      },
    ],
    crossLinkLabel: "Once you know the key, master the track",
  },
  "bpm-finder": {
    label: "BPM Finder",
    headline: "BPM Finder — Detect the Tempo of Any Song",
    description:
      "Upload a track and get its exact BPM detected automatically — for beatmatching, syncing samples, or setting a click track tempo. 3 free, no card required.",
    keywords: ["bpm finder", "tempo finder", "find bpm of a song", "bpm detector online", "tempo detector"],
    heroImage: "https://images.pexels.com/photos/210922/pexels-photo-210922.jpeg?auto=compress&cs=tinysrgb&w=1200",
    heroAlt: "A guitarist performing live on stage",
    heroCaption: "BPM Finder",
    heroTitle: "What's this track's actual tempo?",
    intro:
      "Upload a track and get its BPM detected from the real rhythmic content — not a rounded guess. Built for DJs beatmatching a set, producers syncing a sample or loop to a session tempo, and anyone setting a click track to play along with a reference.",
    howItWorks: [
      ["01", "Upload the track", "Any format — works on a full song, a loop, or a short clip with a clear rhythmic pulse."],
      ["02", "Tempo detection runs", "Real audio analysis (madmom) tracks the beat grid from the actual audio, not a tap-along estimate."],
      ["03", "Get the BPM back", "The detected tempo, plus key and chords from the same upload if the track has harmonic content too."],
    ],
    faq: [
      {
        question: "Does it handle tracks with tempo changes?",
        answer:
          "It reports the dominant tempo detected across the track — for a song with a genuine tempo change (a rubato intro, a double-time breakdown), that's the section-by-section detail to listen for rather than trust a single BPM number blindly.",
      },
      {
        question: "Will it work on a drum loop or sample, not just a full song?",
        answer: "Yes — any audio with a clear rhythmic pulse works, not just complete songs.",
      },
      {
        question: "Is this free?",
        answer: "3 free detections, lifetime, no card required. After that it's pay-per-song, a Chords Monthly subscription, or unlimited on All-Access.",
      },
    ],
    crossLinkLabel: "Once you know the tempo, master the track",
  },
  "chord-progression-finder": {
    label: "Chord Progression Finder",
    headline: "Chord Progression Finder — Get the Full Chord Chart",
    description:
      "Upload a song and get its complete chord progression detected automatically, section by section — for learning a song by ear, charting a cover, or transcribing a reference. 3 free, no card required.",
    keywords: ["chord progression finder", "find chords in a song", "chord chart generator", "chord finder online", "song chord finder"],
    heroImage: "https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=1200",
    heroAlt: "Close-up of a hand forming a chord on an acoustic guitar's fretboard",
    heroCaption: "Chord Progression Finder",
    heroTitle: "What are the actual chords in this song?",
    intro:
      "Upload a track and get the full chord progression back, section by section, synced to playback — not a static chart you have to line up by ear. Built for guitarists and pianists learning a song, cover bands charting a setlist, and anyone transcribing a reference track.",
    howItWorks: [
      ["01", "Upload the track", "Any format works — a studio recording, a rough phone capture, or a reference track."],
      ["02", "Chord detection runs", "Real audio analysis (madmom + essentia) maps the progression chord-by-chord across the whole track, not just the first few bars."],
      ["03", "Play along", "Chords sync to playback in real time — scroll through the full progression as the track plays."],
    ],
    faq: [
      {
        question: "Does it handle complex chords, or just basic major/minor?",
        answer:
          "It detects the actual harmony present, including 7ths and other extensions where the audio supports it — genuinely good on most pop, rock, and acoustic material. Dense jazz voicings are the harder case, same as for any automated chord detection.",
      },
      {
        question: "Do I need to know music theory to use this?",
        answer: "No — the progression is shown as plain chord names synced to the audio, nothing to interpret from a spectrogram or lead sheet.",
      },
      {
        question: "Can I get the key and BPM too, or just the chords?",
        answer: "All three come back from the same upload — key, BPM, and the full chord progression, in one analysis pass.",
      },
    ],
    crossLinkLabel: "Once you have the chords, master the track",
  },
};

export const TOOL_LANDING_KEYS = Object.keys(TOOL_LANDING_PAGES);
