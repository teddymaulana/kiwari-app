import Image from "next/image";
import Link from "next/link";
import { Fredoka, Plus_Jakarta_Sans } from "next/font/google";

// Public, unauthenticated page (see src/lib/supabase/middleware.ts's
// isPublicPage allowlist) — a friendly visual walkthrough of the public
// "Bayar IPL" form on /login, meant to be shared directly with residents
// (e.g. in the warga WhatsApp group) without asking them to log in first.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

const steps = [
  {
    n: 1,
    title: 'Buka menu "Bayar IPL"',
    body: (
      <>
        Masuk ke halaman login Kiwari, lalu ketuk kotak{" "}
        <strong className="font-semibold text-[#12303a]">Bayar IPL</strong>{" "}
        paling atas — nggak usah isi Email atau Password apa pun.
      </>
    ),
    image: "/tutorial-bayar-ipl/step-1.png",
    alt: "Tampilan awal halaman login Kiwari, dengan pilihan Bayar IPL dan Login Warga",
  },
  {
    n: 2,
    title: "Cari rumahmu",
    body: (
      <>
        Kotaknya akan terbuka jadi formulir singkat. Ketik nomor rumah atau
        nama kepala keluarga di kolom{" "}
        <strong className="font-semibold text-[#12303a]">Rumah</strong>, lalu
        pilih dari daftar yang muncul.
      </>
    ),
    image: "/tutorial-bayar-ipl/step-2.png",
    alt: "Mengetik nomor rumah pada kolom pencarian, dengan hasil pencarian muncul di bawahnya",
    tip: "Unggah foto bukti transfer di kolom paling atas — sistem bisa otomatis mendeteksi rumah dan bulannya dari foto struknya!",
  },
  {
    n: 3,
    title: "Centang bulan yang dibayar",
    body: "Pilih bulan sesuai transfer yang sudah kamu lakukan. Jumlahnya otomatis terhitung. Tambahkan catatan singkat kalau perlu, misalnya nama pengirim transfer.",
    image: "/tutorial-bayar-ipl/step-3.png",
    alt: "Formulir terisi lengkap dengan bulan dicentang, jumlah, dan catatan transfer",
  },
  {
    n: 4,
    title: 'Ketuk "Kirim Klaim" — selesai!',
    body: (
      <>
        Muncul tanda centang hijau, artinya klaimmu sudah masuk. Pengurus akan
        memverifikasi sebelum statusnya berubah jadi{" "}
        <strong className="font-semibold text-[#12303a]">Lunas</strong>.
      </>
    ),
    image: "/tutorial-bayar-ipl/step-4.png",
    alt: "Layar konfirmasi Klaim Berhasil Terkirim dengan tanda centang hijau",
  },
];

