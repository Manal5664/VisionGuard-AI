const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.75,
};

const ICON_PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  camera: (
    <>
      <path d="M2 7.5A1.5 1.5 0 0 1 3.5 6h11A1.5 1.5 0 0 1 16 7.5v9A1.5 1.5 0 0 1 14.5 18h-11A1.5 1.5 0 0 1 2 16.5v-9Z" />
      <path d="m16 10.5 5-3v9l-5-3" />
    </>
  ),
  zone: (
    <>
      <path d="M12 3a5 5 0 0 1 5 5c0 3-2 5-3.5 7.6a1.6 1.6 0 0 1-3 0C9 13 7 11 7 8a5 5 0 0 1 5-5Z" />
      <circle cx="12" cy="8" r="1.8" />
    </>
  ),
  events: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="4" width="13" height="16" rx="2" />
      <path d="m15 10 7-4v12l-7-4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 15-4.5-4.5L8 19" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M6.1 9a7 7 0 0 1 11.7-2.5L20 11" />
      <path d="M4 13l2.2 4.5A7 7 0 0 0 17.9 15" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9.5v4.5" />
      <path d="M12 17.5h.01" />
    </>
  ),
  activity: (
    <>
      <path d="M3 12h4l2.5-6.5 4.5 13L17 12h4" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5 20 6v5.5c0 5.2-3.3 8.5-8 10-4.7-1.5-8-4.8-8-10V6l8-3.5Z" />
      <path d="m8.7 12 2.1 2.1 4.7-4.7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </>
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  check: <path d="m5 12 4.5 4.5L19 7" />,
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </>
  ),
  play: <path d="M7 4v16l13-8L7 4Z" />,
  volume: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m16 9 6 6M22 9l-6 6" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="3" width="18" height="8" rx="2" />
      <rect x="3" y="13" width="18" height="8" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  film: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.6 18.5a9 9 0 1 1 14.8 0" />
      <path d="m12 18 3-7.5" />
      <path d="M12 18h.01" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  cameraOff: (
    <>
      <path d="M9.2 6h2.3l1.7 2.1h3.4A2.4 2.4 0 0 1 19 10.5v6a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 16.5v-5.2A2.4 2.4 0 0 1 5.4 9h.6" />
      <path d="m16 11 5-2.8v8L16 13" />
      <path d="m3 3 18 18" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 2.5 20 6v5.5c0 5.2-3.3 8.5-8 10-4.7-1.5-8-4.8-8-10V6l8-3.5Z" />
      <path d="m8.7 12 2.1 2.1 4.7-4.7" />
    </>
  ),
  moon: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" />
    </>
  ),
  moonStars: (
    <>
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z" />
      <path d="M17.5 2.5v4M15.5 4.5h4" />
      <path d="M19.5 9.5h.01" />
    </>
  ),
};

export default function Icon({ name, className, size = 18, ...props }) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      {...STROKE}
      {...props}
    >
      {paths}
    </svg>
  );
}
