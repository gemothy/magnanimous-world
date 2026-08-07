"use client";

import { useEffect } from "react";

export function PortalDoors({ active, onDone }: { active: boolean; onDone: () => void }) {
  useEffect(() => {
    if (!active) return;

    const timers = [
      window.setTimeout(() => {
        document.documentElement.classList.add("portalOpening");
      }, 60),
      window.setTimeout(() => {
        document.documentElement.classList.add("portalFlash");
      }, 1900),
      window.setTimeout(onDone, 2850)
    ];

    return () => {
      timers.forEach(window.clearTimeout);
      document.documentElement.classList.remove("portalOpening", "portalFlash");
    };
  }, [active, onDone]);

  if (!active) return null;

  return (
    <div className="portal" role="presentation">
      <div className="portalRays" />
      <div className="portalCore" />
      <div className="portalDoor left">
        <PortalEmblem />
      </div>
      <div className="portalDoor right">
        <PortalEmblem />
      </div>
      <div className="portalSeam" />
      <div className="portalWhite" />
      <button className="portalSkip" type="button" onClick={onDone}>
        Enter
      </button>
    </div>
  );
}

function PortalEmblem() {
  return (
    <svg className="portalEmblem" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
      <circle cx="100" cy="100" r="92" />
      <circle cx="100" cy="100" r="80" strokeDasharray="2 6" />
      {Array.from({ length: 24 }, (_, index) => {
        const angle = (index * 15 * Math.PI) / 180;
        const x1 = 100 + 80 * Math.cos(angle);
        const y1 = 100 + 80 * Math.sin(angle);
        const x2 = 100 + 90 * Math.cos(angle);
        const y2 = 100 + 90 * Math.sin(angle);
        return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} opacity="0.48" />;
      })}
      <circle cx="100" cy="100" r="34" fill="rgba(255,238,200,.06)" />
      <polygon points="100,40 134,150 46,82 154,82 66,150" opacity="0.78" />
      <text x="100" y="112" textAnchor="middle" fontSize="42" fill="currentColor" stroke="none">
        M
      </text>
    </svg>
  );
}
