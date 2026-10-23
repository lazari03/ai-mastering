// Where the master is going — mirrors backend/params.py:DELIVERY_TARGETS
// (the engine owns the numbers; this only labels the chips).
//   auto      — the genre's best-practice loudness
//   streaming — Spotify, YouTube, Tidal, Amazon play at -14 LUFS and turn
//               louder masters down, so this lands exactly there
//   apple     — Apple Music's Sound Check reference, -16 LUFS
//   loud      — club / DJ use: 1 LU louder than the genre default
// Any master louder than -14 LUFS gets a -2 dBTP ceiling (Spotify's
// guidance for lossy transcoding); -1 dBTP otherwise.
export const DELIVERY_TARGETS = ["auto", "streaming", "apple", "loud"];
