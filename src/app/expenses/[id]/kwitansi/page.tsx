import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Expense } from "@/lib/types";
import { formatRupiah } from "@/lib/types";
import { terbilangRupiah } from "@/lib/terbilang";
import PrintButton from "./PrintButton";
import DownloadPdfButton from "./DownloadPdfButton";
import AccentShapes from "./AccentShapes";

// Blank-signature receipt for a pengeluaran — meant to be printed, handed
// to whoever was paid (e.g. a contractor fixing the road) to sign as
// acknowledgement, then scanned and re-uploaded via "Ubah" on /expenses as
// that expense's Bukti Pengeluaran. Nothing here is pre-filled with a
// name, since the signer isn't tracked as a field on expenses.
export default async function KwitansiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/report");

  const { id } = await params;
  const supabase = await createClient();
  const { data: expense } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single<Expense>();

  if (!expense) notFound();

  const amount = Number(expense.amount);
  const tanggal = new Date(expense.expense_date).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const nomor = expense.id.slice(0, 8).toUpperCase();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 print:max-w-none print:px-0 print:py-0">
      {/* Real kwitansi paper is a small landscape slip — a page cut into
          thirds — not a full A4 sheet, so the printed page itself is sized
          to match instead of leaving most of an A4 page blank. */}
      <style>{`
        @media print {
          @page { size: 210mm 99mm; margin: 0; }
        }
      `}</style>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a
          href="/expenses"
          className="text-sm text-gray-500 hover:text-blue-600 transition"
        >
          &larr; Kembali ke Pengeluaran
        </a>
        <div className="flex gap-2">
          <DownloadPdfButton
            id={expense.id}
            amount={amount}
            description={expense.description}
            tanggal={tanggal}
          />
          <PrintButton />
        </div>
      </div>

      <div
        className="relative mx-auto flex min-h-[380px] w-full max-w-3xl overflow-hidden rounded-lg border border-gray-300 bg-white print:h-[99mm] print:w-[210mm] print:max-w-none print:rounded-none print:border-0"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      >
        {/* main content */}
        <div className="flex flex-1 flex-col justify-between p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image
                src="/kiwari-logo.png"
                alt="Kiwari Residence"
                width={200}
                height={140}
                className="h-[55px] w-auto"
                priority
              />
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  Kiwari Residence
                </p>
                <p className="mt-[3px] text-xs uppercase tracking-wide text-gray-400">
                  Forum Warga
                </p>
              </div>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-gray-900">
              KWITANSI
            </h2>
          </div>

          <div className="my-4 rounded-md bg-gray-100 px-4 py-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Telah diterima dari
              </dt>
              <dd className="text-gray-800">: Kas Kiwari Residence</dd>

              <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Uang sejumlah
              </dt>
              <dd className="font-semibold text-gray-900">
                : {formatRupiah(amount)}
              </dd>

              <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Untuk
              </dt>
              <dd className="text-gray-800">: {expense.description}</dd>

              <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Terbilang
              </dt>
              <dd className="italic text-gray-600">
                : {terbilangRupiah(amount)}
              </dd>
            </dl>
          </div>

          <p className="text-xs text-gray-500">
            Terima kasih atas kerja samanya.
          </p>
        </div>

        {/* date / signature / address column */}
        <div className="flex w-44 flex-col justify-between border-l border-dashed border-gray-300 p-4 text-xs">
          <div>
            <p className="whitespace-nowrap font-semibold text-gray-900">
              {tanggal}
            </p>
            <p className="mt-3 font-bold uppercase tracking-wide text-gray-500">
              Yang menerima
            </p>
          </div>
          <div>
            <div className="h-10 border-b border-dotted border-gray-400" />
            <p className="mt-1.5 text-[10px] text-gray-400">
              (Nama &amp; tanda tangan)
            </p>
            <p className="mt-3 text-[10px] leading-snug text-gray-400">
              Jl. Propelat Barat II, Margasari,
              <br />
              Kec. Buahbatu, Kota Bandung 40286
            </p>
          </div>
        </div>

        {/* accent shapes, straddling the strip's top edge */}
        <AccentShapes className="pointer-events-none absolute right-8 top-0 h-12 w-12" />

        {/* side strip — light fill so it doesn't burn through black ink
            when printed on a B&W printer */}
        <div className="flex w-10 flex-col items-center justify-between border-l border-gray-300 bg-gray-100 py-4 text-gray-700">
          <span className="[writing-mode:vertical-rl] text-base font-bold tracking-[0.2em]">
            KWITANSI
          </span>
          <span className="[writing-mode:vertical-rl] text-sm tracking-wide text-gray-500">
            NO: {nomor}
          </span>
        </div>
      </div>
    </div>
  );
}
