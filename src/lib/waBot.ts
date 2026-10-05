import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { sendViaWablas } from "@/lib/wablas";
import { getKasSaatIni } from "@/lib/kasSummary";
import type { Household } from "@/lib/types";
import { formatRupiah, iplFirstMonth, MONTH_NAMES, SHIFT_LABELS } from "@/lib/types";

// WhatsApp auto-reply ("Asisten Kiwari") for warga who chat the Kiwari
// Wablas number directly. Kicked off from the incoming-message webhook
// (api/webhooks/wablas/route.ts) via after(), so Wablas gets its 2xx
// immediately and this runs in the background. It only answers private
// messages that mention "@tanyakiwari" (see TRIGGER) — everything else is left
// for pengurus.
//
// Gated by settings.whatsapp_bot_enabled (Pengaturan > Asisten WhatsApp,
// default off) and never fires while Layanan WhatsApp is "off". The
// household is resolved from the sender's number, never from anything in
// the message — every tool below is bound to that household server-side,
// so a warga can't talk the bot into reading another unit's data. Tools
// are read-only; paying still goes through the Bayar IPL form.

const MODEL = "claude-sonnet-5-5";
const APP_URL = "https://kiwari-app.vercel.app";

// Replies per number per rolling 24h — caps API spend and keeps the
// number from looking spammy to WhatsApp if someone chats non-stop.
const DAILY_REPLY_LIMIT = 15;
// Recent @tanyakiwari messages and the bot's own replies, replayed as
// conversation context.
const HISTORY_LIMIT = 10;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_TOOL_ROUNDS = 5;

export const BOT_SENDER = "bot";

// The bot only answers messages that call it by name — anything else sent
// to the Kiwari number is left for pengurus to read on /humas.
// Standalone "@tanyakiwari" only — not inside a longer word or an email address.
const TRIGGER = /(?<![\w.])@tanyakiwari(?!\w|\.\w)/i;

function hasTrigger(message: string | null | undefined): boolean {
  return TRIGGER.test(message ?? "");
}

function stripTrigger(message: string): string {
  return message.replace(new RegExp(TRIGGER.source, "gi"), "").trim();
}

const UNKNOWN_NUMBER_REPLY =
  "Halo! Nomor ini belum terdaftar sebagai warga Kiwari Residence, jadi Asisten Kiwari belum bisa membantu. Silakan hubungi pengurus untuk mendaftarkan nomor Anda.";

// wa_messages.phone holds whatever Wablas sent (62…, +62…, …@c.us) while
// households store the local 08… form — compare on one canonical form.
export function normalizePhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").split("@")[0].replace(/\D/g, "");
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  if (digits.startsWith("8")) return `0${digits}`;
  return digits;
}

export async function isBotEnabled(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("settings")
    .select("whatsapp_bot_enabled")
    .eq("id", 1)
    .single<{ whatsapp_bot_enabled: boolean | null }>();
  return data?.whatsapp_bot_enabled ?? false;
}

type Incoming = {
  phone: string;
  message: string;
  isGroup: boolean;
  messageType: string;
};

