"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import type { Role } from "@/lib/auth";

const links = [
  { href: "/dashboard", label: "IPL" },
  { href: "/payments/new", label: "Catat Pembayaran", pengurusOnly: true },
  { href: "/households", label: "Warga", pengurusOnly: true },
  { href: "/report", label: "Laporan" },
  { href: "/contributions", label: "Sumbangan" },
  { href: "/expenses", label: "Pengeluaran" },
  { href: "/piutang", label: "Piutang", pengurusOnly: true },
  { href: "/settings", label: "Pengaturan", pengurusOnly: true },
];

export default function NavBar({
  email,
  role,
  unitNo,
}: {
  email: string;
  role: Role;
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
          <nav className="hidden sm:flex gap-4 text-sm text-gray-600">
            {visibleLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`hover:text-blue-600 transition whitespace-nowrap ${
                  pathname === l.href ? "font-semibold text-gray-900" : ""
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 shrink-0">
          <span className="hidden sm:inline truncate max-w-40">{email}</span>
          {role === "warga" && (
            <Link
              href="/profile"
              className={`hover:text-blue-600 transition ${
                pathname === "/profile" ? "font-semibold text-gray-900" : ""
              }`}
            >
              Profil
            </Link>
          )}
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
      <nav className="sm:hidden flex gap-4 text-sm text-gray-600 px-4 pb-3 overflow-x-auto">
        {visibleLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`hover:text-blue-600 transition shrink-0 whitespace-nowrap ${
              pathname === l.href ? "font-semibold text-gray-900" : ""
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
