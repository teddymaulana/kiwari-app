// Small abstract cluster of quarter-circles/circle sat above the side
// strip — purely decorative, echoing the reference kwitansi template's
// corner accent, in a monochrome grey palette.
export default function AccentShapes({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 60"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0,0 L30,0 A30,30 0 0 1 0,30 Z" fill="#1f2937" />
      <path d="M60,0 L30,0 A30,30 0 0 0 60,30 Z" fill="#d1d5db" />
      <path d="M60,60 L60,30 A30,30 0 0 1 30,60 Z" fill="#1f2937" />
      <circle cx="15" cy="45" r="12" fill="#9ca3af" />
    </svg>
  );
}
