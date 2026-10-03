import Link from "next/link";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import { logPageView } from "@/lib/pageView";

// Public, unauthenticated page (see src/lib/supabase/middleware.ts's
// isPublicPage allowlist) — the pengurus' announcement on how residents
// should bag and sort their household waste, linked from the CTA card on
// /login and meant to be shared in the warga WhatsApp group.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "800"],
  variable: "--font-fraunces",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

const serif = "font-[family-name:var(--font-fraunces)] tracking-[-0.01em]";

// Residents are all in WIB — computed server-side so the greeting needs no
// client JS (this page is rendered per request anyway, see getCurrentUser).
function greeting() {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Jakarta",
    }).format(new Date()),
  );
  if (h >= 11 && h < 15) return "Selamat Siang";
  if (h >= 15 && h < 18) return "Selamat Sore";
  if (h >= 18 || h < 4) return "Selamat Malam";
  return "Selamat Pagi";
}

const flow = [
  {
    title: "Rumah Warga",
    body: "Sampah dibungkus rapat & dipilah",
    icon: (
      <>
        <path d="M6 19 L20 7 L34 19 V34 H6 Z" fill="#2f6b3f" />
        <rect x="16" y="23" width="8" height="11" fill="#fbf8f1" />
      </>
    ),
  },
  {
    title: "Petugas Kebersihan",
    body: "Mengangkut setiap hari",
    icon: (
      <>
        <circle cx="20" cy="12" r="7" fill="#2f6b3f" />
        <path d="M7 36 Q7 22 20 22 Q33 22 33 36 Z" fill="#2f6b3f" />
      </>
    ),
  },
  {
    title: "Lokasi Transit",
    body: "Disimpan sementara di luar area Kiwari",
    highlight: true,
    icon: (
      <>
        <path
          d="M20 4 C12 4 7 10 7 17 C7 27 20 37 20 37 C20 37 33 27 33 17 C33 10 28 4 20 4 Z"
          fill="#1f4a2b"
        />
        <circle cx="20" cy="17" r="5" fill="#f2b544" />
      </>
    ),
  },
  {
    title: "Truk Pengangkut",
    body: "Sesuai jadwal antrean",
    icon: (
      <>
        <rect x="3" y="11" width="22" height="17" rx="2" fill="#2f6b3f" />
        <path d="M25 16 H32 L37 22 V28 H25 Z" fill="#2f6b3f" />
        <circle cx="11" cy="31" r="4" fill="#1f4a2b" />
        <circle cx="30" cy="31" r="4" fill="#1f4a2b" />
      </>
    ),
  },
  {
    title: "TPS",
    body: "Tujuan akhir pembuangan",
    icon: (
      <>
        <path d="M5 34 L14 18 L21 26 L27 14 L36 34 Z" fill="#2f6b3f" />
        <circle cx="29" cy="8" r="4" fill="#f2b544" />
      </>
    ),
  },
];

