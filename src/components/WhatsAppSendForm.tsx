"use client";

import { useState } from "react";
import WargaPhoneSelect, {
  type WargaPhoneHousehold,
} from "@/components/WargaPhoneSelect";
import SubmitButton from "@/components/SubmitButton";

// Wraps the target select + phone field so picking "Kiwari Emas" (the
// group) can disable No. HP — plain server-rendered siblings can't
// coordinate that on their own, so this owns the shared "target" state.
export default function WhatsAppSendForm({
  action,
  households,
}: {
  action: (formData: FormData) => void;
  households: WargaPhoneHousehold[];
}) {
  const [target, setTarget] = useState("phone");
  const toGroup = target === "group";

  return (
    <form
      action={action}
      className="bg-white border border-gray-200 rounded-lg p-6 space-y-3"
    >
      <select
        name="target"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="phone">Nomor HP (isi di bawah)</option>
        <option value="group">Kiwari Emas</option>
      </select>
      <WargaPhoneSelect
        households={households}
        name="phone"
        placeholder="No. HP, atau cari nama/no. rumah warga — kosongkan jika kirim ke grup"
        disabled={toGroup}
      />
      <textarea
        name="message"
        placeholder="Pesan"
        required
        rows={6}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <SubmitButton
        pendingText="Mengirim..."
        className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
      >
        Kirim
      </SubmitButton>
    </form>
  );
}
