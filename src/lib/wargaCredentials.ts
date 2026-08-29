import fs from "fs";
import path from "path";

// Shared by the gateway send (households/actions.ts sendLoginInvite) and
// the manual wa.me link (households/page.tsx), so both ever say the same
// thing regardless of which one a given send used.
export const loginInviteMessage = (email: string, password: string) =>
  `Halo, warga Kiwari! berikut info login akun Anda untuk aplikasi Kiwari Residence (IPL):\n\nUsername: ${email}\nPassword: ${password}\n\nLogin di: https://kiwari-app.vercel.app/\n\nBelum pernah bayar lewat sini? Lihat cara Bayar IPL di: https://kiwari-app.vercel.app/tutorial-bayar-ipl`;

type Credential = { email: string; password: string };

// Reads and parses warga_credentials.csv once — the one-time output of
// the bulk warga-account-creation script (see create_warga_users.js).
// Supabase Auth never stores plaintext passwords, so this CSV is the only
// place they still exist; only units created by that script (status "OK")
// have a row here.
//
// Plain module (not a "use server" action file) so both households/
// page.tsx (building wa.me links for every row at render time) and
// households/actions.ts (looking up one unit inside a server action) can
// import it.
export function loadCredentials(): Map<string, Credential> {
  const csvPath = path.join(process.cwd(), "warga_credentials.csv");
  const byUnit = new Map<string, Credential>();
  let csv: string;
  try {
    csv = fs.readFileSync(csvPath, "utf8");
  } catch {
    return byUnit;
  }
  for (const line of csv.split("\n").slice(1)) {
    const m = line.match(/^([^,]+),"([^"]*)",([^,]+),([^,]*),(.+)$/);
    if (m && m[5].trim() === "OK") {
      byUnit.set(m[1].trim(), { email: m[3].trim(), password: m[4].trim() });
    }
  }
  return byUnit;
}

export function findCredential(unitNo: string): Credential | null {
  return loadCredentials().get(unitNo) ?? null;
}

// Units with a retrievable login password — used only to decide whether
// "Kirim Info Login" shows for a row.
export function unitsWithCredentials(): Set<string> {
  return new Set(loadCredentials().keys());
}
