export function LogoFull({ className = "", size = 32 }: { className?: string; size?: number }) {
  const h = size;
  const w = h * 4.5;
  return (
    <svg viewBox="0 0 180 40" width={w} height={h} className={className} aria-label="Allotly">
      <g transform="translate(2, 4)">
        <circle cx="16" cy="16" r="4" fill="#6366F1" />
        <circle cx="4" cy="6" r="2.5" fill="#6366F1" opacity="0.7" />
        <circle cx="4" cy="26" r="2.5" fill="#6366F1" opacity="0.7" />
        <circle cx="28" cy="6" r="2.5" fill="#6366F1" opacity="0.7" />
        <circle cx="28" cy="26" r="2.5" fill="#6366F1" opacity="0.7" />
        <line x1="16" y1="16" x2="4" y2="6" stroke="#6366F1" strokeWidth="1.5" opacity="0.5" />
        <line x1="16" y1="16" x2="4" y2="26" stroke="#6366F1" strokeWidth="1.5" opacity="0.5" />
        <line x1="16" y1="16" x2="28" y2="6" stroke="#6366F1" strokeWidth="1.5" opacity="0.5" />
        <line x1="16" y1="16" x2="28" y2="26" stroke="#6366F1" strokeWidth="1.5" opacity="0.5" />
      </g>
      <text
        x="40"
        y="27"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="22"
        letterSpacing="-0.02em"
        className="fill-[#1F2937] dark:fill-white"
      >
        Allotly
      </text>
    </svg>
  );
}

export function LogoIcon({ className = "", size = 32 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-label="Allotly">
      <circle cx="16" cy="16" r="4" fill="#6366F1" />
      <circle cx="4" cy="4" r="2.5" fill="#6366F1" opacity="0.7" />
      <circle cx="4" cy="28" r="2.5" fill="#6366F1" opacity="0.7" />
      <circle cx="28" cy="4" r="2.5" fill="#6366F1" opacity="0.7" />
      <circle cx="28" cy="28" r="2.5" fill="#6366F1" opacity="0.7" />
      <line x1="16" y1="16" x2="4" y2="4" stroke="#6366F1" strokeWidth="1.5" opacity="0.5" />
      <line x1="16" y1="16" x2="4" y2="28" stroke="#6366F1" strokeWidth="1.5" opacity="0.5" />
      <line x1="16" y1="16" x2="28" y2="4" stroke="#6366F1" strokeWidth="1.5" opacity="0.5" />
      <line x1="16" y1="16" x2="28" y2="28" stroke="#6366F1" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

export function LogoMono({ className = "", size = 32 }: { className?: string; size?: number }) {
  const h = size;
  const w = h * 4.5;
  return (
    <svg viewBox="0 0 180 40" width={w} height={h} className={className} aria-label="Allotly">
      <g transform="translate(2, 4)">
        <circle cx="16" cy="16" r="4" fill="white" />
        <circle cx="4" cy="6" r="2.5" fill="white" opacity="0.7" />
        <circle cx="4" cy="26" r="2.5" fill="white" opacity="0.7" />
        <circle cx="28" cy="6" r="2.5" fill="white" opacity="0.7" />
        <circle cx="28" cy="26" r="2.5" fill="white" opacity="0.7" />
        <line x1="16" y1="16" x2="4" y2="6" stroke="white" strokeWidth="1.5" opacity="0.5" />
        <line x1="16" y1="16" x2="4" y2="26" stroke="white" strokeWidth="1.5" opacity="0.5" />
        <line x1="16" y1="16" x2="28" y2="6" stroke="white" strokeWidth="1.5" opacity="0.5" />
        <line x1="16" y1="16" x2="28" y2="26" stroke="white" strokeWidth="1.5" opacity="0.5" />
      </g>
      <text x="40" y="27" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="22" letterSpacing="-0.02em" fill="white">
        Allotly
      </text>
    </svg>
  );
}
