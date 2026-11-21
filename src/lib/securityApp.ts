// Latest Security Kiwari Android build, linked from the Keamanan guides
// (/panduan-sekuriti, /panduan-pengurus-keamanan). Update after every
// `npm run build:apk` in mobile/ (the link is on the build's expo.dev page).
export const SECURITY_APK_URL =
  "https://expo.dev/artifacts/eas/rbvW3-Z9os4eKf6qOdh6R1JdJjeMOLVsPoxIu3jGw-w.apk";

// Display order of guards (schedule, Kontak Security, exports), matching
// the Jadwal Security PDF. Anyone not listed — e.g. a newly added guard —
// comes after, in their existing order.
const GUARD_ORDER = ["Dedi", "Didin", "Nova", "Ayi", "Septi"];

export function guardRank(name: string): number {
  const i = GUARD_ORDER.findIndex((n) => n.toLowerCase() === name.trim().toLowerCase());
  return i === -1 ? GUARD_ORDER.length : i;
}

// The security app went live on this date — earlier shifts had no app
// absen, so they're never counted as "Tidak absen".
export const ABSEN_TRACKING_START = "2026-11-19";
