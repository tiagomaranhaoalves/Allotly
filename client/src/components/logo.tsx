export function LogoFull({ className = "", size = 32 }: { className?: string; size?: number }) {
  const h = size;
  const w = (h / 40) * 180;
  return (
    <svg viewBox="0 0 180 40" width={w} height={h} className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Allotly">
      <g>
        <circle cx="14" cy="20" r="6.5" fill="#6366F1" />
        <circle cx="27" cy="10" r="4" fill="#6366F1" opacity="0.7" />
        <circle cx="27" cy="20" r="4" fill="#6366F1" opacity="0.55" />
        <circle cx="27" cy="30" r="4" fill="#6366F1" opacity="0.4" />
        <line x1="19.5" y1="17" x2="23.5" y2="12" stroke="#6366F1" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
        <line x1="20" y1="20" x2="23" y2="20" stroke="#6366F1" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
        <line x1="19.5" y1="23" x2="23.5" y2="28" stroke="#6366F1" strokeWidth="1.8" strokeLinecap="round" opacity="0.4" />
      </g>
      <text x="37" y="27.5" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="21" letterSpacing="-0.02em" className="fill-neutral-800 dark:fill-white">
        Allotly
      </text>
    </svg>
  );
}

export function LogoIcon({ className = "", size = 32 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Allotly">
      <circle cx="12" cy="18" r="7" fill="#6366F1" />
      <circle cx="26" cy="8" r="4.5" fill="#6366F1" opacity="0.7" />
      <circle cx="26" cy="18" r="4.5" fill="#6366F1" opacity="0.55" />
      <circle cx="26" cy="28" r="4.5" fill="#6366F1" opacity="0.4" />
      <line x1="17.5" y1="14.5" x2="22" y2="10" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <line x1="18.5" y1="18" x2="22" y2="18" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <line x1="17.5" y1="21.5" x2="22" y2="26" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

export function LogoMono({ className = "", size = 32 }: { className?: string; size?: number }) {
  const h = size;
  const w = (h / 40) * 180;
  return (
    <svg viewBox="0 0 180 40" width={w} height={h} className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Allotly">
      <g opacity="0.9">
        <circle cx="14" cy="20" r="6.5" fill="currentColor" />
        <circle cx="27" cy="10" r="4" fill="currentColor" opacity="0.6" />
        <circle cx="27" cy="20" r="4" fill="currentColor" opacity="0.45" />
        <circle cx="27" cy="30" r="4" fill="currentColor" opacity="0.35" />
        <line x1="19.5" y1="17" x2="23.5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
        <line x1="20" y1="20" x2="23" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.4" />
        <line x1="19.5" y1="23" x2="23.5" y2="28" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.35" />
      </g>
      <text x="37" y="27.5" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="21" letterSpacing="-0.02em" fill="currentColor" opacity="0.9">
        Allotly
      </text>
    </svg>
  );
}