const benefits = [
  {
    title: "Lokasi transit tetap bersih",
    body: "Sampah tidak berceceran saat ditumpuk sementara.",
    icon: <path d="M4 20 C4 10 10 4 20 4 C20 14 14 20 4 20 Z" fill="#2f6b3f" />,
  },
  {
    title: "Meminimalisir bau",
    body: "Kantong yang rapat menahan bau tidak sedap.",
    icon: (
      <>
        <path
          d="M4 8 Q8 4 12 8 T20 8 M4 14 Q8 10 12 14 T20 14"
          stroke="#2f6b3f"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M3 21 L21 3"
          stroke="#8a5a3b"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    title: "Memudahkan petugas",
    body: "Tumpukan lebih mudah dipindahkan ke truk menuju TPS.",
    icon: (
      <path
        d="M7 11 V6 a2 2 0 0 1 4 0 V11 M11 10 V5 a2 2 0 0 1 4 0 V11 M15 10 V7 a2 2 0 0 1 4 0 V14 c0 4 -3 7 -7 7 c-3 0 -5 -1 -7 -4 L3 13 a2 2 0 0 1 3 -2 L7 12"
        stroke="#2f6b3f"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

const card =
  "bg-white rounded-3xl px-5 py-[26px] sm:px-7 sm:pt-8 sm:pb-[30px] shadow-[0_18px_40px_-20px_rgba(31,74,43,0.35)] border border-[#e6e1d4] flex flex-col gap-3.5";
const cardNum = `${serif} font-extrabold text-[56px] leading-none text-[#e3efe2] [-webkit-text-stroke:1.5px_#2f6b3f]`;
const cardTitle = `${serif} font-semibold text-[26px] leading-[1.15] text-[#1f4a2b]`;

export default async function PengelolaanSampahPage() {
  // Public/unauthenticated page — only logged-in visitors get attributed;
  // anonymous residents are a no-op in logPageView.
  const user = await getCurrentUser();
  await logPageView(user, "pengelolaan-sampah");

  return (
    <div
      className={`${fraunces.variable} ${jakarta.variable} font-[family-name:var(--font-jakarta)] bg-[#fbf8f1] text-[#1d2a22] leading-[1.65] min-h-screen`}
    >
      {/* Hero */}
      <header className="relative overflow-hidden bg-[#1f4a2b] text-white pt-[52px] pb-[104px] sm:pt-[72px] sm:pb-[120px]">
        <div
          aria-hidden
          className="absolute w-[520px] h-[520px] -right-[160px] -top-[200px] rounded-full bg-[#2f6b3f] opacity-55"
        />
        <div
          aria-hidden
          className="absolute w-[300px] h-[300px] -left-[120px] -bottom-[140px] rounded-full bg-[#3c7f4d] opacity-40"
        />
        <div className="relative z-[1] max-w-[1040px] mx-auto px-5">
          <span className="inline-flex items-center gap-2 bg-[#f2b544] text-[#1f4a2b] font-bold text-[13px] tracking-[0.08em] uppercase px-3.5 py-2 rounded-full">
            📢 Pemberitahuan Warga
          </span>
          <h1
            className={`${serif} font-extrabold text-[clamp(36px,6vw,64px)] leading-[1.15] mt-[22px] mb-[18px] max-w-[14ch]`}
          >
            Perihal Pengelolaan <span className="text-[#f2b544]">Sampah</span>{" "}
            Warga
          </h1>
          <p className="text-[clamp(16px,2vw,19px)] max-w-[56ch] text-[#dbe8dc]">
            Mari bersama menjaga lingkungan Kiwari Residence tetap bersih, rapi,
            dan nyaman — dimulai dari cara kita membuang sampah di rumah.
          </p>
          <div className="mt-7 inline-block border-l-[3px] border-[#f2b544] py-1 pl-3.5 font-medium">
            Assalamu’alaikum Warahmatullahi Wabarakatuh &amp; {greeting()},
            <small className="block text-[#b9cfbc] font-normal text-sm">
              Bapak/Ibu Warga Kiwari Residence yang kami hormati. Semoga
              Bapak/Ibu dan keluarga senantiasa dalam keadaan sehat.
            </small>
          </div>
        </div>
      </header>

      {/* Two asks */}
      <section className="-mt-[72px] relative z-[2]">
        <div className="max-w-[1040px] mx-auto px-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          <article className={card}>
            <div className="flex items-center justify-between">
              <span className={cardNum}>01</span>
              <span className="text-xs font-bold tracking-[0.06em] uppercase px-3 py-1.5 rounded-full bg-[#2f6b3f] text-white">
                Mohon Dilakukan
              </span>
            </div>
            <div
              aria-hidden
              className="h-[150px] rounded-2xl bg-[#e3efe2] flex items-center justify-center gap-[18px]"
            >
              {/* Tied trash bag */}
              <svg width="110" height="120" viewBox="0 0 110 120">
                <path
                  d="M45 22 L38 6 M65 22 L72 6"
                  stroke="#1f4a2b"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M42 24 Q55 32 68 24 L72 30 Q55 40 38 30 Z"
                  fill="#1f4a2b"
                />
                <path
                  d="M38 30 Q10 60 18 96 Q24 116 55 116 Q86 116 92 96 Q100 60 72 30 Q55 40 38 30 Z"
                  fill="#2f6b3f"
                />
                <path
                  d="M32 60 Q40 50 46 62"
                  stroke="#5e9b6c"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M70 80 Q78 72 82 84"
                  stroke="#5e9b6c"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              <svg width="54" height="54" viewBox="0 0 54 54">
                <circle cx="27" cy="27" r="25" fill="#f2b544" />
                <path
                  d="M15 28 L24 37 L40 19"
                  stroke="#1f4a2b"
                  strokeWidth="5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className={cardTitle}>Membungkus Sampah dengan Rapi</h3>
            <p className="text-[#5b6b60]">
              Pastikan seluruh sampah rumah tangga sudah{" "}
              <strong>dibungkus rapat</strong> menggunakan plastik sampah (
              <em>trash bag</em>) atau kresek besar sebelum diletakkan di tempat
              sampah luar/depan rumah.
            </p>
          </article>

          <article className={card}>
            <div className="flex items-center justify-between">
              <span className={cardNum}>02</span>
              <span className="text-xs font-bold tracking-[0.06em] uppercase px-3 py-1.5 rounded-full bg-[#fdf1d8] text-[#8a5d00] border border-[#f0d394]">
                Sangat Disarankan
              </span>
            </div>
            <div
              aria-hidden
              className="h-[150px] rounded-2xl bg-[#fdf1d8] flex items-center justify-center gap-[18px]"
            >
              <div>
                <svg width="74" height="96" viewBox="0 0 74 96">
                  <rect
                    x="8"
                    y="22"
                    width="58"
                    height="70"
                    rx="8"
                    fill="#3d6f9e"
                  />
                  <rect
                    x="2"
                    y="12"
                    width="70"
                    height="12"
                    rx="5"
                    fill="#244a72"
                  />
                  <rect
                    x="28"
                    y="4"
                    width="18"
                    height="10"
                    rx="3"
                    fill="#244a72"
                  />
                  <path
                    d="M24 46 h26 M24 58 h26 M24 70 h18"
                    stroke="#cfe0f0"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-xs font-bold text-center mt-1.5 text-[#244a72]">
                  KERING
                </div>
              </div>
              <div>
                <svg width="74" height="96" viewBox="0 0 74 96">
                  <rect
                    x="8"
                    y="22"
                    width="58"
                    height="70"
                    rx="8"
                    fill="#a26c47"
                  />
                  <rect
                    x="2"
                    y="12"
                    width="70"
                    height="12"
                    rx="5"
                    fill="#8a5a3b"
                  />
                  <rect
                    x="28"
                    y="4"
                    width="18"
                    height="10"
                    rx="3"
                    fill="#8a5a3b"
                  />
                  <path
                    d="M37 44 C24 50 24 70 37 76 C50 70 50 50 37 44 Z"
                    fill="#f4e7dc"
                  />
                  <path
                    d="M37 50 V72"
                    stroke="#a26c47"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-xs font-bold text-center mt-1.5 text-[#8a5a3b]">
                  BASAH
                </div>
              </div>
            </div>
            <h3 className={cardTitle}>Memisahkan Sampah Basah &amp; Kering</h3>
            <p className="text-[#5b6b60]">
              Akan sangat kami hargai apabila Bapak/Ibu dapat memisahkan sampah
              ke dalam <strong>kantong plastik yang berbeda</strong>:
            </p>
            <div className="flex flex-wrap gap-2 mt-0.5">
              {["🧴 Plastik", "📄 Kertas", "📦 Kardus"].map((c) => (
                <span
                  key={c}
                  className="text-[13px] font-semibold px-[11px] py-[5px] rounded-full bg-[#e6eef7] text-[#244a72]"
                >
                  {c}
                </span>
              ))}
              <span className="text-[13px] font-semibold px-[11px] py-[5px] rounded-full bg-[#f4e7dc] text-[#8a5a3b]">
                🍚 Sisa Makanan
              </span>
            </div>
          </article>
        </div>
      </section>

      {/* Why */}
      <section className="pt-[88px] pb-10">
        <div className="max-w-[1040px] mx-auto px-5">
          <span className="text-[13px] font-bold tracking-[0.1em] uppercase text-[#8a5a3b]">
            Mengapa hal ini sangat penting?
          </span>
          <h2
            className={`${serif} font-semibold text-[clamp(30px,4.5vw,44px)] leading-[1.15] mt-2.5 mb-3.5 max-w-[20ch] text-[#1f4a2b]`}
          >
            Sampah kita singgah dulu sebelum sampai ke TPS
          </h2>
          <p className="text-[#5b6b60] max-w-[62ch] text-[17px]">
            Saat ini, sampah yang diangkut setiap hari oleh petugas kebersihan{" "}
            <strong>tidak bisa langsung dibawa ke TPS</strong>. Sampah harus
            ditransitkan dan disimpan sementara di suatu lokasi di luar area
            Kiwari, sambil menunggu jadwal antrean truk pengangkut.
          </p>

          {/* Flow: vertical on mobile, a 5-step row on desktop */}
          <div className="relative mt-11 grid grid-cols-1 gap-[18px] md:grid-cols-5 md:gap-0">
            <div
              aria-hidden
              className="absolute left-[41px] top-5 bottom-5 border-l-[3px] border-dashed border-[#c9d8c8] md:left-[10%] md:right-[10%] md:top-[42px] md:bottom-auto md:border-l-0 md:border-t-[3px]"
            />
            {flow.map((s) => (
              <div
                key={s.title}
                className="relative flex items-center gap-4 text-left md:block md:text-center md:px-1.5"
              >
                <div
                  className={`relative z-[1] w-[84px] h-[84px] shrink-0 rounded-full border-[3px] flex items-center justify-center md:mx-auto md:mb-3.5 ${
                    s.highlight
                      ? "bg-[#f2b544] border-[#f2b544]"
                      : "bg-white border-[#2f6b3f]"
                  }`}
                >
                  <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
                    {s.icon}
                  </svg>
                </div>
                <div>
                  <h4
                    className={`text-[15px] font-bold ${
                      s.highlight ? "text-[#8a5a3b]" : ""
                    }`}
                  >
                    {s.title}
                  </h4>
                  <p className="text-[13px] text-[#5b6b60] mt-1 leading-[1.45]">
                    {s.body}
                  </p>
                  {s.highlight && (
                    <span className="inline-block mt-2 text-[11px] font-bold bg-[#8a5a3b] text-white rounded-md px-2 py-[3px] tracking-[0.04em]">
                      MENUNGGU ANTREAN
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="bg-white border border-[#e6e1d4] rounded-[20px] p-6 flex gap-3.5 items-start"
              >
                <div className="w-[46px] h-[46px] shrink-0 rounded-[14px] bg-[#e3efe2] flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                    {b.icon}
                  </svg>
                </div>
                <div>
                  <h4 className={`${serif} font-semibold text-base mb-1`}>
                    {b.title}
                  </h4>
                  <p className="text-sm text-[#5b6b60] leading-normal">
                    {b.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="pt-10 pb-12">
        <div className="max-w-[1040px] mx-auto px-5">
          <div className="relative overflow-hidden bg-[#2f6b3f] text-white rounded-[28px] px-[22px] py-10 md:px-10 md:py-12 text-center">
            <div
              aria-hidden
              className="absolute w-[240px] h-[240px] rounded-full bg-[#f2b544] opacity-[0.18] -right-[60px] -bottom-[90px]"
            />
            <h2
              className={`${serif} relative font-semibold text-[clamp(26px,4vw,38px)] leading-[1.15] max-w-[22ch] mx-auto mb-3.5`}
            >
              Bersih, tertib, dan nyaman — kita jaga bersama 🙏
            </h2>
            <p className="relative text-[#d6e6d7] max-w-[52ch] mx-auto">
              Terima kasih banyak atas perhatian dan kerja sama Bapak/Ibu
              sekalian dalam menjaga lingkungan yang kita tinggali.
            </p>
            <div className="relative mt-7 inline-flex items-center gap-2.5 font-bold text-[15px] bg-white/12 px-[18px] py-2.5 rounded-full">
              Salam hangat, Pengurus Forum Warga Kiwari Residence
            </div>
          </div>
        </div>
      </section>

      <footer className="text-center pb-12 text-[#5b6b60] text-[0.82rem]">
        <Link href="/login" className="text-[#2f6b3f] hover:underline">
          &larr; Kembali ke halaman utama
        </Link>
      </footer>
    </div>
  );
}
