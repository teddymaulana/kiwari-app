"use client";

import { useState } from "react";
import { submitCheckin } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { SHIFT_LABELS } from "@/lib/types";

type Guard = { id: string; name: string };
type Candidate = { shift_date: string; shift_type: "pagi" | "malam" };

export default function CheckinForm({
  guards,
  candidatesByGuard,
}: {
  guards: Guard[];
  candidatesByGuard: Record<string, Candidate[]>;
}) {
  const [guardId, setGuardId] = useState("");
  const candidates = guardId ? candidatesByGuard[guardId] ?? [] : [];

  return (
    <form action={submitCheckin} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nama
        </label>
        <select
          name="guard_id"
          required
          value={guardId}
          onChange={(e) => setGuardId(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Pilih nama...</option>
          {guards.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          PIN
        </label>
        <input
          type="password"
          inputMode="numeric"
          name="pin"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {guardId && candidates.length === 0 && (
        <p className="text-sm text-red-600">
          Tidak ada jadwal shift Anda hari ini atau kemarin malam. Hubungi
          pengurus jika ini seharusnya jadwal Anda.
        </p>
      )}

      {candidates.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Shift
          </label>
          <div className="space-y-2">
            {candidates.map((c, i) => (
              <label
                key={`${c.shift_date}-${c.shift_type}`}
                className="flex items-center gap-2 text-sm rounded border border-gray-300 px-3 py-2 cursor-pointer has-checked:border-blue-500 has-checked:bg-blue-50"
              >
                <input
                  type="radio"
                  // Combines shift_date + shift_type into one value (the
                  // server action splits it on "|") since a radio group
                  // can only carry a single field.
                  name="shift_key"
                  value={`${c.shift_date}|${c.shift_type}`}
                  defaultChecked={i === 0}
                  className="accent-blue-600"
                />
                {SHIFT_LABELS[c.shift_type]} —{" "}
                {new Date(c.shift_date).toLocaleDateString("id-ID")}
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Foto
        </label>
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          required
          className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-100 file:text-sm file:text-gray-700"
        />
      </div>

      <SubmitButton
        disabled={!guardId || candidates.length === 0}
        pendingText="Mengirim..."
        className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition"
      >
        Absen
      </SubmitButton>
    </form>
  );
}
