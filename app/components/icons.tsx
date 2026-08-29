import React from "react";
export function Icon({ name, className = "nav-icon" }: { name: string; className?: string }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path {...p} d="M3 10.5 12 3l9 7.5" />
        <path {...p} d="M5.5 9.5V21h13V9.5M9 21v-7h6v7" />
      </>
    ),
    chart: (
      <>
        <path {...p} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    users: (
      <>
        <circle {...p} cx="9" cy="8" r="3" />
        <path {...p} d="M3.5 20c.4-4 2.4-6 5.5-6s5.1 2 5.5 6M16 5.5a3 3 0 0 1 0 5.8M17.5 14c2 .7 3 2.4 3.3 5" />
      </>
    ),
    upload: (
      <>
        <path {...p} d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
        <path {...p} d="M4 15.5V21h16v-5.5" />
      </>
    ),
    target: (
      <>
        <circle {...p} cx="12" cy="12" r="8" />
        <circle {...p} cx="12" cy="12" r="4" />
        <path {...p} d="M12 12 20 4" />
      </>
    ),
    wallet: (
      <>
        <path {...p} d="M4 6.5h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2h12" />
        <path {...p} d="M16 11h6v4h-6a2 2 0 0 1 0-4Z" />
      </>
    ),
    sim: (
      <>
        <rect {...p} x="6" y="2.5" width="12" height="19" rx="2" />
        <path {...p} d="M9 6h6M9 10h6M9 14h2" />
      </>
    ),
    shop: (
      <>
        <path {...p} d="M3 9h18l-2-5H5L3 9Z" />
        <path {...p} d="M5 9v11h14V9M9 20v-6h6v6" />
        <path {...p} d="M3 9c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0" />
      </>
    ),
    menu: (
      <>
        <path {...p} d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="19" cy="12" r="1.5" fill="currentColor" />
      </>
    ),
    database: (
      <>
        <ellipse {...p} cx="12" cy="5" rx="8" ry="3" />
        <path {...p} d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    balance: (
      <>
        <path {...p} d="M4 7h16M7 4v6M17 4v6M5 10h14v10H5z" />
        <path {...p} d="M8 14h8M8 17h5" />
      </>
    ),
    eye: (
      <>
        <path {...p} d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle {...p} cx="12" cy="12" r="2.7" />
      </>
    ),
    logout: (
      <>
        <path {...p} d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />
      </>
    ),
    search: (
      <>
        <circle {...p} cx="11" cy="11" r="6" />
        <path {...p} d="m16 16 4 4" />
      </>
    ),
    calendar: (
      <>
        <rect {...p} x="3" y="5" width="18" height="16" rx="2" />
        <path {...p} d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),
    file: (
      <>
        <path {...p} d="M6 2.5h8l4 4V21H6z" />
        <path {...p} d="M14 2.5V7h4M9 12h6M9 16h6" />
      </>
    ),
    check: (
      <>
        <circle {...p} cx="12" cy="12" r="9" />
        <path {...p} d="m8 12 2.5 2.5L16.5 8.5" />
      </>
    ),
    alert: (
      <>
        <path {...p} d="M12 3 2.8 20h18.4L12 3Z" />
        <path {...p} d="M12 9v5M12 17.5v.2" />
      </>
    ),
    info: (
      <>
        <circle {...p} cx="12" cy="12" r="9" />
        <path {...p} d="M12 10v6M12 7.5v.2" />
      </>
    ),
    filter: (
      <>
        <path {...p} d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
      </>
    ),
    arrow: (
      <>
        <path {...p} d="M5 12h14M14 7l5 5-5 5" />
      </>
    ),
    edit: (
      <>
        <path {...p} d="m4 20 4.2-1 10-10-3.2-3.2-10 10L4 20Z" />
        <path {...p} d="m13.8 7 3.2 3.2" />
      </>
    ),
    download: (
      <>
        <path {...p} d="M12 4v11M8 11l4 4 4-4" />
        <path {...p} d="M4 19h16" />
      </>
    ),
    shield: (
      <>
        <path {...p} d="M12 3 20 6v5c0 5-3.2 8.2-8 10-4.8-1.8-8-5-8-10V6l8-3Z" />
        <path {...p} d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
    phone: (
      <>
        <path {...p} d="M7 3h3l1 5-2 1c1 3 3 5 6 6l1.2-2 4.8 1v3c0 2-1.5 4-4 4C9 21 3 15 3 7c0-2.5 2-4 4-4Z" />
      </>
    ),
    settings: (
      <>
        <circle {...p} cx="12" cy="12" r="3" />
        <path
          {...p}
          d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6a7 7 0 0 0-1.7 1L5 6 3 9.4 5.1 11a7 7 0 0 0 0 2L3 14.6 5 18l2.3-1a7 7 0 0 0 1.7 1l.5 3h5l.5-3a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2.1-1.6a7 7 0 0 0 .1-1Z"
        />
      </>
    ),
  };
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      {paths[name] || paths.more}
    </svg>
  );
}