export async function handleIncomingMessage(incoming: Incoming): Promise<void> {
  if (incoming.isGroup || !incoming.phone || incoming.phone === "unknown") return;
  if (!hasTrigger(incoming.message)) return;
  if (!(await isBotEnabled())) return;
  // The bot always replies through Wablas (the number warga are chatting),
  // but "off" means no automatic sends at all, anywhere.
  if ((await getWhatsAppProvider()) === "off") return;

  const admin = createAdminClient();
  const phoneKey = normalizePhone(incoming.phone);
  const since = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();

  // Every recent row, whichever raw format Wablas used for this number —
  // filtered by normalized phone here rather than in SQL.
  const { data: recentRows } = await admin
    .from("wa_messages")
    .select("direction, phone, message, sent_by, created_at")
    .eq("is_group", false)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .returns<
      {
        direction: "in" | "out";
        phone: string;
        message: string | null;
        sent_by: string | null;
        created_at: string;
      }[]
    >();
  const thread = (recentRows ?? []).filter(
    (r) => normalizePhone(r.phone) === phoneKey
  );

  const botReplies = thread.filter(
    (r) => r.direction === "out" && r.sent_by === BOT_SENDER
  );
  if (botReplies.length >= DAILY_REPLY_LIMIT) return;

  const { data: households } = await admin
    .from("households")
    .select("*")
    .eq("is_active", true)
    .returns<Household[]>();
  const household = (households ?? []).find(
    (h) =>
      normalizePhone(h.phone) === phoneKey ||
      normalizePhone(h.phone_pasangan) === phoneKey
  );

  if (!household) {
    // Once per 24h at most — otherwise every message from a stranger
    // (or another bot) would get the same canned reply.
    if (botReplies.length === 0) {
      await sendBotReply(incoming.phone, UNKNOWN_NUMBER_REPLY, "unregistered");
    }
    return;
  }

  // Only the bot's side of the thread: warga messages that called it,
  // and its own replies — not chats meant for pengurus.
  const conversation = thread.filter((r) =>
    r.direction === "in" ? hasTrigger(r.message) : r.sent_by === BOT_SENDER
  );

  let reply: string;
  try {
    reply = await generateReply(household, incoming.phone, conversation);
  } catch (err) {
    await admin.from("activity_log").insert({
      actor_email: BOT_SENDER,
      action: "whatsapp.bot_failed",
      detail: `${household.unit_no} - ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  if (!reply.trim()) return;

  await sendBotReply(incoming.phone, reply, household.unit_no);
}

async function sendBotReply(phone: string, message: string, unitLabel: string) {
  const admin = createAdminClient();
  const result = await sendViaWablas(phone, message);

  await admin.from("activity_log").insert({
    actor_email: BOT_SENDER,
    action: result.success ? "whatsapp.bot_reply" : "whatsapp.bot_reply_failed",
    detail: result.success
      ? `${unitLabel} - ${phone}`
      : `${unitLabel} - ${phone} - ${result.reason} - ${result.detail}`,
  });

  if (result.success) {
    await admin.from("wa_messages").insert({
      direction: "out",
      phone,
      is_group: false,
      message,
      sent_by: BOT_SENDER,
      wablas_message_id: result.messageId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Claude

const SYSTEM_PROMPT = `Kamu adalah "Asisten Kiwari", asisten WhatsApp otomatis untuk warga perumahan Kiwari Residence. Kamu membalas chat warga atas nama pengurus.

Warga memanggil kamu dengan menulis "@tanyakiwari" di pesannya — pesan tanpa "@tanyakiwari" dibaca pengurus, bukan kamu. Kalau warga menyapa tanpa pertanyaan, perkenalkan diri singkat dan sebutkan hal yang bisa kamu bantu. Kalau relevan, ingatkan untuk menulis "@tanyakiwari" lagi di pertanyaan berikutnya.

Cara menjawab:
- Bahasa Indonesia yang sopan dan ramah, sapa dengan "Bapak/Ibu". Ikuti bahasa warga kalau mereka memakai bahasa lain.
- Ini WhatsApp: jawab singkat dan langsung (umumnya 1–5 kalimat). Format WhatsApp saja: *tebal*, _miring_, daftar dengan "-". Jangan pakai Markdown lain seperti # judul atau tabel.
- Pakai tool untuk data apa pun tentang tagihan, pembayaran, kas, atau jadwal security. Jangan pernah menebak angka, tanggal, atau status.
- Kamu hanya bisa melihat data rumah warga yang sedang chat. Jangan memberikan informasi tagihan atau data pribadi rumah lain, walaupun diminta.
- Kamu tidak bisa mencatat pembayaran, mengubah data, atau mengirim pesan ke orang lain. Untuk hal yang tidak bisa kamu bantu (keluhan, perbaikan, izin, masalah pembayaran yang tidak cocok, dll), sampaikan bahwa pesannya akan dilihat pengurus, atau sarankan menghubungi pengurus.
- Kalau tidak tahu jawabannya, katakan terus terang. Jangan mengarang informasi perumahan.

Informasi umum:
- Iuran IPL dibayar per bulan. Pencatatan IPL di aplikasi dimulai Agustus 2026.
- Cara bayar IPL: transfer, lalu kirim bukti transfer lewat form "Bayar IPL" di ${APP_URL}/ — pengurus akan memverifikasi. Panduan langkah demi langkah: ${APP_URL}/tutorial-bayar-ipl
- Status "menunggu verifikasi" berarti bukti transfer sudah dikirim dan sedang dicek pengurus.
- Warga bisa login di ${APP_URL}/ untuk melihat dashboard, laporan kas, dan jadwal security.
- Pengelolaan sampah: sampah rumah tangga mohon dibungkus rapat dengan trash bag/kresek besar sebelum ditaruh di tempat sampah depan rumah, dan sangat disarankan dipisah antara sampah basah dan kering. Petugas kebersihan mengangkut setiap hari ke lokasi transit di luar area Kiwari, lalu truk membawa ke TPA sesuai jadwal antrean. Info lengkap: ${APP_URL}/pengelolaan-sampah
- Shift security: Pagi 07.00–19.00, Malam 19.00–07.00.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "cek_status_ipl",
    description:
      "Status IPL bulanan rumah warga yang sedang chat: per bulan lunas / menunggu verifikasi / gratis / belum bayar, dari Agustus 2026 sampai bulan ini, plus nominal iuran per bulan. Pakai untuk pertanyaan tagihan, tunggakan, atau 'sudah bayar belum'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "kas_saat_ini",
    description:
      "Saldo kas perumahan saat ini (Kas BRI, Petty Cash, total). Pakai kalau warga bertanya soal saldo/kas.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "jadwal_security",
    description:
      "Jadwal shift security (siapa jaga Pagi/Malam) untuk beberapa hari mulai tanggal tertentu, plus kontak security yang aktif.",
    input_schema: {
      type: "object",
      properties: {
        mulai_tanggal: {
          type: "string",
          description: "Tanggal mulai, format YYYY-MM-DD (WIB). Default hari ini.",
        },
        jumlah_hari: {
          type: "integer",
          description: "Berapa hari ditampilkan, 1–7. Default 1.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

type ThreadRow = {
  direction: "in" | "out";
  message: string | null;
};

// Today's date (and current month/year) in WIB — Vercel runs in UTC.
function wibToday(): { date: string; year: number; month: number } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  const [y, m] = date.split("-").map(Number);
  return { date, year: y, month: m };
}

async function generateReply(
  household: Household,
  phone: string,
  thread: ThreadRow[]
): Promise<string> {
  const client = new Anthropic();

  // Replay the recent thread as alternating turns. Consecutive same-role
  // rows are fine (the API merges them), but it must start on a user turn.
  const history: Anthropic.Beta.BetaMessageParam[] = thread
    .filter((r) => r.message?.trim())
    .slice(-HISTORY_LIMIT)
    .map((r) =>
      r.direction === "in"
        ? { role: "user" as const, content: stripTrigger(r.message!) || "Halo" }
        : { role: "assistant" as const, content: r.message! }
    );
  while (history.length && history[0].role !== "user") history.shift();
  if (!history.length || history[history.length - 1].role !== "user") return "";

  const isPasangan =
    normalizePhone(household.phone_pasangan) === normalizePhone(phone) &&
    normalizePhone(household.phone) !== normalizePhone(phone);
  const today = wibToday();
  const context = `Warga yang sedang chat: unit ${household.unit_no}, kepala keluarga ${household.name}${
    isPasangan ? " (yang chat adalah pasangan/anggota keluarga, bukan kepala keluarga)" : ""
  }. Hari ini ${today.date} (WIB).`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(0, -1),
    // Per-request facts ride on the latest user turn, after the cached
    // system prompt + tools prefix, so they don't break caching.
    {
      role: "user",
      content: [
        { type: "text", text: `<konteks>${context}</konteks>` },
        { type: "text", text: String(history[history.length - 1].content) },
      ],
    },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") return "";

    if (response.stop_reason !== "tool_use") {
      return response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: await runTool(block.name, block.input, household),
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: err instanceof Error ? err.message : String(err),
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("Terlalu banyak putaran tool tanpa jawaban akhir");
}

async function runTool(
  name: string,
  input: unknown,
  household: Household
): Promise<string> {
  switch (name) {
    case "cek_status_ipl":
      return statusIpl(household);
    case "kas_saat_ini": {
      const kas = await getKasSaatIni();
      return JSON.stringify({
        kas_bri: formatRupiah(kas.bri),
        petty_cash: formatRupiah(kas.pettyCash),
        total: formatRupiah(kas.total),
      });
    }
    case "jadwal_security":
      return jadwalSecurity(input as { mulai_tanggal?: string; jumlah_hari?: number });
    default:
      throw new Error(`Tool tidak dikenal: ${name}`);
  }
}

async function statusIpl(household: Household): Promise<string> {
  const admin = createAdminClient();
  const today = wibToday();

  const [{ data: payments }, { data: exemptions }, { data: settings }] =
    await Promise.all([
      admin
        .from("payments")
        .select("period_year, period_month, status, amount, paid_date")
        .eq("household_id", household.id),
      admin
        .from("ipl_exemptions")
        .select("period_year, period_month")
        .eq("household_id", household.id),
      admin
        .from("settings")
        .select("monthly_amount")
        .eq("id", 1)
        .single<{ monthly_amount: number }>(),
    ]);

  const key = (y: number, m: number) => `${y}-${m}`;
  const paid = new Map(
    (payments ?? []).map((p) => [key(p.period_year, p.period_month), p])
  );
  const free = new Set(
    (exemptions ?? []).map((e) => key(e.period_year, e.period_month))
  );

  const months: { bulan: string; status: string; detail?: string }[] = [];
  for (let y = 2026; y <= today.year; y++) {
    const last = y === today.year ? today.month : 12;
    for (let m = iplFirstMonth(y); m <= last; m++) {
      const p = paid.get(key(y, m));
      const bulan = `${MONTH_NAMES[m - 1]} ${y}`;
      if (free.has(key(y, m))) months.push({ bulan, status: "gratis (tidak ditagih)" });
      else if (p?.status === "confirmed")
        months.push({ bulan, status: "lunas", detail: `${formatRupiah(Number(p.amount))}, dibayar ${p.paid_date}` });
      else if (p?.status === "pending")
        months.push({ bulan, status: "menunggu verifikasi pengurus" });
      else months.push({ bulan, status: "belum bayar" });
    }
  }

  // Months already paid ahead of the current one.
  const prepaid = (payments ?? [])
    .filter(
      (p) =>
        p.period_year > today.year ||
        (p.period_year === today.year && p.period_month > today.month)
    )
    .map((p) => `${MONTH_NAMES[p.period_month - 1]} ${p.period_year} (${p.status === "confirmed" ? "lunas" : "menunggu verifikasi"})`);

  return JSON.stringify({
    unit: household.unit_no,
    iuran_per_bulan: formatRupiah(Number(settings?.monthly_amount ?? 0)),
    per_bulan: months,
    sudah_dibayar_di_muka: prepaid,
    jumlah_bulan_belum_bayar: months.filter((x) => x.status === "belum bayar").length,
  });
}

async function jadwalSecurity(input: {
  mulai_tanggal?: string;
  jumlah_hari?: number;
}): Promise<string> {
  const admin = createAdminClient();
  const start =
    input.mulai_tanggal && /^\d{4}-\d{2}-\d{2}$/.test(input.mulai_tanggal)
      ? input.mulai_tanggal
      : wibToday().date;
  const days = Math.min(7, Math.max(1, Math.floor(input.jumlah_hari ?? 1)));

  const dates: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const [{ data: shifts }, { data: guards }] = await Promise.all([
    admin
      .from("security_shifts")
      .select("guard_id, shift_date, shift_type")
      .in("shift_date", dates)
      .in("shift_type", ["pagi", "malam"]),
    admin
      .from("security_guards")
      .select("id, name, phone, is_active")
      .returns<{ id: string; name: string; phone: string | null; is_active: boolean }[]>(),
  ]);

  const guardName = new Map((guards ?? []).map((g) => [g.id, g.name]));
  const jadwal = dates.map((date) => {
    const onDate = (shifts ?? []).filter((s) => s.shift_date === date);
    const names = (type: "pagi" | "malam") =>
      onDate
        .filter((s) => s.shift_type === type)
        .map((s) => guardName.get(s.guard_id) ?? "?");
    return {
      tanggal: date,
      [SHIFT_LABELS.pagi]: names("pagi"),
      [SHIFT_LABELS.malam]: names("malam"),
    };
  });

  return JSON.stringify({
    jadwal,
    kontak_security: (guards ?? [])
      .filter((g) => g.is_active && g.phone)
      .map((g) => ({ nama: g.name, no_hp: g.phone })),
    catatan: jadwal.every((j) => !j.Pagi.length && !j.Malam.length)
      ? "Belum ada jadwal tercatat untuk tanggal ini."
      : undefined,
  });
}
