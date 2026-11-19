"use client";

import { useRef, useState, useTransition } from "react";
import { sendSecurityAlert } from "./actions";

// Phone photos are several MB, over the 1MB server action body limit, so
// the photo is shrunk to a JPEG in the browser before it's sent.
const MAX_SIDE = 1280;

async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal memproses foto"))),
      "image/jpeg",
      0.75
    )
  );
}

export default function AlertForm() {
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const pickPhoto = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || pending) return;
    setResult(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("message", message.trim());
      if (photo) {
        try {
          data.set("photo", await shrinkPhoto(photo), "alert.jpg");
        } catch {
          setResult({ error: "Foto tidak bisa dibaca. Coba ambil ulang." });
          return;
        }
      }
      const { error } = await sendSecurityAlert(data).catch(() => ({
        error: "Gagal mengirim. Cek koneksi lalu coba lagi.",
      }));
      if (error) {
        setResult({ error });
        return;
      }
      setResult({ ok: true });
      setMessage("");
      pickPhoto(null);
      if (fileInput.current) fileInput.current.value = "";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={1000}
        required
        placeholder="Contoh: Ada orang mencurigakan di depan rumah 12B, mohon dicek."
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
      />

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Foto alert" className="max-h-48 rounded border border-gray-200" />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
          {photo ? "Ganti foto" : "Ambil / pilih foto"}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {photo && (
          <button
            type="button"
            onClick={() => {
              pickPhoto(null);
              if (fileInput.current) fileInput.current.value = "";
            }}
            className="text-sm text-gray-500 hover:underline"
          >
            Hapus foto
          </button>
        )}
        <span className="text-xs text-gray-400">Foto opsional</span>
      </div>

      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {result?.ok && (
        <p className="text-sm text-emerald-700">
          Alert terkirim. HP sekuriti akan bergetar saat aplikasi Security Kiwari terbuka.
        </p>
      )}

      <button
        type="submit"
        disabled={!message.trim() || pending}
        className="w-full sm:w-auto bg-red-600 text-white rounded px-5 py-2 text-sm font-medium hover:bg-red-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Mengirim..." : "Kirim Alert ke Sekuriti"}
      </button>
    </form>
  );
}
