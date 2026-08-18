"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const VIEW_AS_COOKIE = "view_as_warga";

// UI-only preview toggle for pengurus — sets a cookie that getCurrentUser()
// checks to report an overridden `role`. Never touches profiles.role, so
// RLS-backed permissions are completely unaffected; this only changes what
// the app's own `role === "pengurus"` UI/redirect checks see.
export async function setViewAsWarga() {
  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export async function setViewAsPengurus() {
  const cookieStore = await cookies();
  cookieStore.delete(VIEW_AS_COOKIE);
  revalidatePath("/", "layout");
}
