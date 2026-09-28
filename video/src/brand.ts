import { continueRender, delayRender, staticFile } from "remotion";

// Same tokens as frontend/src/app/globals.css and the layout's fonts.
// Fonts are the site's own (Space Grotesk titles, Plus Jakarta Sans body),
// bundled in public/fonts as variable woff2 so rendering needs no network.
const handle = delayRender("fonts");
Promise.all(
  [
    ["Space Grotesk", "SpaceGrotesk-700.woff2", "300 700"],
    ["Plus Jakarta Sans", "PlusJakartaSans-700.woff2", "200 800"],
  ].map(([family, file, weight]) => new FontFace(family, `url(${staticFile("fonts/" + file)})`, { weight }).load().then((f) => document.fonts.add(f)))
)
  .then(() => continueRender(handle))
  .catch((e) => { throw e; });
export const C = {
  bg: "#0c0c0d",
  surface: "#151516",
  text: "#f5f5f3",
  muted: "#969696",
  border: "rgba(255,255,255,0.10)",
  accent: "#8275ff",
};
export const title = "'Space Grotesk', sans-serif";
export const body = "'Plus Jakarta Sans', sans-serif";

// Real numbers from frontend/src/content/demoMaster.js
export const DEMO = { beforeLufs: -15.89, afterLufs: -11.26, truePeak: -2.02 };
