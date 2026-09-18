// Abstract signal/waveform mark — per brand direction, no music notes,
// headphones, sparkles, robots, brains, or "AI" iconography. A few bars of
// varying height read as a waveform/meter at a glance, at any size, and
// use currentColor so one component works on both the light marketing
// site and dark sections/in-app chrome without a color prop.
export default function LogoMark({ size = 28, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
      <rect x="1" y="12" width="3" height="4" rx="1.5" fill="currentColor" />
      <rect x="7" y="7" width="3" height="14" rx="1.5" fill="currentColor" />
      <rect x="13" y="2" width="3" height="24" rx="1.5" fill="currentColor" />
      <rect x="19" y="9" width="3" height="10" rx="1.5" fill="currentColor" />
      <rect x="25" y="11" width="3" height="6" rx="1.5" fill="currentColor" />
    </svg>
  );
}
