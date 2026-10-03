import Link from "next/link";

// Compact CTA to the public /pengelolaan-sampah announcement for logged-in
// warga (who never see the big banner on /login). Same leaf/sun palette as
// that page and the /login banner.
export default function SampahBanner({
  className = "",
}: {
  className?: string;
}) {
  return (
    <Link
      href="/pengelolaan-sampah"
      className={`group relative flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-br from-[#2f6b3f] to-[#1f4a2b] px-4 py-2.5 text-white shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f2b544] ${className}`}
    >
      <div
        aria-hidden
        className="absolute -top-12 -right-8 h-28 w-28 rounded-full bg-[#3c7f4d] opacity-60"
      />
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f2b544] text-[#1f4a2b]">
        {/* Leaf */}
        <svg
          className="h-[18px] w-[18px]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7"
          />
        </svg>
      </div>
      <div className="relative min-w-0 flex-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-wider leading-tight text-[#f2b544]">
          Pemberitahuan Warga
        </p>
        <p className="text-sm font-semibold leading-snug">
          Perihal Pengelolaan Sampah Warga
        </p>
        <p className="text-xs text-[#dbe8dc]">
          Mohon sampah dibungkus rapat &amp; dipilah basah/kering.
        </p>
      </div>
      <span className="relative hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1f4a2b] transition group-hover:gap-2">
        Baca
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </span>
      <svg
        className="relative h-4 w-4 shrink-0 text-[#f2b544] sm:hidden"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
