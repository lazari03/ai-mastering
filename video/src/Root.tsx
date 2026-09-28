import { Composition } from "remotion";
import { Reel, DURATION, FPS } from "./Reel";

export const Root = () => (
  <Composition id="InstagramReel" component={Reel} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
);
