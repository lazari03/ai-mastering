# SEO Keyword Map — Auralith Forge

One entry per indexable page. Purpose: before adding any new page, check this map first — if its primary/secondary keywords already belong to an existing page, that's cannibalization, not a new opportunity. Extend an existing page instead.

---

### `/`
- **Intent:** Commercial / brand — homepage
- **Primary:** free online mastering (+ permutations: online mastering free, free mastering online, free mastering, mastering online free), auralith forge
- **Secondary:** online audio mastering, online song mastering, mastering music online, master a song online free
- **Funnel stage:** Awareness → Product-aware
- **Primary CTA:** Master a Track Free (hero)
- **Related:** `/ai-mastering-online`, `/tools`, `/lufs-meter`

### `/ai-mastering-online`
- **Intent:** Commercial — broad-intent hub
- **Primary:** ai mastering, mastering ai, ai mastering online, ai mastering free
- **Secondary:** online mastering service(s), best online mastering service, best online mastering, master a song online
- **Funnel stage:** Problem-aware → Solution-aware
- **Primary CTA:** Start free / sign up
- **Related:** `/`, `/mastering-loudness-targets`, `/master/[genre]`

### `/tools`
- **Intent:** Navigational / utility hub
- **Primary:** free music tools
- **Secondary:** lufs meter, bpm finder, key finder, chord detector
- **Funnel stage:** Problem-aware
- **Primary CTA:** Try a tool (card grid)
- **Related:** all four tool pages below

### `/lufs-meter`
- **Intent:** Utility / problem-aware — direct mastering intent
- **Primary:** lufs meter, check lufs
- **Secondary:** audio loudness meter, true peak meter, measure lufs online, loudness range
- **Funnel stage:** Problem-aware (highest-priority P0 tool per demand × product relevance × commercial intent)
- **Primary CTA:** Master This Track
- **Related:** `/mastering-loudness-targets`, `/tools`, `/chord-detector`

### `/chord-detector`
- **Intent:** Utility — umbrella tool page (real ranking history, kept standalone rather than folded into the shared template)
- **Primary:** chord detector
- **Secondary:** find chords in a song, guitar chord finder, ai chord recognition, song key finder, bpm detector
- **Funnel stage:** Problem-aware
- **Primary CTA:** Master This Song (post-result, in-app)
- **Related:** `/song-key-finder`, `/bpm-finder`, `/chord-progression-finder`, `/lufs-meter`, `/tools`

### `/song-key-finder`
- **Intent:** Utility — narrow variant of Chord Detector's key-detection capability
- **Primary:** song key finder, find the key of a song
- **Secondary:** what key is this song in, audio key detector
- **Funnel stage:** Problem-aware
- **Primary CTA:** Try it free → `/chord-detector`
- **Related:** `/chord-detector`, `/bpm-finder`, `/chord-progression-finder`, `/lufs-meter`

### `/bpm-finder`
- **Intent:** Utility — narrow variant of Chord Detector's tempo-detection capability
- **Primary:** bpm finder, tempo finder
- **Secondary:** find bpm of a song, bpm detector online
- **Funnel stage:** Problem-aware
- **Primary CTA:** Try it free → `/chord-detector`
- **Related:** `/chord-detector`, `/song-key-finder`, `/chord-progression-finder`, `/lufs-meter`

### `/chord-progression-finder`
- **Intent:** Utility — narrow variant of Chord Detector's full-progression capability
- **Primary:** chord progression finder
- **Secondary:** chord chart generator, chord finder online
- **Funnel stage:** Problem-aware
- **Primary CTA:** Try it free → `/chord-detector`
- **Related:** `/chord-detector`, `/bpm-finder`, `/song-key-finder`, `/lufs-meter`

### `/mastering-loudness-targets`
- **Intent:** Informational (reference) with commercial follow-through
- **Primary:** lufs by genre, how loud should i master
- **Secondary:** what lufs for spotify, true peak explained, mixing vs mastering loudness
- **Funnel stage:** Problem-aware → Solution-aware
- **Primary CTA:** Start free / Measure your track (`/lufs-meter`)
- **Related:** `/lufs-meter`, `/master/[genre]`, `/ai-mastering-online`

