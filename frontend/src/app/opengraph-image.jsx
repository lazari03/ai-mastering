import { ImageResponse } from "next/og";

// Next's file-convention OG image — generated server-side from JSX/CSS at
// request time (cached), so it needs no external image asset at all. Used
// as the fallback for every route that doesn't define its own
// opengraph-image, which covers the whole site today.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Auralith Forge — AI Audio Mastering";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          background: "linear-gradient(135deg, #0b0d10 0%, #171310 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 28,
            color: "#dfc95a",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "#0b0d10",
              border: "2px solid #dfc95a",
              display: "flex",
            }}
          />
          Auralith Forge
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700, marginTop: 28, lineHeight: 1.1 }}>
          AI Audio Mastering
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700, color: "#e85d2a", lineHeight: 1.1 }}>
          for real releases
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#9ba1a8", marginTop: 28 }}>
          Adaptive DSP mastering — EQ, compression, limiting, done in minutes.
        </div>
      </div>
    ),
    { ...size }
  );
}
