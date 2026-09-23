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
    h1: "Find the Key of Any Song",
    lead: "Upload a track and get its musical key — tonic and major or minor — detected from the audio itself, with a confidence reading, the tempo and the chord progression from the same pass.",
    education: [
      {
        title: "How the key is detected",
        paragraphs: [
          "The analysis runs Essentia's KeyExtractor over the whole file. It builds a pitch-class profile — how much energy each of the twelve notes carries across the track — and compares it against major and minor key templates. The best match becomes the key; how clearly it wins becomes the confidence reading.",
          "Because it listens to the whole track rather than the opening bars, a long intro in a different mode or a single borrowed chord rarely moves the answer. A song that genuinely modulates reports the key that dominates overall.",
        ],
      },
      {
        title: "Major, minor and relative keys",
        paragraphs: [
          "Every major key shares its notes with a relative minor: C major and A minor, G major and E minor. When a song sits between the two — a minor-sounding verse over a major chorus — the detector can land on either. The chord progression beside the key usually settles it: the chord the song resolves to is the tonic.",
        ],
        list: [
          "Low confidence usually means an ambiguous tonal centre, heavy distortion or very little harmonic content (drum loops, spoken word).",
          "A result a fifth away from what you expected (G instead of C) is the most common near-miss — check which chord the phrases end on.",
        ],
      },
      {
        title: "What to do with the key",
        paragraphs: [
          "Transpose a cover to fit your vocal range, pick samples and loops that sit in the same key, or plan a DJ set around compatible keys. Once the arrangement is settled, the same file can go through adaptive mastering without re-uploading anything elsewhere.",
        ],
      },
    ],
    label: "Song Key Finder",
    headline: "Song Key Finder — Find the Key of Any Track Instantly",
    description:
      "Upload a song and get its musical key detected automatically — for transposing, singing along, DJ set planning, or matching a cover to your vocal range. Completely free, no card required.",
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
    h1: "Find the BPM of Any Song",
    lead: "Upload a track and get its tempo detected from the actual beats, with a confidence reading so you know how far to trust it — plus the key and chords from the same analysis.",
    education: [
      {
        title: "How tempo detection works",
        paragraphs: [
          "The analysis runs Essentia's RhythmExtractor2013 in multi-feature mode: several onset detectors track where beats land across the whole file, and the tempo that best explains those beats is reported. Alongside it comes a confidence reading — high when the beat tracking agrees with itself throughout, low when the pulse is ambiguous.",
        ],
      },
      {
        title: "Half-time, double-time and tempo changes",
        paragraphs: [
          "Tempo detectors can hear the same groove at two valid speeds: a 140 BPM trap beat is also a 70 BPM half-time feel, and a slow ballad can read as double its tempo. If the number looks off by exactly a factor of two, it is almost always this, not a misread.",
          "Songs recorded without a click, rubato intros and tracks with deliberate tempo changes get one dominant tempo for the whole file. That is the right number for setting a session tempo, but check the sections that drift before gridding them.",
        ],
        list: [
          "High confidence: a steady, programmed or click-tracked pulse — safe to beatmatch or grid.",
          "Medium: a clear groove with some push and pull — confirm with a quick tap-along.",
          "Low: sparse, free-time or ambient material — treat the value as a starting point.",
        ],
      },
      {
        title: "Using the BPM",
        paragraphs: [
          "Set a click track to rehearse against a reference, match a sample or loop to your session tempo, or beatmatch a DJ set. Tempo also shapes how a master should feel: a fast, dense track usually wants tighter transient control than a slow, open one, which is one of the signals adaptive mastering reads from the audio.",
        ],
      },
    ],
    label: "BPM Finder",
    headline: "BPM Finder — Detect the Tempo of Any Song",
    description:
      "Upload a track and get its exact BPM detected automatically — for beatmatching, syncing samples, or setting a click track tempo. Completely free, no card required.",
    keywords: ["bpm finder", "tempo finder", "find bpm of a song", "bpm detector online", "tempo detector"],
    heroImage: "https://images.pexels.com/photos/210922/pexels-photo-210922.jpeg?auto=compress&cs=tinysrgb&w=1200",
    heroAlt: "A guitarist performing live on stage",
    heroCaption: "BPM Finder",
    heroTitle: "What's this track's actual tempo?",
    intro:
      "Upload a track and get its BPM detected from the real rhythmic content — not a rounded guess. Built for DJs beatmatching a set, producers syncing a sample or loop to a session tempo, and anyone setting a click track to play along with a reference.",
    howItWorks: [
      ["01", "Upload the track", "Any format — works on a full song, a loop, or a short clip with a clear rhythmic pulse."],
      ["02", "Tempo detection runs", "Real audio analysis (Essentia's RhythmExtractor2013) tracks beats across the whole file, not a tap-along estimate."],
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
        answer: "Yes — completely free, no trial limit, no card, no subscription.",
      },
    ],
    crossLinkLabel: "Once you know the tempo, master the track",
  },
  "chord-progression-finder": {
    h1: "Find the Chord Progression of Any Song",
    lead: "Upload a track and get its chords in order, timed to the audio and synced to playback — with the key and BPM from the same pass.",
    education: [
      {
        title: "How chord recognition works",
        paragraphs: [
          "Chords come from madmom's deep-chroma recogniser, a neural network trained on annotated recordings. It turns the audio into a pitch-class representation that ignores timbre and drums, then decodes the most likely sequence of chords over time. Changes shorter than a third of a second are folded into their neighbours so the chart reads as a progression, not flicker.",
        ],
      },
      {
        title: "Reading the result",
        paragraphs: [
          "Each chord is reported as a major or minor triad with a start and end time. Repeating patterns — the four chords of a chorus, the turnaround at the end of a verse — show up as repeating blocks, which is usually the fastest way to learn a song's form. \"N\" marks passages with no clear harmony, such as a drum break or a spoken intro.",
        ],
        list: [
          "Extensions (7ths, 9ths, suspended chords) are reported as their underlying triad — add the colour by ear.",
          "Slash chords and bass inversions read as their root chord.",
          "Dense, fast-moving jazz harmony is the hardest case for any automated recogniser.",
        ],
      },
      {
        title: "From progression to finished track",
        paragraphs: [
          "Use the chart to learn a cover, write a new part over an existing progression, or transcribe a reference. When your own version is recorded and mixed, the same account masters it — adaptively, from what the audio needs.",
        ],
      },
    ],
    label: "Chord Progression Finder",
    headline: "Chord Progression Finder — Get the Full Chord Chart",
    description:
      "Upload a song and get its complete chord progression detected automatically, section by section — for learning a song by ear, charting a cover, or transcribing a reference. Completely free, no card required.",
    keywords: ["chord progression finder", "find chords in a song", "chord chart generator", "chord finder online", "song chord finder"],
    heroImage: "https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=1200",
    heroAlt: "Close-up of a hand forming a chord on an acoustic guitar's fretboard",
    heroCaption: "Chord Progression Finder",
    heroTitle: "What are the actual chords in this song?",
    intro:
      "Upload a track and get the full chord progression back, section by section, synced to playback — not a static chart you have to line up by ear. Built for guitarists and pianists learning a song, cover bands charting a setlist, and anyone transcribing a reference track.",
    howItWorks: [
      ["01", "Upload the track", "Any format works — a studio recording, a rough phone capture, or a reference track."],
      ["02", "Chord detection runs", "Real audio analysis (madmom for chords, Essentia for key and tempo) maps the progression chord-by-chord across the whole track, not just the first few bars."],
      ["03", "Play along", "Chords sync to playback in real time — scroll through the full progression as the track plays."],
    ],
    faq: [
      {
        question: "Does it handle complex chords, or just basic major/minor?",
        answer:
          "It reports every chord as its major or minor triad — a Cmaj7 reads as C, an Am7 as Am. That covers the harmonic skeleton of most pop, rock and acoustic material; 7ths, suspensions and other extensions are the detail to add by ear, and dense jazz voicings are the hardest case for any automated detection.",
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
