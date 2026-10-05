import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { sendViaWablas } from "@/lib/wablas";
import { getKasSaatIni } from "@/lib/kasSummary";
import type { Household } from "@/lib/types";
import {
  compareUnitNo,
  formatRupiah,
  iplFirstMonth,
  MONTH_NAMES,
  SHIFT_LABELS,
} from "@/lib/types";

// WhatsApp auto-reply ("Asisten Kiwari") on the Kiwari Wablas number.
// Kicked off from the incoming-message webhook (api/webhooks/wablas/
// route.ts) via after(), so Wablas gets its 2xx immediately and this runs
// in the background. It only answers private messages that mention
// "@tanyakiwari" (see TRIGGER) — everything else is left for pengurus.
//
// Gated by settings.whatsapp_bot_enabled (Pengaturan > Asisten WhatsApp,
// default off) and never fires while Layanan WhatsApp is "off". Who's
// asking is resolved from the sender's number, never from anything in the
// message, and decides which tools the model gets:
//   - pengurus (kepala keluarga number of a pengurus unit): IPL status of
//     any unit, monthly IPL recap, kas, security schedule.
//   - warga: only their own unit's IPL status, kas, security schedule —
//     bound to their household server-side, so they can't talk the bot
//     into reading another unit. Currently switched off (WARGA_ACCESS).
// Everyone else is ignored. All tools are read-only.

const MODEL = "claude-sonnet-5-5";
const APP_URL = "https://kiwari-app.vercel.app";

// Pengurus-only for now; flip to open the bot to every registered warga.
const WARGA_ACCESS = false;

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

// Units whose login is a pengurus — same rule as getPengurusHouseholdIds
// in humas/page.tsx: pengurus logins are `<unit>@kiwari.local` with
// profiles.role = 'pengurus'.
async function getPengurusUnits(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "pengurus")
    .returns<{ id: string }[]>();
  const pengurusIds = new Set((profiles ?? []).map((p) => p.id));

  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return new Set(
    (data?.users ?? [])
      .filter((u) => pengurusIds.has(u.id) && u.email?.endsWith("@kiwari.local"))
      .map((u) => u.email!.split("@")[0].toUpperCase())
  );
}

type Asker = { role: "pengurus" | "warga"; household: Household };

