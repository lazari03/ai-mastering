// Same hand-drawn stroke-icon convention as the app shell's own icon set
// (src/components/app/icons.jsx) — 24x24 viewBox, 1.6 stroke, round caps,
// currentColor — so the admin dashboard doesn't introduce a second visual
// language or a new icon-library dependency for a handful of glyphs.
const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

export function IconGrid(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.4" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.4" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.4" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.4" />
    </svg>
  );
}

export function IconRadio(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M7.5 9a6.2 6.2 0 0 0 0 6M16.5 9a6.2 6.2 0 0 1 0 6M4.5 6a10.4 10.4 0 0 0 0 12M19.5 6a10.4 10.4 0 0 1 0 12" />
    </svg>
  );
}

export function IconList(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

export function IconFunnel(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4.5h16l-6 8v6l-4 2v-8l-6-8Z" />
    </svg>
  );
}

export function IconTarget(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function IconFileText(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4M9 12.5h6M9 16h6" />
    </svg>
  );
}

export function IconSearch(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </svg>
  );
}

export function IconDollar(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.5v19M16.5 6.8c-.7-1-2.1-1.6-4-1.6-2.4 0-4.3 1.2-4.3 3.2s1.9 2.7 4.3 3.1c2.4.4 4.3 1.2 4.3 3.2s-1.9 3.2-4.3 3.2c-1.9 0-3.3-.6-4-1.6" />
    </svg>
  );
}

export function IconAlertTriangle(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4.2M12 17.3h.01" />
    </svg>
  );
}

export function IconRefresh(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12a8 8 0 0 1 13.6-5.7L20 8.5M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.6 5.7L4 15.5M4 20v-4.5h4.5" />
    </svg>
  );
}

export function IconUsers(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 8.8a2.6 2.6 0 1 1 0-5.2M15 14.3c2.6.4 4.5 2.5 4.5 5.7" />
    </svg>
  );
}

export function IconUserPlus(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M18.5 8v5M16 10.5h5" />
    </svg>
  );
}

export function IconUserCheck(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M15.5 12.5 17.3 14.3 20.5 10.5" />
    </svg>
  );
}

export function IconClock(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconUpload(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 15.5V4M8 8l4-4 4 4" />
      <path d="M4.5 15.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5" />
    </svg>
  );
}

export function IconWaveform(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h2l2-6 3 14 2-9 2 5h5" />
    </svg>
  );
}

export function IconTag(props) {
  return (
    <svg {...base} {...props}>
      <path d="M11.5 3.5h5a1 1 0 0 1 .7.3l3 3a1 1 0 0 1 .3.7v5a1 1 0 0 1-.3.7l-8.5 8.5a1 1 0 0 1-1.4 0l-7.5-7.5a1 1 0 0 1 0-1.4l8.5-8.5a1 1 0 0 1 .2-.3Z" />
      <circle cx="16" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCart(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17.5" cy="20" r="1.3" />
      <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.3h8.6a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6" />
    </svg>
  );
}

export function IconCoins(props) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="9" cy="7" rx="5.5" ry="3" />
      <path d="M3.5 7v4c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3V7" />
      <path d="M3.5 11v4c0 1.7 2.5 3 5.5 3 .9 0 1.7-.1 2.5-.4" />
      <ellipse cx="16" cy="14" rx="4.5" ry="2.5" />
      <path d="M11.5 14v3.5c0 1.4 2 2.5 4.5 2.5s4.5-1.1 4.5-2.5V14" />
    </svg>
  );
}

export function IconShield(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 19 6v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-2.5Z" />
      <path d="M9.2 12.3 11.3 14.4 15 10" />
    </svg>
  );
}

export function IconShare(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="M8.2 10.8 15.8 7M8.2 13.2 15.8 17" />
    </svg>
  );
}

export function IconDownload(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5v11.5M8 11l4 4 4-4" />
      <path d="M4.5 15.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5" />
    </svg>
  );
}

export function IconXCircle(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </svg>
  );
}
