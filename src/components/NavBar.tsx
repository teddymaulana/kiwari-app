"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { setViewAsWarga, setViewAsPengurus } from "@/lib/viewAs";
import type { Role } from "@/lib/auth";

const links = [
  { href: "/report", label: "Laporan" },
  { href: "/dashboard", label: "IPL" },
  { href: "/payments/new", label: "Catat Pembayaran", pengurusOnly: true },
  { href: "/payments", label: "Kelola Pembayaran", pengurusOnly: true },
  { href: "/households", label: "Warga", pengurusOnly: true },
  { href: "/contributions", label: "Sumbangan", pengurusOnly: true },
  { href: "/expenses", label: "Pengeluaran", pengurusOnly: true },
  { href: "/piutang", label: "Piutang", pengurusOnly: true },
  { href: "/settings", label: "Pengaturan", pengurusOnly: true },
];

function NavLinkPendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full border-2 border-current border-t-transparent align-middle transition-opacity delay-150 ${
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
  const visibleLinks = links.filter(
    (l) => !l.pengurusOnly || role === "pengurus"
  );

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
                  className={`hover:text-blue-600 transition whitespace-nowrap ${
                    pathname === l.href ? "font-semibold text-gray-900" : ""
                  }`}
                >
                  {l.label} <NavLinkPendingHint />
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
      <div className="max-w-5xl mx-auto px-4">
        <nav
          className={`flex gap-4 text-sm text-gray-600 pb-3 overflow-x-auto ${
            role === "pengurus" ? "" : "sm:hidden"
          }`}
        >
          {visibleLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`hover:text-blue-600 transition shrink-0 whitespace-nowrap ${
                pathname === l.href ? "font-semibold text-gray-900" : ""
              }`}
            >
              {l.label} <NavLinkPendingHint />
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