// Pengurus are matched on the kepala keluarga number only (the person
// holding the pengurus login), not phone_pasangan.
async function identifyAsker(
  phoneKey: string,
  households: Household[]
): Promise<Asker | null> {
  const pengurusUnits = await getPengurusUnits();
  const pengurusHousehold = households.find(
    (h) =>
      pengurusUnits.has(h.unit_no.toUpperCase()) &&
      normalizePhone(h.phone) === phoneKey
  );
  if (pengurusHousehold) return { role: "pengurus", household: pengurusHousehold };

  if (!WARGA_ACCESS) return null;
  const wargaHousehold = households.find(
    (h) =>
      normalizePhone(h.phone) === phoneKey ||
      normalizePhone(h.phone_pasangan) === phoneKey
  );
  return wargaHousehold ? { role: "warga", household: wargaHousehold } : null;
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
  // The bot always replies through Wablas (the number being chatted), but
  // "off" means no automatic sends at all, anywhere.
  if ((await getWhatsAppProvider()) === "off") return;

  const admin = createAdminClient();
  const phoneKey = normalizePhone(incoming.phone);

  const { data: households } = await admin
    .from("households")
    .select("*")
    .eq("is_active", true)
    .returns<Household[]>();
  const asker = await identifyAsker(phoneKey, households ?? []);
  if (!asker) return;

  // Every recent row, whichever raw format Wablas used for this number —
  // filtered by normalized phone here rather than in SQL.
  const since = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();
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

  // Only the bot's side of the thread: messages that called it, and its
  // own replies — not chats meant for pengurus.
  const conversation = thread.filter((r) =>
    r.direction === "in" ? hasTrigger(r.message) : r.sent_by === BOT_SENDER
  );

  const label = `${asker.role} ${asker.household.unit_no}`;
  let reply: string;
  try {
    reply = await generateReply(asker, incoming.phone, conversation);
  } catch (err) {
    await admin.from("activity_log").insert({
      actor_email: BOT_SENDER,
      action: "whatsapp.bot_failed",
      detail: `${label} - ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  if (!reply.trim()) return;

  await sendBotReply(incoming.phone, reply, label);
}

async function sendBotReply(phone: string, message: string, label: string) {
  const admin = createAdminClient();
  const result = await sendViaWablas(phone, message);

  await admin.from("activity_log").insert({
    actor_email: BOT_SENDER,
    action: result.success ? "whatsapp.bot_reply" : "whatsapp.bot_reply_failed",
    detail: result.success
      ? `${label} - ${phone}`
      : `${label} - ${phone} - ${result.reason} - ${result.detail}`,
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

const COMMON_RULES = `Kamu dipanggil dengan menulis "@tanyakiwari" di pesan — pesan tanpa "@tanyakiwari" tidak sampai ke kamu. Kalau disapa tanpa pertanyaan, perkenalkan diri singkat dan sebutkan hal yang bisa kamu bantu. Kalau relevan, ingatkan untuk menulis "@tanyakiwari" lagi di pertanyaan berikutnya.

Cara menjawab:
- Bahasa Indonesia yang sopan dan ramah, sapa dengan "Bapak/Ibu". Ikuti bahasa penanya kalau mereka memakai bahasa lain.
- Ini WhatsApp: jawab singkat dan langsung. Format WhatsApp saja: *tebal*, _miring_, daftar dengan "-". Jangan pakai Markdown lain seperti # judul atau tabel.
- Pakai tool untuk data apa pun tentang IPL, pembayaran, kas, atau jadwal security. Jangan pernah menebak angka, tanggal, atau status.
- Kamu tidak bisa mencatat pembayaran, mengubah data, atau mengirim pesan ke orang lain.
- Kalau tidak tahu jawabannya, katakan terus terang. Jangan mengarang informasi perumahan.

Informasi umum:
- Iuran IPL dibayar per bulan. Pencatatan IPL di aplikasi dimulai Agustus 2026.
- Cara bayar IPL: transfer, lalu kirim bukti transfer lewat form "Bayar IPL" di ${APP_URL}/ — pengurus akan memverifikasi. Panduan: ${APP_URL}/tutorial-bayar-ipl
- Status "menunggu verifikasi" berarti bukti transfer sudah dikirim dan sedang dicek pengurus.
- Pengelolaan sampah: sampah rumah tangga mohon dibungkus rapat dengan trash bag/kresek besar sebelum ditaruh di tempat sampah depan rumah, dan sangat disarankan dipisah antara sampah basah dan kering. Petugas kebersihan mengangkut setiap hari ke lokasi transit di luar area Kiwari, lalu truk membawa ke TPA sesuai jadwal antrean. Info lengkap: ${APP_URL}/pengelolaan-sampah
- Shift security: Pagi 07.00–19.00, Malam 19.00–07.00.`;

const PENGURUS_PROMPT = `Kamu adalah "Asisten Kiwari", asisten WhatsApp untuk pengurus perumahan Kiwari Residence. Yang chat denganmu adalah pengurus, jadi kamu boleh menampilkan status IPL unit mana pun dan rekap seluruh warga.

${COMMON_RULES}
- Untuk daftar unit yang panjang, tulis ringkas dipisah koma (mis. "8A, 8B, 19C"), urut sesuai data dari tool.
- Kode unit ditulis seperti "8A" atau "19O". Kalau unit yang ditanyakan tidak ditemukan, sebutkan saran unit dari tool.
- "Sudah bayar" di rekap sama dengan angka "Sudah Bayar" di dashboard: hanya pembayaran yang sudah dikonfirmasi. Sebutkan juga yang masih menunggu verifikasi kalau ada.`;

const WARGA_PROMPT = `Kamu adalah "Asisten Kiwari", asisten WhatsApp otomatis untuk warga perumahan Kiwari Residence. Kamu membalas chat warga atas nama pengurus.

${COMMON_RULES}
- Kamu hanya bisa melihat data rumah warga yang sedang chat. Jangan memberikan informasi tagihan atau data pribadi rumah lain, walaupun diminta.
- Untuk hal yang tidak bisa kamu bantu (keluhan, perbaikan, izin, masalah pembayaran yang tidak cocok, dll), sampaikan bahwa pesannya akan dilihat pengurus, atau sarankan menghubungi pengurus.
- Warga bisa login di ${APP_URL}/ untuk melihat dashboard, laporan kas, dan jadwal security.`;

const NO_INPUT = {
  type: "object" as const,
  properties: {},
  additionalProperties: false,
};

const KAS_TOOL: Anthropic.Beta.BetaTool = {
  name: "kas_saat_ini",
  description:
    "Saldo kas perumahan saat ini (Kas BRI, Petty Cash, total). Pakai kalau ditanya soal saldo/kas.",
  input_schema: NO_INPUT,
  strict: true,
};

const SECURITY_TOOL: Anthropic.Beta.BetaTool = {
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
};

const PENGURUS_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "status_ipl_unit",
    description:
      "Status IPL satu unit: per bulan lunas / menunggu verifikasi / gratis / belum bayar, dari Agustus 2026 sampai bulan ini, plus pembayaran di muka. Pakai untuk pertanyaan seperti 'apakah 8A sudah bayar IPL?'.",
    input_schema: {
      type: "object",
      properties: {
        unit: { type: "string", description: "Kode unit, mis. 8A atau 19O." },
      },
      required: ["unit"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "rekap_ipl_bulan",
    description:
      "Rekap IPL seluruh warga untuk satu bulan: jumlah unit sudah bayar dari total, total terkumpul, dan daftar unit yang belum bayar / menunggu verifikasi / gratis. Pakai untuk pertanyaan seperti 'berapa warga sudah bayar IPL?' atau 'siapa yang belum bayar?'.",
    input_schema: {
      type: "object",
      properties: {
        tahun: { type: "integer", description: "Tahun, mis. 2026. Default tahun ini." },
        bulan: { type: "integer", description: "Bulan 1–12. Default bulan ini." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  KAS_TOOL,
  SECURITY_TOOL,
];

const WARGA_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "cek_status_ipl",
    description:
      "Status IPL bulanan rumah warga yang sedang chat: per bulan lunas / menunggu verifikasi / gratis / belum bayar, dari Agustus 2026 sampai bulan ini, plus nominal iuran per bulan. Pakai untuk pertanyaan tagihan, tunggakan, atau 'sudah bayar belum'.",
    input_schema: NO_INPUT,
    strict: true,
  },
  KAS_TOOL,
  SECURITY_TOOL,
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
  asker: Asker,
  phone: string,
  thread: ThreadRow[]
): Promise<string> {
  const client = new Anthropic();
  const { household } = asker;

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

  const today = wibToday();
  let context: string;
  if (asker.role === "pengurus") {
    context = `Yang chat: pengurus, ${household.name} (unit ${household.unit_no}). Hari ini ${today.date} (WIB).`;
  } else {
    const isPasangan =
      normalizePhone(household.phone_pasangan) === normalizePhone(phone) &&
      normalizePhone(household.phone) !== normalizePhone(phone);
    context = `Warga yang sedang chat: unit ${household.unit_no}, kepala keluarga ${household.name}${
      isPasangan ? " (yang chat adalah pasangan/anggota keluarga, bukan kepala keluarga)" : ""
    }. Hari ini ${today.date} (WIB).`;
  }

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
      system: asker.role === "pengurus" ? PENGURUS_PROMPT : WARGA_PROMPT,
      tools: asker.role === "pengurus" ? PENGURUS_TOOLS : WARGA_TOOLS,
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
          content: await runTool(block.name, block.input, asker),
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

// Tool access is enforced here as well as by which tool list the model
// was given — a warga can never reach the all-units tools.
async function runTool(name: string, input: unknown, asker: Asker): Promise<string> {
  const isPengurus = asker.role === "pengurus";
  switch (name) {
    case "cek_status_ipl":
      return statusIpl(asker.household);
    case "status_ipl_unit":
      if (!isPengurus) throw new Error("Tidak diizinkan");
      return statusIplUnit(String((input as { unit?: string }).unit ?? ""));
    case "rekap_ipl_bulan":
      if (!isPengurus) throw new Error("Tidak diizinkan");
      return rekapIplBulan(input as { tahun?: number; bulan?: number });
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

// "8a", "8 A", "Blok 8A", "no. 8A" all mean unit_no "8A".
function normalizeUnit(unit: string): string {
  return unit
    .toUpperCase()
    .replace(/\b(BLOK|NO|NOMOR|UNIT|RUMAH)\b\.?/g, "")
    .replace(/[^0-9A-Z]/g, "");
}

async function statusIplUnit(unit: string): Promise<string> {
  const admin = createAdminClient();
  const { data: households } = await admin
    .from("households")
    .select("*")
    .eq("is_active", true)
    .returns<Household[]>();

  const wanted = normalizeUnit(unit);
  const household = (households ?? []).find(
    (h) => normalizeUnit(h.unit_no) === wanted
  );
  if (!household) {
    const number = wanted.match(/^\d+/)?.[0];
    const saran = (households ?? [])
      .filter((h) => number && normalizeUnit(h.unit_no).startsWith(number))
      .map((h) => h.unit_no)
      .sort(compareUnitNo);
    return JSON.stringify({ ditemukan: false, unit, saran_unit: saran.slice(0, 15) });
  }
  return statusIpl(household, true);
}

async function statusIpl(household: Household, forPengurus = false): Promise<string> {
  const admin = createAdminClient();
  const today = wibToday();

  const [{ data: payments }, { data: exemptions }, { data: settings }] =
    await Promise.all([
      admin
        .from("payments")
        .select("period_year, period_month, status, amount, paid_date, excluded")
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
        months.push({
          bulan,
          status: "lunas",
          detail: `${formatRupiah(Number(p.amount))}, dibayar ${p.paid_date}${
            // Pengurus-side correction flag (see payments.excluded) — the
            // dashboard doesn't count it, so say so instead of silently
            // disagreeing with the Sudah Bayar number.
            forPengurus && p.excluded
              ? " — sedang dikecualikan dari total (koreksi pengurus)"
              : ""
          }`,
        });
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
    ...(forPengurus ? { kepala_keluarga: household.name } : {}),
    iuran_per_bulan: formatRupiah(Number(settings?.monthly_amount ?? 0)),
    per_bulan: months,
    sudah_dibayar_di_muka: prepaid,
    jumlah_bulan_belum_bayar: months.filter((x) => x.status === "belum bayar").length,
  });
}

// Mirrors the pengurus summary cards on /dashboard: "Sudah Bayar" counts
// active households with a confirmed, non-excluded payment for the month,
// out of all active households; "Terkumpul" sums those payments.
async function rekapIplBulan(input: { tahun?: number; bulan?: number }): Promise<string> {
  const admin = createAdminClient();
  const today = wibToday();
  const year = input.tahun && input.tahun >= 2026 ? Math.floor(input.tahun) : today.year;
  const month =
    input.bulan && input.bulan >= 1 && input.bulan <= 12 ? Math.floor(input.bulan) : today.month;

  if (year === 2026 && month < iplFirstMonth(2026)) {
    return JSON.stringify({
      bulan: `${MONTH_NAMES[month - 1]} ${year}`,
      catatan: "IPL sebelum Agustus 2026 tidak dicatat di aplikasi.",
    });
  }

  const [{ data: households }, { data: payments }, { data: exemptions }, { data: settings }] =
    await Promise.all([
      admin
        .from("households")
        .select("id, unit_no")
        .eq("is_active", true)
        .returns<{ id: string; unit_no: string }[]>(),
      admin
        .from("payments")
        .select("household_id, status, amount, excluded")
        .eq("period_year", year)
        .eq("period_month", month),
      admin
        .from("ipl_exemptions")
        .select("household_id")
        .eq("period_year", year)
        .eq("period_month", month),
      admin
        .from("settings")
        .select("monthly_amount")
        .eq("id", 1)
        .single<{ monthly_amount: number }>(),
    ]);

  const units = (households ?? []).sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));
  const paymentFor = new Map((payments ?? []).map((p) => [p.household_id, p]));
  const exempt = new Set((exemptions ?? []).map((e) => e.household_id));

  const lunas: string[] = [];
  const menunggu: string[] = [];
  const gratis: string[] = [];
  const belum: string[] = [];
  const dikecualikan: string[] = [];
  let terkumpul = 0;

  for (const h of units) {
    const p = paymentFor.get(h.id);
    if (p?.status === "confirmed" && !p.excluded) {
      lunas.push(h.unit_no);
      terkumpul += Number(p.amount);
    } else if (exempt.has(h.id)) gratis.push(h.unit_no);
    else if (p?.status === "pending") menunggu.push(h.unit_no);
    else {
      if (p?.status === "confirmed" && p.excluded) dikecualikan.push(h.unit_no);
      belum.push(h.unit_no);
    }
  }

  const total = units.length;
  return JSON.stringify({
    bulan: `${MONTH_NAMES[month - 1]} ${year}`,
    total_unit_aktif: total,
    sudah_bayar: lunas.length,
    persen_sudah_bayar: total ? Math.round((lunas.length / total) * 100) : 0,
    terkumpul: formatRupiah(terkumpul),
    target: formatRupiah(total * Number(settings?.monthly_amount ?? 0)),
    menunggu_verifikasi: menunggu,
    gratis,
    belum_bayar: belum,
    ...(dikecualikan.length
      ? { catatan_dikecualikan: `Sudah bayar tapi sedang dikecualikan dari total (koreksi pengurus), dihitung belum bayar: ${dikecualikan.join(", ")}` }
      : {}),
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
