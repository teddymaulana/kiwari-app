import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Kas Warga",
  description: "Aplikasi pencatatan iuran warga (IPL)",
};

export default async function RootLayout({
  children,
}: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50">
        {user && <NavBar email={user.email ?? ""} />}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
