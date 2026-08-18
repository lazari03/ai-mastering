// Small inline stroke icons, one per app tab plus the sidebar toggle — no
// icon library pulled in for six glyphs; these are hand-drawn to match
// (24x24 viewBox, 1.6 stroke, round caps/joins, currentColor).
const base = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

export function IconClean(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3c3 4 5 7.2 5 10a5 5 0 0 1-10 0c0-2.8 2-6 5-10Z" />
      <path d="M9 15.5c0 1.4 1.3 2.5 3 2.5" />
    </svg>
  );
}

export function IconMaster(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h2l2-6 3 14 2-9 2 5h5" />
    </svg>
  );
}

export function IconChords(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="7" cy="17" r="2.6" />
      <circle cx="16.5" cy="15" r="2.6" />
      <path d="M9.6 17V5.5L19.1 4v11" />
    </svg>
  );
}

export function IconMyMasters(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8V6a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v2" />
      <path d="M3 8h18l-1.4 10.2a1 1 0 0 1-1 .8H5.4a1 1 0 0 1-1-.8L3 8Z" />
    </svg>
  );
}

export function IconHelp(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.1 1-1.1 1.9" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

export function IconSettings(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.3.7a7.6 7.6 0 0 0-2.6-1.5L14 2.2h-4l-.4 2.6a7.6 7.6 0 0 0-2.6 1.5l-2.3-.7-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 15l2 3.4 2.3-.7c.75.66 1.63 1.17 2.6 1.5l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2.6-1.5l2.3.7 2-3.4-1.9-1.5Z" />
    </svg>
  );
}

export function IconChevronLeft(props) {
  return (
    <svg {...base} width={15} height={15} {...props}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  );
}

export function IconChevronRight(props) {
  return (
    <svg {...base} width={15} height={15} {...props}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </svg>
  );
}
