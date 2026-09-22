import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, WHATSAPP_TEST_SENDERS } from "@/lib/auth";
import { sendTestWhatsApp } from "./actions";
import type { Household, WaMessage } from "@/lib/types";
import { compareUnitNo, WA_STATUS_LABELS } from "@/lib/types";
import { WARGA_GROUP_ID } from "@/lib/wablas";
import WhatsAppSendForm from "@/components/WhatsAppSendForm";
import ResultPopup from "@/components/ResultPopup";

// sendTestWhatsApp (./actions.ts) can wait up to TIMEOUT_MS (wablas.ts,
// currently 45s) for a slow Wablas reply — without this, Vercel's default
// function limit can kill the Server Action first with a generic error
// instead of that timeout's own graceful message.
export const maxDuration = 60;

// Best-effort "who is this" label for a wa_messages.phone value — matches
// it against every household's phone/phone_pasangan (same numbers
// WargaPhoneSelect offers), falling back to the raw number when it's
// nobody registered (e.g. a personal contact, or a number that's since
// changed).
function contactLabel(phone: string, households: Household[]): string {
  if (phone === WARGA_GROUP_ID) return "Kiwari Emas";
  const h = households.find(
    (x) => x.phone === phone || x.phone_pasangan === phone
  );
  if (!h) return phone;
  const pasanganName =
    h.phone_pasangan === phone ? h.alt_names?.split(",")[0]?.trim() : null;
  return `${h.unit_no} - ${pasanganName || h.name}`;
}

// "out" badge reflects the real status from Wablas's tracking webhook once
// it's arrived (pending/sent/delivered/read/...) — falls back to a plain
// "Terkirim" for rows sent before that webhook was wired up, or whose id
// it hasn't matched yet, so the send having gone through still shows.
function outStatusBadge(status: string | null): {
  label: string;
  className: string;
} {
  if (status === "reject" || status === "cancel" || status === "failed") {
    return {
      label: WA_STATUS_LABELS[status] ?? status,
      className: "bg-red-50 text-red-700",
    };
  }
  if (status === "delivered" || status === "read") {
    return {
      label: WA_STATUS_LABELS[status],
      className: "bg-green-50 text-green-700",
    };
  }
  return {
    label: status ? (WA_STATUS_LABELS[status] ?? status) : "Terkirim",
    className: "bg-blue-50 text-blue-700",
  };
}

export default async function HumasPage({
  searchParams,
}: {
  searchParams: Promise<{ wa_error?: string; wa_success?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const { wa_error, wa_success } = await searchParams;

  const supabase = await createClient();
  const { data: households } = await supabase
    .from("households")
    .select("*")
    .eq("is_active", true)
    .returns<Household[]>();

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  const { data: messages } = await supabase
    .from("wa_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<WaMessage[]>();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 mb-6">Humas</h1>

        {WHATSAPP_TEST_SENDERS.includes(user.email) && (
          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-1">
              Kirim Pesan WhatsApp
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Uji coba integrasi WhatsApp — kirim pesan manual ke satu nomor,
              lewat gateway yang sedang aktif di Pengaturan.
            </p>

            {wa_error && <ResultPopup kind="error" message={wa_error} />}
            {wa_success && (
              <ResultPopup kind="success" message="Pesan berhasil dikirim." />
            )}

            <WhatsAppSendForm
              action={sendTestWhatsApp}
              households={households ?? []}
            />
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-1">
          Percakapan WhatsApp
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Riwayat pesan lewat gateway Wablas — pesan terkirim dari Kiwari (Kirim
          Pesan WhatsApp) dan balasan yang masuk. Hanya menangkap pesan yang
          lewat Wablas, bukan Fonnte — lihat Layanan WhatsApp di Pengaturan
          untuk gateway yang sedang aktif.
        </p>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {(messages ?? []).map((m) => {
            const badge =
              m.direction === "in"
                ? { label: "Masuk", className: "bg-green-50 text-green-700" }
                : outStatusBadge(m.status);
            return (
              <div key={m.id} className="px-4 py-2.5 text-sm flex gap-3">
                <span
                  className={`shrink-0 mt-0.5 text-[10px] font-medium rounded-full px-2 py-0.5 h-fit ${badge.className}`}
                >
                  {badge.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs text-gray-400">
                    <span className="truncate">
                      {contactLabel(m.phone, households ?? [])}
                    </span>
                    <span className="shrink-0">
                      {new Date(m.created_at).toLocaleString("id-ID")}
                    </span>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap break-words">
                    {m.message || (
                      <span className="text-gray-400 italic">
                        ({m.message_type || "non-teks"})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
          {(messages ?? []).length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-xs">
              Belum ada percakapan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
