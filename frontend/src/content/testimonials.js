// Customer quotes for the homepage (components/marketing/Testimonials.jsx).
//
// EMPTY ON PURPOSE. The section renders nothing until this array has
// entries, so it can ship before there is anything to show.
//
// Rules — a fabricated or paraphrased testimonial is worse than none:
//   - Only a real person's own words, quoted exactly, with their written
//     permission to publish them under the name shown.
//   - No AI-written, invented, "representative" or composite quotes.
//   - If they were given anything in return (free months, a discount),
//     set `disclosure` — e.g. "Received 3 free months".
//
// Entry shape:
//   {
//     quote: "…",                    // exact words, one or two sentences
//     name: "First L.",              // as they agreed to be shown
//     role: "Producer, Tirana",      // optional
//     href: "https://…",             // optional link to their music/profile
//     disclosure: "",                // optional, see above
//   }
export const TESTIMONIALS = [];
