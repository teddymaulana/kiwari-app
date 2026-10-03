"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/login/actions";
import { setViewAsWarga, setViewAsPengurus } from "@/lib/viewAs";
import type { Role } from "@/lib/auth";

// `highlight` adds a megaphone badge on the link's corner — marks a
// current warga announcement.
const links: {
  href: string;
  label: string;
  pengurusOnly?: boolean;
  highlight?: boolean;
}[] = [
  { href: "/report", label: "Laporan" },
  { href: "/mutasi", label: "Mutasi", pengurusOnly: true },
  { href: "/dashboard", label: "IPL" },
  { href: "/pengelolaan-sampah", label: "Lingkungan", highlight: true },
  { href: "/denah", label: "Denah" },
  { href: "/payments/new", label: "Catat Pembayaran", pengurusOnly: true },
  { href: "/payments", label: "Kelola Pembayaran", pengurusOnly: true },
  { href: "/households", label: "Warga", pengurusOnly: true },
  { href: "/contributions", label: "Sumbangan", pengurusOnly: true },
  { href: "/expenses", label: "Pengeluaran", pengurusOnly: true },
  { href: "/piutang", label: "Piutang", pengurusOnly: true },
  { href: "/security", label: "Keamanan" },
  { href: "/humas", label: "Humas", pengurusOnly: true },
  { href: "/settings", label: "Pengaturan", pengurusOnly: true },
];

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

// Small amber circle with a megaphone, pinned to the link's top-right
// corner like a notification badge. The wrapper's right margin makes room
// for it so it doesn't collide with the next link.
function AnnouncementLabel({ label }: { label: string }) {
  return (
    <span className="relative mr-4 inline-block">
      {label}
      <span
        aria-hidden="true"
        className="absolute -top-2 -right-5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm ring-2 ring-white"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z" />
          <path d="M15 9a3 3 0 010 6M18 6.5a7 7 0 010 11" />
        </svg>
      </span>
    </span>
  );
}

// Absolutely positioned (in the link's right padding/gap) so the hidden
// spinner takes no width — otherwise it pushes the label off-center from
// the link's active underline.
function NavLinkPendingHint({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`absolute top-[calc(50%-4px)] ${className} h-2 w-2 shrink-0 rounded-full border-2 border-current border-t-transparent align-middle transition-opacity delay-150 ${
        pending ? "animate-spin opacity-100" : "opacity-0"
      }`}
    />
  );
}

export default function NavBar({
  role,
  actualRole,
  unitNo,
}: {
  role: Role;
  actualRole: Role;
  unitNo: string | null;
}) {
  const pathname = usePathname();
  const visibleLinks = links.filter((l) => !l.pengurusOnly || role === "pengurus");

  // Hiding the scrollbar on the tab row (below) removes the only native
  // hint that it scrolls — these edge fades replace it, only showing on
  // whichever side still has more tabs off-screen (so they disappear once
  // you've scrolled all the way, like Gmail/Slack's tab bars).
  const tabsRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // Re-measure when the tab list itself changes (view-as toggle swaps
    // how many links are visible, which changes whether it overflows).
  }, [role, visibleLinks.length]);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-6 min-w-0">
          <span className="font-semibold text-gray-900 shrink-0 flex items-center gap-2">
            KIWARI
            {unitNo && (
              <span className="text-xs font-normal text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                {unitNo}
              </span>
            )}
          </span>
          {role !== "pengurus" && (
            <nav className="hidden sm:flex gap-4 text-sm text-gray-600">
              {visibleLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative hover:text-blue-600 transition whitespace-nowrap ${
                    pathname === l.href ? "font-semibold text-gray-900" : ""
                  }`}
                >
                  {l.highlight ? (
                    <AnnouncementLabel label={l.label} />
                  ) : (
                    l.label
                  )}
                  <NavLinkPendingHint className="-right-3" />
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 shrink-0">
          {actualRole === "pengurus" && (
            <div className="flex items-center rounded-full border border-gray-300 p-0.5 text-xs">
              <form action={setViewAsPengurus}>
                <button
                  type="submit"
                  className={`px-2 py-0.5 rounded-full transition ${
                    role === "pengurus"
                      ? "bg-blue-600 text-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Pengurus
                </button>
              </form>
              <form action={setViewAsWarga}>
                <button
                  type="submit"
                  className={`px-2 py-0.5 rounded-full transition ${
                    role === "warga"
                      ? "bg-blue-600 text-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Warga
                </button>
              </form>
            </div>
          )}
          <Link
            href="/profile"
            className={`hover:text-blue-600 transition ${
              pathname === "/profile" ? "font-semibold text-gray-900" : ""
            }`}
          >
            Profil
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="text-gray-500 hover:text-red-600 transition"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 border-t border-gray-100 relative">
        <nav
          ref={tabsRef}
          className={`flex gap-px sm:gap-1 text-sm overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            role === "pengurus" ? "" : "sm:hidden"
          }`}
        >
          {visibleLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative shrink-0 whitespace-nowrap border-b-2 px-2.5 sm:px-3 py-2.5 transition ${
                  active
                    ? "border-blue-600 font-medium text-blue-700"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
                }`}
              >
                {l.highlight ? (
                  <AnnouncementLabel label={l.label} />
                ) : (
                  l.label
                )}
                <NavLinkPendingHint className="right-0.5" />
              </Link>
            );
          })}
        </nav>
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll menu ke kiri"
            onClick={() =>
              tabsRef.current?.scrollBy({ left: -160, behavior: "smooth" })
            }
            className="absolute inset-y-0 left-4 flex w-10 items-center justify-start bg-gradient-to-r from-white via-white to-transparent"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm transition hover:border-gray-400 hover:text-gray-900">
              <ChevronIcon direction="left" />
            </span>
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll menu ke kanan"
            onClick={() =>
              tabsRef.current?.scrollBy({ left: 160, behavior: "smooth" })
            }
            className="absolute inset-y-0 right-4 flex w-10 items-center justify-end bg-gradient-to-l from-white via-white to-transparent"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm transition hover:border-gray-400 hover:text-gray-900">
              <ChevronIcon direction="right" />
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
