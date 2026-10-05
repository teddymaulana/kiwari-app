import { createClient } from "@/lib/supabase/server";
import type { Household, WaMessage } from "@/lib/types";
import { BOT_SENDER, normalizePhone, stripTrigger } from "@/lib/waBot";

const QUESTION_LIMIT = 30;
// A bot reply counts as the answer to a question if it went to the same
// number within this window — replies normally land in under a minute.
const REPLY_WINDOW_MS = 5 * 60 * 1000;

// Who asked, by the same normalized-phone match the bot itself uses —
// the pasangan's own name when it's their number, like /humas does.
function askerLabel(phone: string, households: Household[]): string {
  const key = normalizePhone(phone);
  const h = households.find(
    (x) => normalizePhone(x.phone) === key || normalizePhone(x.phone_pasangan) === key
  );
  if (!h) return `Tidak terdaftar (${phone})`;
  const pasanganName =
    normalizePhone(h.phone) !== key ? h.alt_names?.split(",")[0]?.trim() : null;
  return `${h.unit_no} - ${pasanganName || h.name}`;
}

// Asisten Kiwari question log for /settings (18G only, see
// WHATSAPP_BOT_MANAGERS) — every @tanyakiwari message, newest first,
// paired with the bot's reply. These rows are hidden from /humas while
// the bot is private, so this is the only place they show up.
export default async function BotHistory({
  households,
}: {
  households: Household[];
}) {
  const supabase = await createClient();

  const { data: questions } = await supabase
    .from("wa_messages")
    .select("*")
    .eq("direction", "in")
    .eq("is_group", false)
    .ilike("message", "%@tanyakiwari%")
    .order("created_at", { ascending: false })
    .limit(QUESTION_LIMIT)
    .returns<WaMessage[]>();

  const oldest = questions?.[questions.length - 1]?.created_at;
  const { data: replies } = oldest
    ? await supabase
        .from("wa_messages")
        .select("*")
        .eq("direction", "out")
        .eq("sent_by", BOT_SENDER)
        .gte("created_at", oldest)
        .order("created_at", { ascending: true })
        .returns<WaMessage[]>()
    : { data: [] as WaMessage[] };

  const replyFor = (q: WaMessage) => {
    const asked = new Date(q.created_at).getTime();
    const key = normalizePhone(q.phone);
    return (replies ?? []).find((r) => {
      const at = new Date(r.created_at).getTime();
      return (
        normalizePhone(r.phone) === key && at >= asked && at - asked <= REPLY_WINDOW_MS
      );
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
      {(questions ?? []).map((q) => {
        const reply = replyFor(q);
        return (
          <div key={q.id} className="px-4 py-3 text-sm space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-gray-900">
                {askerLabel(q.phone, households)}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(q.created_at).toLocaleString("id-ID")}
              </span>
            </div>
            <p className="text-gray-800 whitespace-pre-wrap break-words">
              {stripTrigger(q.message ?? "") || (
                <span className="text-gray-400 italic">(hanya @tanyakiwari)</span>
              )}
            </p>
            {reply ? (
              <details className="text-xs text-gray-600">
                <summary className="cursor-pointer text-green-700">Dibalas bot</summary>
                <p className="mt-1 whitespace-pre-wrap break-words bg-gray-50 rounded px-3 py-2">
                  {reply.message}
                </p>
              </details>
            ) : (
              <p className="text-xs text-amber-700">
                Tidak dibalas — bot Off, batas 15 balasan/hari, atau gagal
                (cek activity_log: whatsapp.bot_failed)
              </p>
            )}
          </div>
        );
      })}
      {(questions ?? []).length === 0 && (
        <div className="px-4 py-6 text-center text-gray-400 text-xs">
          Belum ada pertanyaan.
        </div>
      )}
    </div>
  );
}
