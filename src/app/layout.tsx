import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser, DENAH_VIEWERS } from "@/lib/auth";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Kiwari App",
  description: "Aplikasi pencatatan iuran warga (IPL)",
};

export default async function RootLayout({
  children,
}: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50">
        {user && (
          <NavBar
            role={user.role}
            actualRole={user.actualRole}
            unitNo={user.unitNo}
            canViewDenah={DENAH_VIEWERS.includes(user.email)}
          />
        )}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
