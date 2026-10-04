import { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  live: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-5-5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  play: <path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor" />,
  pause: <path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" />,
  x: <path d="M5 5l14 14M19 5L5 19" />,
  back: <path d="M15 18l-6-6 6-6" />,
  next: <path d="M9 6l6 6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  heart: <path d="M12 20.5s-8-4.9-8-10.7A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8c0 5.8-8 10.7-8 10.7z" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  theater: <rect x="2.5" y="6" width="19" height="12" rx="1.5" />,
  theaterOn: <rect x="2.5" y="8" width="19" height="8" rx="1.5" />,
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  exitFullscreen: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  volume: <path d="M4 9.5v5h4l5 4v-13l-5 4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />,
  mute: <path d="M4 9.5v5h4l5 4v-13l-5 4zM17 9.5l4 5M21 9.5l-4 5" />,
  replay10: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4" />
      <path d="M9.5 10v4.5M12.2 11.2v2.1a1.2 1.2 0 0 0 2.4 0v-2.1a1.2 1.2 0 0 0-2.4 0z" />
    </>
  ),
  forward10: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5M19.5 4.5v4h-4" />
      <path d="M9.5 10v4.5M12.2 11.2v2.1a1.2 1.2 0 0 0 2.4 0v-2.1a1.2 1.2 0 0 0-2.4 0z" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  server: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </>
  ),
  tag: <path d="M3 12V4h8l9 9-8 8zM8 8h.01" />,
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
