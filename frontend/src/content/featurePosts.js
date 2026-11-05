// Feature articles — one per engine capability (see seo/seo-log.md content
// plan). Same paragraph format as posts.js. Product facts are pulled from
// lib/pricing + lib/product so a plan or price change can't leave a stale
// number in the prose.
// Image: Pexels photo 270288 (studio microphones), not AI-generated:
// https://www.pexels.com/photo/270288/
import { PLANS, STEM_SEPARATION } from "@/lib/pricing";
import { PRODUCT } from "@/lib/product";

export const FEATURE_POSTS = [
  {
    slug: "stem-mastering-with-ai-stem-separation",
    title: "Stem Mastering with AI Stem Separation: A Vocal-First Guide",
    description:
      "Stem mastering vs stereo mastering, what AI stem separation (Demucs) can and can't fix, and how to master a buried vocal when all you have is a stereo mix.",
    keywords: [
      "stem mastering",
      "stem separation mastering",
      "stem mastering vs stereo mastering",
      "ai stem separation",
      "demucs mastering",
      "master vocals online",
      "vocal stem mastering",
    ],
    image: "https://images.pexels.com/photos/270288/pexels-photo-270288.jpeg?auto=compress&cs=tinysrgb&w=1200",
    imageCredit: "Pexels",
    datePublished: "2026-11-05",
    readingTime: "8 min read",
    sections: [
      { at: 0, id: "short-answer", title: "The short answer" },
      { at: 2, id: "stem-vs-stereo", title: "Stem mastering vs stereo mastering" },
      { at: 6, id: "separation", title: "What AI stem separation actually does" },
      { at: 10, id: "limits", title: "What separation can't fix" },
      { at: 13, id: "measured-moves", title: "How Auralith Forge uses the vocal stem" },
      { at: 18, id: "when-to-use", title: "When to turn stem separation on" },
      { at: 21, id: "workflow", title: "A practical workflow" },
      { at: 24, id: "faq", title: "Quick answers" },
    ],
    takeaway:
      "Stem mastering gives a mastering engineer — or an engine — separate control of the parts a stereo master can't isolate. If you can export real stems, that's the best source. If you only have the stereo mix, AI vocal separation recovers enough control for small, measured vocal-versus-arrangement corrections; it won't rescue a broken mix.",
    paragraphs: [
      // 0 — short answer
      "Stem mastering means mastering from a handful of grouped tracks — typically vocals, drums, bass and everything else — instead of one stereo file. It gives the mastering stage limited control over balance: the vocal can come up a fraction of a decibel in the chorus without the cymbals coming with it. Stereo mastering works on the finished two-track mix, where every move affects everything at once.",
      "AI stem separation adds a third option. If you only have the stereo bounce — a collaborator's export, an old session you can't reopen, a beat you licensed — a separation model can split it into a vocal and an accompaniment estimate, which the mastering stage can then treat differently. It's not as clean as real stems, and it doesn't turn mastering into mixing. Used for small, measured corrections, it's useful.",
      // 2 — stem vs stereo
      "Most mastering is still stereo mastering, and for good reason. The mix engineer has already decided the balance; mastering's job is to make that balance translate — tonal shape, dynamics, stereo image, loudness and a safe true-peak ceiling. One file means fewer things to go wrong: no misaligned exports, no stems bounced with different bus processing, no question about which version is the approved one.",
      "Stem mastering is usually reserved for cases where the stereo mix is close but one relationship is off and the mix can't be reopened easily. The classic example is a vocal that's slightly buried in the chorus but sits fine in the verse. In a stereo master, pushing 2–4 kHz to bring the vocal forward also brightens the guitars, synths and hi-hats in that range. With a separate vocal stem, the vocal can move on its own.",
      "Mastering engineers who offer stem sessions are consistent about one thing: it isn't a mix-fixing service. Stems give a bit of balance control; they don't replace automation, arrangement decisions or EQ on individual instruments. If a stem session turns into rebuilding the mix, the right answer is to go back to the mix.",
      [
        "If you're unsure which stage a problem belongs to, our guide to ",
        { href: "/blog/mixing-vs-mastering-what-to-fix-before-release", text: "mixing vs mastering and what each can fix" },
        " sorts the common issues into the right bucket before you spend time on either.",
      ],
      // 6 — separation
      "Modern stem separation uses neural networks trained on multitrack recordings to estimate what each source would sound like on its own. Demucs, an open-source model from Meta's research team, is one of the most widely used. Its fourth version, Hybrid Transformer Demucs, processes audio in both the waveform and spectrogram domains; the project reports about 9.0 dB signal-to-distortion ratio (SDR) on the MUSDB18-HQ benchmark, with a fine-tuned variant, htdemucs_ft, trained separately for each source.",
      "SDR is a rough measure of how close the estimate is to the real isolated track; higher is better, and 9 dB is good but not perfect. In practice that means a separated vocal is clearly the vocal, but carries traces of the arrangement — some cymbal wash, a breathy synth pad, reverb that belonged to both. The accompaniment estimate likewise carries a ghost of the vocal.",
      "For mastering, that imperfection matters less than it would for a remix or karaoke track. Nobody hears the stems on their own: they're recombined into one stereo file. If nothing is changed, vocal plus accompaniment adds back up to the original mix. Artifacts only become audible when one stem is processed heavily enough that the leakage stops cancelling out. That's the argument for keeping stem moves small.",
      "Two-stem separation — vocals and everything else — is also more robust than four- or six-stem splits for this job. A mastering correction rarely needs the bass apart from the kick; it very often needs the vocal apart from the arrangement. Fewer splits means fewer boundaries where artifacts can appear.",
      // 10 — limits
      "Separation won't fix a vocal that's out of tune, clipped or recorded with too much room. Whatever the vocal stem contains, it contains from the original recording. It won't separate two vocals from each other, and it won't untangle a kick from a bass that occupy the same frequencies. Those are mix and arrangement problems.",
      "It also won't save a mix that's fundamentally out of balance. If the vocal is 8 dB under the band, a mastering stage that pushes it up 8 dB will expose every separation artifact and change the character of the song. A responsible engine — or engineer — caps the move and tells you the mix needs work.",
      [
        "And it won't replace a clean export. Leave headroom, keep the sample rate native and bounce the full tails — the ",
        { href: "/blog/how-to-prepare-a-mix-for-mastering", text: "pre-master export checklist" },
        " covers it. Separation models do worse on files that are already clipped or heavily limited, because the transient and spectral clues they rely on have been flattened.",
      ],
      // 13 — measured moves
      [
        "Auralith Forge is a DSP mastering engine, not a generative \"AI mastering\" model: it measures the mix, decides what needs changing and applies conventional processing. Stem separation is an optional step in that chain. When you turn it on, the engine runs Demucs in two-stem mode (htdemucs_ft, with htdemucs as fallback) to estimate a vocal and an accompaniment, resampled to the job's own rate and aligned sample-for-sample with your mix. If you want the full picture of the stages around it, ",
        { href: "/blog/what-happens-inside-an-ai-mastering-engine", text: "here's what happens inside the mastering engine" },
        ".",
      ],
      "It then measures the relationship rather than assuming one. It compares the vocal against the accompaniment in the 1–4 kHz presence band, where intelligibility is decided, for the whole song and for each detected section. It checks the vocal's level spread, and its tone: low-mid build-up, upper-mid harshness and sibilance relative to the rest of the voice.",
      "Each correction starts at zero and only moves when a measurement justifies it. If a chorus vocal sits more than 1.5 dB further under the arrangement than the song's own typical balance, it gets half the gap back, never more than +1 dB. If the arrangement masks the vocal throughout, the accompaniment gets a small presence-band dip (at most 1.2 dB) rather than the vocal being pushed. Levelling, low-mid and harshness cuts, de-essing and air are each capped, and anything under a quarter of a decibel is dropped as inaudible. No reverb or other effect is added: ambience is a mix decision.",
      "If section detection isn't confident about where the choruses are, the engine makes no section moves at all rather than guessing. If there's no sustained vocal — an instrumental or a beat with vocal chops — it leaves the stems alone. Every decision is logged with its reason.",
      [
        "After that, the two stems are summed back into a stereo pre-master and go through the same chain as any other track: ",
        { href: "/ai-mastering-online", text: "adaptive EQ, multiband compression and true-peak limiting" },
        ", set from your genre and Delivery target. Because the stem moves are bounded, the result still sounds like your mix — with the vocal sitting where the rest of the song suggests it should.",
      ],
      // 18 — when to use
      [
        "Turn it on when the vocal is the problem: it disappears in the louder sections, it's harsh or sibilant in a way that a full-mix EQ would also dull the cymbals to fix, or it's dynamic enough that the loud lines jump out after limiting. Vocal-led genres benefit most — ",
        { href: "/master/pop", text: "pop" },
        ", ",
        { href: "/master/hiphop", text: "hip-hop" },
        " and singer-songwriter material.",
      ],
      "Leave it off for instrumentals, for mixes where the vocal already sits well, and for dense, intentionally washed-out productions where vocal and arrangement are meant to blur. It's also slower: separation is far heavier processing than the mastering chain itself, so stem jobs take longer and have a maximum track length on the server.",
      `On Auralith Forge, stem separation is included on ${PLANS.pro.label} (${PRODUCT.stems.includedPerMonth} stem-separated masters a month). On any other plan you can buy a single stem-separated master for ${STEM_SEPARATION.price}. The free tier lets you master full tracks without it, so you can hear the standard result before deciding whether the vocal needs the extra step.`,
      // 21 — workflow
      "1. Master the track once without stem separation and listen at matched loudness against your mix. If the vocal sits right, you're done. 2. If the vocal gets lost in the chorus or turns harsh after limiting, run the same file again with stem separation on, keeping the same genre and Delivery target so the only difference is the stem step. 3. Compare the two masters level-matched, on headphones and on a small speaker, focusing on the vocal in the loudest section.",
      [
        "4. Check the numbers. Run both masters through the free ",
        { href: "/lufs-meter", text: "LUFS meter" },
        " to confirm integrated loudness and true peak match your target — see ",
        { href: "/blog/lufs-for-spotify-apple-music-youtube", text: "what LUFS to master to for Spotify, Apple Music and YouTube" },
        ". 5. If the stem version is better but still not right, the mix probably needs a vocal ride or EQ change that's beyond mastering. Fix it in the session and master again.",
      ],
      [
        "That A/B is the whole point: you hear what separation adds on your own song rather than trusting a description. You can ",
        { href: "/login?mode=signup", text: "master three full tracks free, no card required" },
        ", and compare stem pricing on the ",
        { href: "/pricing", text: "plans page" },
        ".",
      ],
      // 24 — faq
      "Is stem mastering better than stereo mastering? Not automatically. It's more flexible, and more ways to change the balance means more ways to drift from what the mix engineer intended. For a well-balanced mix, stereo mastering is usually the right choice.",
      "Can AI stem separation replace real stems? No. Exported stems are exact; separated stems are estimates with some leakage. Separation is the fallback when real stems aren't available, and it works best for small corrections.",
      "Do I need to upload stems to Auralith Forge? No. Upload your finished stereo mix; when stem separation is on, the engine separates the vocal itself. Masters are delivered as a finished stereo file.",
      "Will stem separation change my mix? Only where a measurement says the vocal doesn't sit correctly, and only by bounded amounts. If nothing needs changing, the stems are recombined untouched.",
    ],
  },
];