export default function TutorialBayarIplPage() {
  return (
    <div
      className={`${fredoka.variable} ${jakarta.variable} font-[family-name:var(--font-jakarta)] bg-[#f3f6f5] text-[#12303a] min-h-screen`}
    >
      {/* Hero */}
      <section className="relative overflow-hidden pt-14 pb-10 px-5 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[340px] opacity-100"
        >
          <svg
            viewBox="0 0 620 200"
            preserveAspectRatio="none"
            className="absolute bottom-[-2px] left-0 w-full h-auto"
          >
            <path
              d="M0 140 L90 70 L180 140 L260 90 L340 140 L430 60 L520 140 L620 100 L620 200 L0 200 Z"
              fill="#1c7c95"
              opacity="0.08"
            />
            <path
              d="M0 165 L70 120 L150 165 L230 130 L310 165 L400 110 L480 165 L560 135 L620 165 L620 200 L0 200 Z"
              fill="#1c7c95"
              opacity="0.14"
            />
          </svg>
        </div>

        <div className="relative max-w-[620px] mx-auto">
          <Image
            src="/kiwari-logo.png"
            alt="Forum Warga Kiwari Residence"
            width={200}
            height={140}
            className="mx-auto mb-5 h-24 w-auto drop-shadow-[0_6px_16px_rgba(14,68,83,0.18)]"
            priority
          />
          <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-bold tracking-[0.08em] uppercase text-[#0e4453] bg-white border border-[#dce4e2] px-3.5 py-1.5 rounded-full shadow-sm">
            Forum Warga &middot; Kiwari Residence
          </span>
          <h1
            className={`font-[family-name:var(--font-fredoka)] font-semibold text-[clamp(2rem,7vw,2.7rem)] leading-[1.08] mt-4.5 mb-3.5 text-balance`}
          >
            Bayar IPL,{" "}
            <span className="text-[#c97a22]">gampang banget</span> kok!
          </h1>
          <p className="text-[#3f5960] text-[1.05rem] leading-[1.55] max-w-[42ch] mx-auto">
            Sudah transfer iuran bulanan? Tinggal klaim di sini — 4 langkah
            singkat, tanpa perlu bikin akun atau login dulu.
          </p>

          <div className="flex gap-2.5 justify-center flex-wrap mt-6">
            {[
              ["Sekitar 1 menit", "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"],
              [
                "Tanpa login",
                "M8 11V7a4 4 0 118 0v4M5 11h14v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9z",
              ],
              ["Diverifikasi pengurus", "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"],
            ].map(([label, d]) => (
              <span
                key={label}
                className="flex items-center gap-1.5 bg-white border border-[#dce4e2] rounded-xl px-3.5 py-2 text-[0.85rem] font-semibold text-[#3f5960] shadow-sm"
              >
                <svg
                  className="w-4 h-4 text-[#1c7c95] shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={d} />
                </svg>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <div className="max-w-[620px] mx-auto px-5 relative">
        <div
          aria-hidden
          className="absolute left-[39px] top-14 bottom-14 w-px"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, #dce4e2 0 6px, transparent 6px 12px)",
          }}
        />
        {steps.map((s) => (
          <div key={s.n} className="relative grid grid-cols-[56px_1fr] gap-4.5 py-8">
            <div
              className={`font-[family-name:var(--font-fredoka)] w-14 h-14 rounded-2xl bg-[#0e4453] text-[#f3f6f5] flex items-center justify-center font-semibold text-2xl shadow-sm`}
            >
              {s.n}
            </div>
            <div className="min-w-0">
              <h2
                className={`font-[family-name:var(--font-fredoka)] font-semibold text-[1.3rem] mb-2`}
              >
                {s.title}
              </h2>
              <p className="text-[#3f5960] leading-[1.6] text-[0.97rem] mb-4.5">
                {s.body}
              </p>
              <div className="inline-block max-w-[260px] w-full bg-white border border-[#dce4e2] rounded-[20px] p-2 shadow-sm">
                <Image
                  src={s.image}
                  alt={s.alt}
                  width={780}
                  height={1000}
                  className="block w-full h-auto rounded-[13px]"
                />
              </div>
              {s.tip && (
                <div className="mt-3.5 flex gap-2.5 items-start bg-[#fdf1e2] border border-[#f0d5ac] rounded-xl px-3.5 py-3 max-w-[340px]">
                  <svg
                    className="w-[18px] h-[18px] text-[#c97a22] shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a4 4 0 115.657 0M9 21h6"
                    />
                  </svg>
                  <span className="text-[0.87rem] text-[#3f5960] leading-[1.5]">
                    <strong className="text-[#12303a]">Tips:</strong> {s.tip}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Closing */}
      <div className="max-w-[620px] mx-auto px-5">
        <div className="relative overflow-hidden my-5 mb-16 bg-[#0e4453] rounded-3xl px-7 py-9 text-center shadow-sm">
          <div
            aria-hidden
            className="absolute w-[220px] h-[220px] bg-[#ea9a3c] opacity-[0.18] rounded-full -top-[90px] -right-[70px]"
          />
          <div className="relative w-13 h-13 rounded-full bg-[#e3f6ea] flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6.5 h-6.5 text-[#2f9e63]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2
            className={`font-[family-name:var(--font-fredoka)] font-semibold text-white text-[1.4rem] mb-2.5 relative`}
          >
            Gitu aja, kok!
          </h2>
          <p className="relative text-[#d7e9ec] text-[0.95rem] leading-[1.6] max-w-[40ch] mx-auto">
            Statusmu bisa dicek kapan saja di halaman{" "}
            <strong className="text-white">Laporan</strong> setelah login.
            Kalau sudah punya akun, kamu juga bisa bayar lewat menu{" "}
            <strong className="text-white">Dashboard → Bayar IPL</strong>.
          </p>
          <p className="relative text-[#d7e9ec] text-[0.95rem] leading-[1.6] max-w-[40ch] mx-auto mt-2.5">
            Ada kendala? Hubungi pengurus lewat grup WhatsApp warga ya. Kami
            bantu sampai beres!
          </p>
        </div>
      </div>

      <footer className="text-center pb-10 text-[#3f5960] text-[0.82rem]">
        Dibuat untuk warga Kiwari Residence &middot; Forum Warga Kiwari
        <br />
        <Link href="/login" className="text-[#1c7c95] hover:underline">
          Buka halaman Bayar IPL &rarr;
        </Link>
      </footer>
    </div>
  );
}
