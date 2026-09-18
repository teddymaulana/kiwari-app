"use client";

import { useState } from "react";
import type { jsPDF } from "jspdf";
import { formatRupiah } from "@/lib/types";
import { terbilangRupiah } from "@/lib/terbilang";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Same cluster as AccentShapes.tsx (two quarter-circles + a circle) drawn
// with jsPDF's own primitives — a rect used as a clip mask + a full circle
// for each petal, since jsPDF has no native pie-slice shape.
function drawAccentShapes(doc: jsPDF, x0: number, y0: number, size: number) {
  const sc = size / 60;
  const petal = (
    cellLx: number,
    cellLy: number,
    cornerLx: number,
    cornerLy: number,
    color: [number, number, number]
  ) => {
    doc.saveGraphicsState();
    doc.rect(x0 + cellLx * sc, y0 + cellLy * sc, 30 * sc, 30 * sc);
    doc.clip();
    doc.discardPath();
    doc.setFillColor(...color);
    doc.circle(x0 + cornerLx * sc, y0 + cornerLy * sc, 30 * sc, "F");
    doc.restoreGraphicsState();
  };

  petal(0, 0, 0, 0, [31, 41, 55]);
  petal(30, 0, 60, 0, [209, 213, 219]);
  petal(30, 30, 60, 60, [31, 41, 55]);

  doc.setFillColor(156, 163, 175);
  doc.circle(x0 + 15 * sc, y0 + 45 * sc, 12 * sc, "F");
}

// Draws the same layout as the on-screen/print receipt directly with
// jsPDF's own text/line primitives (rather than rasterizing the DOM with
// something like html2canvas) so the exported file stays a small, crisp,
// selectable-text PDF instead of an embedded screenshot.
export default function DownloadPdfButton({
  id,
  amount,
  description,
  tanggal,
}: {
  id: string;
  amount: number;
  description: string;
  tanggal: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleDownload() {
    setPending(true);
    try {
      const [{ jsPDF }, logo] = await Promise.all([
        import("jspdf"),
        loadImage("/kiwari-logo.png"),
      ]);

      // Real kwitansi paper is a small landscape slip — a page cut into
      // thirds, roughly 210x99mm — not a full A4 sheet.
      const doc = new jsPDF({
        unit: "mm",
        format: [210, 99],
        orientation: "landscape",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const nomor = id.slice(0, 8).toUpperCase();

      const stripW = 10;
      const dateColW = 40;
      const boundary1 = pageWidth - stripW - dateColW; // main | date column
      const boundary2 = pageWidth - stripW; // date column | strip
      const mainX = 10;

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      // light fill so the strip doesn't burn through black ink on a B&W
      // printer, with a thin border to still read as a distinct panel
      doc.setFillColor(243, 244, 246);
      doc.rect(boundary2, 0, stripW, pageHeight, "F");
      doc.setDrawColor(209, 213, 219);
      doc.line(boundary2, 0, boundary2, pageHeight);

      // dashed divider between the main content and the date column,
      // matching the border-dashed left edge of that column on the
      // on-screen/print version
      doc.setDrawColor(209, 213, 219);
      doc.setLineDashPattern([1.5, 1.2], 0);
      doc.line(boundary1, 0, boundary1, pageHeight);
      doc.setLineDashPattern([], 0);

      drawAccentShapes(doc, boundary2 - 10, 0, 14);

      // Unlike the on-screen/print version — which uses CSS flexbox
      // (justify-between) to spread its 3/2 blocks evenly down the card —
      // these are hand-placed coordinates, so the blocks below are spaced
      // out explicitly to fill the full 99mm height instead of clumping
      // near the top and leaving the bottom of the page blank.

      // header: logo + name, big title (block: y 8-22)
      const logoW = 19.98; // +10px, +5px
      const logoH = (logo.height / logo.width) * logoW;
      doc.addImage(logo, "PNG", mainX, 6, logoW, logoH);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13); // +4px
      doc.setTextColor(17, 24, 39);
      doc.text("Kiwari Residence", mainX + logoW + 3, 11.68); // -5px, aligns with the bigger logo

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5); // +2px
      doc.setTextColor(156, 163, 175);
      doc.text("FORUM WARGA", mainX + logoW + 3, 15.97); // -5px, +3px gap

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39);
      doc.text("KWITANSI", boundary1 - 6, 15.3, { align: "right" }); // vertical-center with the logo

      // detail panel (block: y 37.5-69.5)
      const panelY = 37.5;
      const panelH = 32;
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(mainX - 2, panelY, boundary1 - mainX, panelH, 2, 2, "F");

      const rows: [string, string][] = [
        ["Telah diterima dari", ": Kas Kiwari Residence"],
        ["Uang sejumlah", `: ${formatRupiah(amount)}`],
        ["Untuk", `: ${description}`],
        ["Terbilang", `: ${terbilangRupiah(amount)}`],
      ];

      let y = panelY + 6;
      const valueX = mainX + 32;
      const valueWidth = boundary1 - valueX - 6;
      for (const [label, value] of rows) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(107, 114, 128);
        doc.text(label.toUpperCase(), mainX, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(31, 41, 55);
        const lines = doc.splitTextToSize(value, valueWidth);
        doc.text(lines, valueX, y);
        y += 6.5 * lines.length;
      }

      // footer note (block: y 85-91)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text("Terima kasih atas kerja samanya.", mainX, 89);

      // date / signature column — top block (y 8-18) and bottom block
      // (y 61-91), same top-vs-bottom split as the HTML version's flexbox
      const dateX = boundary1 + 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(17, 24, 39);
      doc.text(tanggal, dateX, 13);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(107, 114, 128);
      doc.text("YANG MENERIMA", dateX, 17);

      const lineY = 65;
      doc.setDrawColor(156, 163, 175);
      doc.setLineDashPattern([0.6, 0.6], 0);
      doc.line(dateX, lineY, boundary2 - 6, lineY);
      doc.setLineDashPattern([], 0);

      doc.setFontSize(6);
      doc.setTextColor(156, 163, 175);
      doc.text("(Nama & tanda tangan)", dateX, lineY + 4);

      doc.setFontSize(6);
      doc.setTextColor(156, 163, 175);
      const addressWidth = boundary2 - 6 - dateX;
      const addressLines = doc.splitTextToSize(
        "Jl. Propelat Barat II, Margasari, Kec. Buahbatu, Kota Bandung 40286",
        addressWidth
      );
      doc.text(addressLines, dateX, lineY + 14);

      // side strip label. jsPDF's `align` option doesn't correctly center
      // rotated (angle:90) text — it leaves a library-computed offset that
      // isn't proportional to the string, so instead this centers the text
      // manually: for angle:90 with the default (left) align, (x, y) is the
      // bottom of the text and it grows upward by exactly getTextWidth(),
      // with a small perpendicular offset scaling with font size.
      const stripCenterX = boundary2 + stripW / 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11); // +4px
      doc.setTextColor(55, 65, 81);
      const titleText = "KWITANSI";
      const titleWidth = doc.getTextWidth(titleText);
      doc.text(titleText, stripCenterX + 1.75, 42 + titleWidth / 2, {
        angle: 90,
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9); // +4px
      doc.setTextColor(107, 114, 128);
      const noText = `NO: ${nomor}`;
      const noWidth = doc.getTextWidth(noText);
      doc.text(noText, stripCenterX + 1.5, 80 + noWidth / 2, {
        angle: 90,
      });

      doc.save(`kwitansi-${nomor}.pdf`);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={pending}
      className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Menyiapkan..." : "Unduh PDF"}
    </button>
  );
}
