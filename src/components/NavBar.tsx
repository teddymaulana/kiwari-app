import Link from "next/link";
import { signOut } from "@/app/login/actions";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/payments/new", label: "Catat Pembayaran" },
  { href: "/households", label: "Warga" },
  { href: "/report", label: "Laporan" },
  { href: "/settings", label: "Pengaturan" },
];

export default function NavBar({ email }: { email: string }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-gray-900">Kas Warga</span>
          <nav className="flex gap-4 text-sm text-gray-600">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="hover:text-blue-600 transition"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{email}</span>
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
    </header>
  );
}