### `/master/[genre]` (8 pages: pop, edm, lofi, rock, acoustic, classical, hiphop, podcast)
- **Intent:** Commercial — genre-specific mastering
- **Primary:** master {genre} track, {genre} mastering
- **Secondary:** {genre} loudness target
- **Funnel stage:** Solution-aware
- **Primary CTA:** Start free
- **Related:** `/mastering-loudness-targets`, `/ai-mastering-online`

### `/vs/landr`, `/vs/emastered`, `/vs/bandlab`, `/vs/waves`
- **Intent:** Commercial — comparison / competitor-displacement
- **Primary:** auralith forge vs landr, auralith forge vs emastered, bandlab mastering, waves online mastering
- **Secondary:** landr alternative, emastered alternative, bandlab mastering alternative, waves mastering online
- **Funnel stage:** Solution-aware → Decision
- **Primary CTA:** Start free
- **Related:** `/`, `/ai-mastering-online`

### `/blog` + posts
- **Intent:** Informational
- **Primary:** (per-post, see `content/posts.js`)
- **Funnel stage:** Awareness → Problem-aware
- **Related:** genre pages, chord detector

### `/terms`, `/privacy`, `/refund`
- **Intent:** Legal / trust — not a ranking target
- **Funnel stage:** N/A

---

## Reserved but NOT created (see `SEO_ROADMAP.md` for why)

| URL | Would-be intent | Why deferred |
|---|---|---|
| `/mastering` | Commercial — generic mastering | Homepage already owns this; would cannibalize |
| `/ai-mastering` | Commercial — generic AI mastering | `/ai-mastering-online` already owns this |
| `/master-a-song` | Task-oriented | No content angle yet distinct from `/ai-mastering-online` |
| `/blog/what-is-lufs` | Informational | `/mastering-loudness-targets`'s existing FAQ already answers this |
| `/blog/lufs-for-spotify` | Informational | P1 — real gap, not yet written |
| `/blog/lufs-for-apple-music` | Informational | P1 — real gap, not yet written |
| `/blog/mixing-vs-mastering` | Informational | P1 — real gap, not yet written |
| `/blog/how-to-prepare-a-mix-for-mastering` | Informational | P1 — real gap, not yet written |
| `/true-peak-meter`, `/dynamic-range-meter`, `/stereo-width-checker` | Utility | Same underlying `/analyze` data as `/lufs-meter` — do not fragment into separate near-duplicate tool pages without demand evidence |
| `/key-finder` | Utility | Already exists at `/song-key-finder` — do not create a duplicate URL for the same intent |

---

## Demand evidence — Google Trends, worldwide, 2026-10-15 → 2026-10-22

| Cluster | Relative interest | Trend | Owner page |
|---|---|---|---|
| free online mastering (6 permutations) | 98–100 | −10% | `/` |
| ai mastering / mastering ai | 39 | +9% / +6% | `/ai-mastering-online` |
| best online mastering | 31 | −10% | `/ai-mastering-online` (FAQ) |
| online/audio/music mastering online | 22–27 | −2 to −20% | `/` secondary |
| ai mastering free / ai mastering online free | 21–22 | +4% / −3% | `/ai-mastering-online` |
| mixing and mastering / online mixing and mastering | 22 | −9 / −10% | **gap** — `/blog/mixing-vs-mastering` (P1, still unbuilt) |
| online mastering service(s) | 13–15 | +1 / +5% | `/ai-mastering-online` (FAQ) |
| bandlab mastering / bandlab | 13–14 | **+50% / +40%** | `/vs/bandlab` |
| waves online mastering | 7 | −20% | `/vs/waves` |
| mastering online gratis | 6 | +3% | not targeted — needs localized pages |
| landr / emastered | 2–5 | −10% / +10% | existing `/vs/*` |

Ignored as off-topic: "i'm a noble on the brink of ruin… mastering magic" (anime title), pearson, suno, distrokid, wav to mp3, mp3 converter.
