export function LogoFull({ className = "", size = 32 }: { className?: string; size?: number }) {
  const h = size;
  const w = h * 4.5;
  return (
    <svg viewBox="0 0 180 40" width={w} height={h} className={className} aria-label="Allotly">
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient id="nodeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <g transform="translate(2, 4)">
        <path d="M16 16 L5.5 6.5" stroke="url(#nodeGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <path d="M16 16 L5.5 25.5" stroke="url(#nodeGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <path d="M16 16 L26.5 6.5" stroke="url(#nodeGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <path d="M16 16 L26.5 25.5" stroke="url(#nodeGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <path d="M16 16 L16 3" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        <path d="M16 16 L16 29" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />

        <circle cx="16" cy="16" r="5" fill="url(#logoGrad)" />
        <circle cx="16" cy="16" r="2" fill="white" opacity="0.9" />

        <circle cx="5.5" cy="6.5" r="3" fill="url(#nodeGrad)" opacity="0.85" />
        <circle cx="5.5" cy="25.5" r="3" fill="url(#nodeGrad)" opacity="0.75" />
        <circle cx="26.5" cy="6.5" r="3" fill="url(#nodeGrad)" opacity="0.85" />
        <circle cx="26.5" cy="25.5" r="3" fill="url(#nodeGrad)" opacity="0.75" />
        <circle cx="16" cy="3" r="2.5" fill="url(#logoGrad)" opacity="0.65" />
        <circle cx="16" cy="29" r="2.5" fill="url(#logoGrad)" opacity="0.65" />
      </g>
      <text
        x="40"
        y="28"
        fontFamily="Inter, sans-serif"
        fontWeight="800"
        fontSize="22"
        letterSpacing="-0.03em"
        className="fill-[#1e1b4b] dark:fill-white"
      >
        Allotly
      </text>
    </svg>
  );
}

export function LogoIcon({ className = "", size = 32 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-label="Allotly">
      <defs>
        <linearGradient id="iconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient id="iconNodeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <path d="M16 16 L4.5 4.5" stroke="url(#iconNodeGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <path d="M16 16 L4.5 27.5" stroke="url(#iconNodeGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <path d="M16 16 L27.5 4.5" stroke="url(#iconNodeGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <path d="M16 16 L27.5 27.5" stroke="url(#iconNodeGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <path d="M16 16 L16 2.5" stroke="url(#iconGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M16 16 L16 29.5" stroke="url(#iconGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />

      <circle cx="16" cy="16" r="5.5" fill="url(#iconGrad)" />
      <circle cx="16" cy="16" r="2.5" fill="white" opacity="0.9" />

      <circle cx="4.5" cy="4.5" r="3.2" fill="url(#iconNodeGrad)" opacity="0.85" />
      <circle cx="4.5" cy="27.5" r="3.2" fill="url(#iconNodeGrad)" opacity="0.75" />
      <circle cx="27.5" cy="4.5" r="3.2" fill="url(#iconNodeGrad)" opacity="0.85" />
      <circle cx="27.5" cy="27.5" r="3.2" fill="url(#iconNodeGrad)" opacity="0.75" />
      <circle cx="16" cy="2.5" r="2.8" fill="url(#iconGrad)" opacity="0.65" />
      <circle cx="16" cy="29.5" r="2.8" fill="url(#iconGrad)" opacity="0.65" />
    </svg>
  );
}

export function LogoMono({ className = "", size = 32 }: { className?: string; size?: number }) {
  const h = size;
  const w = h * 4.5;
  return (
    <svg viewBox="0 0 180 40" width={w} height={h} className={className} aria-label="Allotly">
      <g transform="translate(2, 4)">
        <path d="M16 16 L5.5 6.5" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        <path d="M16 16 L5.5 25.5" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        <path d="M16 16 L26.5 6.5" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        <path d="M16 16 L26.5 25.5" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        <path d="M16 16 L16 3" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
        <path d="M16 16 L16 29" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.35" />

        <circle cx="16" cy="16" r="5" fill="white" />
        <circle cx="16" cy="16" r="2" fill="#1e1b4b" opacity="0.4" />

        <circle cx="5.5" cy="6.5" r="3" fill="white" opacity="0.7" />
        <circle cx="5.5" cy="25.5" r="3" fill="white" opacity="0.6" />
        <circle cx="26.5" cy="6.5" r="3" fill="white" opacity="0.7" />
        <circle cx="26.5" cy="25.5" r="3" fill="white" opacity="0.6" />
        <circle cx="16" cy="3" r="2.5" fill="white" opacity="0.5" />
        <circle cx="16" cy="29" r="2.5" fill="white" opacity="0.5" />
      </g>
      <text x="40" y="28" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="22" letterSpacing="-0.03em" fill="white">
        Allotly
      </text>
    </svg>
  );
}
