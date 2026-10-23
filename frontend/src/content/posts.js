// Real editorial content, one per gallery photo on the landing page —
// written for genuine SEO value (search intent + internal linking), not
// thin stubs. English only: mixing legal/marketing content across two
// languages on one URL dilutes SEO signal more than it helps, same
// reasoning as the legal pages.
//
// PARAGRAPH FORMAT: an entry in `paragraphs` is either a plain string, or
// an array of segments for a paragraph containing an inline link, where a
// segment is either a string or { href, text }. Rendered by
// app/blog/[slug]/page.js.
//
// Inline links exist because a contextual link inside the prose, on
// wording that describes where it goes, is worth considerably more than
// the same URL parked in a "related links" list under the article — for
// readers, who follow it at the moment the question occurs to them, and
// for crawlers weighing anchor text in context. Use them where the
// sentence already named the concept; don't bolt them onto wording that
// has to be bent to accommodate a link.
export const POSTS = [
  {
    slug: "what-happens-inside-an-ai-mastering-engine",
    title: "What Really Happens Inside an AI Mastering Engine",
    description:
      "A plain-language walkthrough of the actual DSP chain — EQ, compression, saturation, stereo imaging, and true-peak limiting — behind AI audio mastering, not marketing hand-waving.",
    keywords: ["AI mastering engine", "how does AI mastering work", "digital signal processing mastering", "adaptive DSP"],
    image: "https://images.pexels.com/photos/34538640/pexels-photo-34538640/free-photo-of-professional-audio-mixing-console-in-studio.jpeg?auto=compress&cs=tinysrgb&w=1200",
    captionKey: "gallery.img1.caption",
    datePublished: "2026-08-16",
    readingTime: "5 min read",
    sections: [
      { at: 0, id: "not-magic", title: "\"AI mastering\" is a DSP chain" },
      { at: 1, id: "analysis-first", title: "Analysis comes before processing" },
      { at: 2, id: "the-chain", title: "The processing chain, stage by stage" },
      { at: 3, id: "transparency", title: "A good engine explains itself" },
    ],
    takeaway: "Adaptive mastering means the same genre target produces different moves on different mixes, because every stage is driven by measurements of your audio. If a tool can't show what it measured and changed, be sceptical.",
    paragraphs: [
      "\"AI mastering\" gets thrown around as a marketing term more often than it gets explained. Underneath the phrase, at least in a real engine, is a deterministic chain of digital signal processing (DSP) stages — the same categories of tools a human mastering engineer reaches for, applied automatically based on measurements taken from your actual audio.",
      "The chain typically starts with analysis, not processing: measuring integrated loudness (LUFS), spectral balance across frequency bands, dynamic range, and stereo width before a single sample is touched. Those measurements become the input to every stage that follows, which is what separates \"adaptive\" processing from a fixed preset — the same genre target produces different EQ moves on a bass-heavy mix than on a thin one.",
      [
        "From there, a highpass filter clears sub-bass rumble, a multiband EQ nudges tonal balance toward a genre-appropriate target, a bus compressor manages dynamics, and — depending on the engine — dynamic EQ handles narrowband problems (harsh resonances, muddy low-mids) that a static EQ curve can't. Saturation adds harmonic density where a genre calls for it. Stereo processing adjusts width without collapsing mono compatibility. Finally, a limiter — ideally a true-peak-aware one, which accounts for inter-sample peaks that a simple sample-peak limiter misses — brings the track to ",
        { href: "/mastering-loudness-targets", text: "a target loudness appropriate to the genre" },
        " without introducing audible distortion or clipping.",
      ],
      "None of this is magic, and none of it should be a black box. A mastering engine worth using will tell you what it measured and what it changed — before/after loudness, applied processing, and warnings when something about your source material (like a mono or near-mono file) limits what mastering can honestly do. If a tool can't explain its own chain, that's usually because there isn't a real one behind the curtain.",
    ],
  },
  {
    slug: "what-ai-mastering-actually-automates",
    title: "Automated Fader Rides vs. Manual Mixing: What AI Mastering Actually Automates",
    description:
      "AI mastering doesn't replace a mixing engineer's fader rides — it automates a different, narrower job. Here's exactly where the line is.",
    keywords: ["automated mixing", "mastering automation", "AI vs manual mastering", "fader automation"],
    image: "https://images.pexels.com/photos/30807699/pexels-photo-30807699/free-photo-of-close-up-of-hand-adjusting-audio-mixing-console.jpeg?auto=compress&cs=tinysrgb&w=1200",
    captionKey: "gallery.img2.caption",
    datePublished: "2026-08-16",
    readingTime: "4 min read",
    sections: [
      { at: 0, id: "different-job", title: "Mastering is not fader riding" },
      { at: 1, id: "what-is-automated", title: "What actually gets automated" },
      { at: 2, id: "stems", title: "Where stems move the line" },
      { at: 3, id: "upshot", title: "The practical upshot" },
    ],
    takeaway: "AI mastering automates the measurement-to-decision step on a finished stereo mix — tonal balance, dynamics, width and loudness — not the balance decisions of a mix engineer.",
    paragraphs: [
      "A common misconception is that AI mastering tools are trying to replace a mixing engineer riding faders on individual tracks. They're not — that's a different job, working with individual stems and full session context. Mastering, automated or not, works on a finished two-track mix and makes bus-level decisions: overall tonal balance, dynamics, stereo image, and final loudness.",
      "What actually gets automated is the analysis-to-decision step that a human mastering engineer does by ear and experience: listening to a rough mix, deciding it's 2dB too dark above 8kHz for the target genre, deciding the low end needs a touch more control before it'll translate to club systems, and picking compression timing that suits the track's actual tempo rather than a generic setting. An adaptive engine does the same measurement-to-decision mapping, consistently, on every track, without fatigue.",
      "Where stem-aware processing exists, the line moves slightly closer to mixing: splitting vocals, drums, bass, and other elements lets the engine apply more targeted correction — tightening a bass stem's low end independently from vocal presence, for instance — before the final mixdown and mastering pass. That's still working from a mix that's already been made, not building one from raw multitrack.",
      [
        "The practical upshot: AI mastering is well-suited to the repeatable, measurable parts of finishing a track — ",
        { href: "/mastering-loudness-targets", text: "loudness targets" },
        ", tonal balance, dynamics control, true-peak-safe limiting — and it's honest to say so, rather than implying it does everything a full production team does.",
      ],
    ],
  },
  {
    slug: "building-a-repeatable-mastering-chain-for-your-studio",
    title: "Building a Repeatable Mastering Chain for Your Studio's Artists",
    description:
      "If your studio masters the same artist's releases over and over, a saved, reusable mastering chain matters more than any single preset. Here's how to think about building one.",
    keywords: ["mastering presets", "studio workflow", "artist mastering chain", "saved mastering presets"],
    image: "https://images.pexels.com/photos/32215665/pexels-photo-32215665/free-photo-of-close-up-of-a-professional-audio-mixer.jpeg?auto=compress&cs=tinysrgb&w=1200",
    captionKey: "gallery.img3.caption",
    datePublished: "2026-08-16",
    readingTime: "4 min read",
    sections: [
      { at: 0, id: "consistency", title: "The consistency problem" },
      { at: 1, id: "capture-the-chain", title: "Capture the chain as data" },
      { at: 2, id: "in-practice", title: "What it looks like in practice" },
      { at: 3, id: "recall-sheet", title: "A recall sheet that never drifts" },
    ],
    takeaway: "Consistency across an artist's catalog comes from reapplying the exact processing specification that worked, saved privately under the artist's name — not from a better generic preset.",
    paragraphs: [
      "A studio that masters one artist's catalog over months or years runs into a problem generic presets don't solve: consistency across releases. A \"streaming pop\" preset gets you in the right neighborhood for any pop track; it doesn't guarantee that this artist's next single sits next to their last one in a playlist without an audible tonal jump.",
      [
        "The fix isn't picking a better generic preset — it's capturing the exact processing chain that worked for an artist once, as data, and reapplying it verbatim on every future track. That means more than a genre tag and a couple of sliders: a real preset needs to carry the actual specification — EQ bands, compressor timing, dynamic EQ targets, saturation amount, stereo treatment, and ",
        { href: "/mastering-loudness-targets", text: "the loudness and limiter targets it lands on" },
        " — not just an approximation derived from a genre label.",
      ],
      "In practice, this looks like exporting or writing a full processing specification once you've dialed in a master you're happy with, saving it under the artist's name, and then applying it by name to every subsequent track from that artist — a dropdown pick, not a from-scratch rebuild. It should be private to your account or studio, not a shared global preset that anyone else using the same software could stumble into or overwrite.",
      "This is the same principle any experienced mastering engineer already applies by keeping a session template or a recall sheet per artist — the difference is that a saved digital preset reproduces the chain exactly, every time, with zero drift between the tenth and the first.",
    ],
  },
  {
    slug: "lufs-for-spotify-apple-music-youtube",
    title: "LUFS for Spotify, Apple Music & YouTube: What to Master To",
    description:
      "What LUFS to master to for Spotify (-14), Apple Music (about -16) and YouTube (-14), how each one normalizes, and the true-peak ceiling that matters more.",
    keywords: [
      "lufs for spotify",
      "spotify lufs",
      "what lufs for spotify",
      "apple music lufs",
      "youtube lufs",
      "streaming loudness targets",
      "mastering for spotify",
      "loudness normalization",
    ],
    image: "https://images.pexels.com/photos/4162581/pexels-photo-4162581.jpeg?auto=compress&cs=tinysrgb&w=1200",
    datePublished: "2026-10-23",
    readingTime: "8 min read",
    sections: [
      { at: 0, id: "short-answer", title: "The short answer" },
      { at: 2, id: "how-normalization-works", title: "How loudness normalization actually works" },
      { at: 5, id: "spotify", title: "Spotify: -14 LUFS, with documented rules" },
      { at: 9, id: "apple-music", title: "Apple Music: around -16 LUFS via Sound Check" },
      { at: 11, id: "youtube", title: "YouTube: turned down, never up" },
      { at: 13, id: "other-platforms", title: "Amazon Music, Tidal, Deezer and SoundCloud" },
      { at: 15, id: "what-to-master-to", title: "So what should you actually master to?" },
      { at: 19, id: "true-peak", title: "True peak: the number that actually breaks masters" },
      { at: 22, id: "check-your-master", title: "How to check and hit your target" },
      { at: 25, id: "mistakes", title: "Four mistakes that cost you on streaming" },
    ],
    takeaway:
      "Spotify, YouTube, Tidal and Amazon play back around -14 LUFS; Apple Music around -16. Master for your genre, keep true peak at -1 dBTP (or -2 dBTP if you're louder than -14 LUFS), and measure the finished file instead of trusting a meter in your session.",
    paragraphs: [
      // 0 — short answer
      "If you want one number: Spotify, YouTube, Tidal and Amazon Music all play music back at roughly -14 LUFS integrated, and Apple Music at roughly -16 LUFS. Spotify's own artist guidance is to target -14 LUFS integrated with a true peak below -1 dBTP — and below -2 dBTP if your master is louder than -14 LUFS.",
      [
        "But \"master to -14 LUFS\" is a misreading of how those numbers work. They are playback reference levels, not delivery requirements. Nothing rejects a -9 LUFS pop master or a -18 LUFS classical recording; the platform simply turns the track up or down when it plays. What you actually control is how your master sounds after that adjustment — and that depends far more on dynamics and true-peak headroom than on hitting a specific integrated figure. This guide covers what each platform really does, and then what to aim for. If you want genre-by-genre numbers alongside it, our ",
        { href: "/mastering-loudness-targets", text: "mastering loudness targets reference table" },
        " lists them.",
      ],
      // 2 — how normalization works
      "LUFS (Loudness Units relative to Full Scale) measures perceived loudness over time. It's defined by the ITU-R BS.1770 standard, which applies a frequency weighting that roughly matches how human hearing responds, then gates out silence so a quiet intro doesn't drag the average down. \"Integrated\" LUFS is that measurement across the whole track.",
      "When you upload a song, the platform measures its integrated loudness once and stores a gain value. At playback, it applies that gain so every track lands near the same reference level. A master at -8 LUFS on a -14 LUFS platform is played 6 dB quieter. A master at -17 LUFS may be played 3 dB louder — or not at all, depending on the platform and on how much peak headroom the track has.",
      "The practical consequence is the most important idea in streaming mastering: once normalization is on, a louder master no longer sounds louder. It sounds the same volume as everything else, just with less dynamic range — the transients and punch you squeezed out with the limiter are gone, and the turn-down doesn't give them back. That's why the loudness war has quietly lost its payoff on streaming, and why a dynamic master often sounds bigger in a playlist than a crushed one.",
      // 5 — Spotify
      "Spotify documents its loudness normalization more clearly than any other service, so it's the best reference. By default it plays tracks at -14 LUFS integrated, measured according to ITU 1770. Premium listeners can change this: \"Loud\" plays at -11 LUFS, \"Normal\" at -14 and \"Quiet\" at -19. In the Loud setting Spotify applies a limiter to avoid clipping quieter, dynamic tracks that get raised.",
      "Spotify does turn quiet masters up, but only as far as their peaks allow. It considers each track's headroom and leaves 1 dB of headroom for lossy encoding. Its own example: a track at -20 LUFS with a true peak of -5 dBFS gets raised to -16 LUFS, not -14 — the peaks would hit the ceiling first. So a quiet master with spiky, uncontrolled peaks can end up sounding quieter than everything around it.",
      "Two more details matter for releases. First, Spotify normalizes albums as a whole when they're played as an album, so a deliberately quiet interlude stays quieter than the single next to it — your track-to-track balance survives. In shuffle or playlists, each track is adjusted individually. Second, normalization isn't applied on Spotify's web player or on some third-party devices like TVs and speakers. Some listeners will hear your master at its raw level, which is one more reason not to leave it too quiet either.",
      "Spotify's recommendation for masters is explicit: target -14 LUFS integrated, keep true peak below -1 dBTP, and if you master louder than -14 LUFS, keep true peak below -2 dBTP, because louder masters pick up more distortion when encoded to Ogg Vorbis and AAC.",
      // 9 — Apple
      "Apple Music normalizes with Sound Check, and the reference level is commonly measured at around -16 LUFS — about 2 dB quieter than Spotify. Sound Check is a listener setting rather than something you control, so plan for both: with it on, your track is matched to that reference; with it off, it plays at its raw level. Like Spotify, Apple can raise quiet tracks, but only until their peaks run out of room.",
      "Practically, the -16 reference means a master that is fine on Spotify is fine on Apple Music, just turned down a little further. You don't need a separate Apple master. Because Apple delivers AAC, the true-peak advice is the same: leave about 1 dB of headroom so encoding overshoots don't clip.",
      // 11 — YouTube
      "YouTube normalizes music to a reference of around -14 LUFS, but with an important difference: it only turns loud videos down. It doesn't turn quiet ones up. If you right-click a video and open \"Stats for nerds\", the \"content loudness\" value tells you how far above the reference the audio sits; a negative value means it's quieter than the reference and plays as-is.",
      "That asymmetry makes YouTube the one platform where mastering well below -14 LUFS really does cost you perceived volume. If your release lives mainly on YouTube — lyric videos, visualizers, live sessions — landing near -14 LUFS or a little louder is the safe choice.",
      // 13 — others
      "The other big services publish less detail, so treat these as widely reported working figures rather than specifications. Amazon Music is generally measured around -14 LUFS. Tidal normalizes to around -14 LUFS and, like Spotify, applies album normalization. Deezer is reported at around -15 LUFS. SoundCloud has historically not applied normalization to most playback, so loudness there behaves more like a download: what you upload is what people hear.",
      "The spread across services is only about 2 dB. You can't master to every platform's exact number at once, and you don't need to — the reasons above (dynamics and headroom) matter more than chasing any single platform's reference.",
      // 15 — what to master to
      "Here's the practical rule: master to what suits your genre and your music, inside a sensible window, with clean true-peak headroom. For most streaming-first releases that window is about -14 to -9 LUFS integrated, and where you land in it should be a musical decision.",
      [
        "Acoustic, jazz, singer-songwriter and orchestral music usually sound best at -14 LUFS or quieter, because their impact comes from dynamics that normalization rewards. Pop, rock and hip-hop commonly land between -11 and -8 LUFS, because a denser, more compressed sound is part of the style — a ",
        { href: "/master/hiphop", text: "hip-hop master" },
        " that sounds wrong at -14 isn't fixed by matching Spotify's number. Electronic music aimed at clubs as well as streaming often goes louder still, which is fine as long as you accept the turn-down and protect the low end and transients. The ",
        { href: "/master/edm", text: "EDM mastering guide" },
        " covers that trade-off.",
      ],
      "What you should not do is take a quiet, dynamic mix and smash it to -7 LUFS because a forum said streaming masters need to be loud — or take a dense club track and pull it down to -14 just because it's Spotify's number. In both cases you're changing the music to suit a playback setting that would have handled it anyway.",
      "If you only release to Apple Music, or your audience is mostly on Apple devices, aiming toward the quieter end of your genre's range costs you nothing. If YouTube is your main channel, avoid going much below -14 LUFS, because it won't turn you up.",
      // 19 — true peak
      "True peak is the number that most often turns a good master into a bad stream. Sample-peak meters only read the digital samples. When audio is converted back to analog, or encoded to a lossy format like AAC, Opus or Ogg Vorbis, the reconstructed waveform can overshoot between samples. These inter-sample peaks, measured in dBTP, are what cause encoding distortion — the crunchy, smeared highs you hear on a loud master after upload.",
      "The rules are simple. Keep true peak at or below -1 dBTP for any streaming master. If your integrated loudness is above -14 LUFS, follow Spotify's guidance and keep it at or below -2 dBTP, because louder, denser material overshoots more when encoded. Use a true-peak-aware limiter, not a plain sample-peak brickwall at -0.1 dBFS.",
      "Then verify the encoded result, not just the WAV. A file that reads -1.0 dBTP before encoding can still overshoot after an AAC or Opus round trip, especially if it's heavily limited. Checking what the codec actually does to your master is the only way to be sure.",
      // 22 — check
      [
        "Start by measuring what you already have. Our free ",
        { href: "/lufs-meter", text: "LUFS meter" },
        " reads integrated loudness, true peak and loudness range from any file, right in your browser, with no account and no upload. Measure your bounced master, not the meter in your DAW session, so plugins, dither and export settings are all included.",
      ],
      [
        "If you're mastering with Auralith Forge, the engine measures loudness with ITU-R BS.1770 — the same standard the platforms use — before it changes anything, then sets its limiter and true-peak ceiling from your choice of Delivery target: Genre best practice, Streaming (-14 LUFS), Apple Music (-16 LUFS) or Loud (club/DJ). It applies the -2 dBTP rule automatically when a master ends up louder than -14 LUFS. It also includes a codec preview: a real MP3, AAC and Opus encode-decode round trip, with the change in true peak and loudness reported, so you hear what Spotify or Instagram will do to it before you download. If you want to know what happens between those two steps, ",
        { href: "/blog/what-happens-inside-an-ai-mastering-engine", text: "here's the full processing chain" },
        ", stage by stage.",
      ],
      [
        "Because it's adaptive DSP rather than a one-click AI preset, it adjusts compression, EQ and limiting to your actual mix and genre instead of forcing every track to the same number. You can ",
        { href: "/login?mode=signup", text: "master three full tracks free" },
        ", no card required, and compare the result against your own master at matched loudness.",
      ],
      // 25 — mistakes
      "Mistake one: treating -14 LUFS as a rule. It's a playback reference. Master to the genre and the music, then check that headroom and dynamics hold up after normalization.",
      "Mistake two: ignoring true peak. A -0.1 dBFS sample-peak ceiling is the most common cause of distorted streams. Use -1 dBTP, or -2 dBTP for loud masters.",
      "Mistake three: comparing your master to a reference at different loudness. Louder always sounds better at first listen. Level-match before you judge, the same way Spotify will when it plays both.",
      [
        "Mistake four: mastering every track on an album to the same integrated LUFS. Albums are normalized as a whole on Spotify and Tidal, so a ballad that sits 3 dB below the single should stay there. Match the feel across the record, not the number. For a broader look at which online mastering tools handle this well, see our ",
        { href: "/ai-mastering-online", text: "guide to AI and online mastering" },
        ".",
      ],
    ],
  },
];

export function getPostBySlug(slug) {
  return POSTS.find((p) => p.slug === slug) || null;
}
