"use client";

import { useMemo, useRef, useState } from "react";
import WargaPhoneSelect, {
  householdPhoneOptions,
  type PhoneOption,
  type WargaPhoneHousehold,
} from "@/components/WargaPhoneSelect";
import SubmitButton from "@/components/SubmitButton";

// Wraps the target select + phone field — plain server-rendered siblings
// can't coordinate on their own, so this owns the shared "target" state.
// The blast targets ("kk:..." — semua warga, semua kepala keluarga,
// pengurus, or one blok) swap No. HP for that group's recipient list (each
// removable, to leave some warga out of the blast), plus a picker to add
// more numbers — any kepala keluarga or pasangan — and show the final list
// + message in a confirm dialog before submitting, since it messages them
// all at once.
export default function WhatsAppSendForm({
  action,
  households,
  pengurusHouseholdIds,
}: {
  action: (formData: FormData) => void;
  households: WargaPhoneHousehold[];
  pengurusHouseholdIds: string[];
}) {
  const [target, setTarget] = useState("phone");
  // ✕'d recipients, by "<household id>:kk|pasangan" key.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  // Extra recipients added on top of the group, in the order added.
  const [added, setAdded] = useState<PhoneOption[]>([]);
  // Message text captured when the confirm dialog opens (null = closed).
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Lets the dialog's Kirim re-submit the form past the onSubmit intercept.
  const confirmedRef = useRef(false);
  const toAllKk = target.startsWith("kk:");

  // Blast groups, each a list of numbers (PhoneOption, keyed
  // "<household id>:kk|pasangan" — also exactly what gets submitted, see
  // blastToKepalaKeluarga). Kepala keluarga = households.phone; "Semua
  // warga" and the blok groups add each household's phone_pasangan right
  // after it. Households
  // without a number on file can't be messaged so they aren't listed.
  // Blok groups go by the numeric part of unit_no ("18G" -> blok 18), in
  // the order households already come in (sorted by compareUnitNo).
  const kkGroups = useMemo(() => {
    const pengurus = new Set(pengurusHouseholdIds);
    const kepala = (h: WargaPhoneHousehold) =>
      householdPhoneOptions(h).filter((o) => o.key.endsWith(":kk"));
    // shortLabel: for the confirm dialog title, where the full label's own
    // parentheses would nest awkwardly.
    const groups: {
      value: string;
      label: string;
      shortLabel?: string;
      members: PhoneOption[];
    }[] = [
      {
        value: "kk:warga",
        label: "Semua warga (kepala keluarga + pasangan)",
        shortLabel: "Semua warga",
        members: households.flatMap(householdPhoneOptions),
      },
      {
        value: "kk:all",
        label: "Semua kepala keluarga",
        members: households.flatMap(kepala),
      },
      {
        value: "kk:pengurus",
        label: "Pengurus",
        members: households.filter((h) => pengurus.has(h.id)).flatMap(kepala),
      },
    ];
    for (const h of households) {
      const blok = h.unit_no.match(/^\d+/)?.[0];
      // Blok groups include pasangan too, like "Semua warga".
      const members = householdPhoneOptions(h);
      if (!blok || members.length === 0) continue;
      const value = `kk:blok:${blok}`;
      let group = groups.find((g) => g.value === value);
      if (!group) {
        group = { value, label: `Blok ${blok}`, members: [] };
        groups.push(group);
      }
      group.members.push(...members);
    }
    return groups;
  }, [households, pengurusHouseholdIds]);
  const group = kkGroups.find((g) => g.value === target);
  const groupMembers = group?.members ?? [];
  const groupTitle = group?.shortLabel ?? group?.label;
  const groupKeys = new Set(groupMembers.map((o) => o.key));
  const groupRecipients = groupMembers.filter((o) => !excluded.has(o.key));
  // ✕ removals only count against the group currently shown.
  const excludedCount = groupMembers.length - groupRecipients.length;
  // Extras stay put when switching groups — skip any the new group
  // already lists itself (e.g. a pasangan added earlier, now in-group).
  const extras = added.filter((a) => !groupKeys.has(a.key));
  // Everyone the blast goes to.
  const recipients: PhoneOption[] = [...groupRecipients, ...extras];
  const recipientKeys = new Set(recipients.map((r) => r.key));
  // What the server will actually send to — the same number twice (two
  // households sharing one, or a pasangan with the kepala's number) only
  // gets the message once.
  const recipientCount = new Set(recipients.map((r) => r.phone.trim())).size;

  function addRecipient(o: PhoneOption) {
    // Someone already in this group but ✕'d just comes back into the
    // group list rather than being listed twice.
    if (groupKeys.has(o.key)) {
      setExcluded((prev) => {
        const next = new Set(prev);
        next.delete(o.key);
        return next;
      });
      return;
    }
    setAdded((prev) =>
      prev.some((a) => a.key === o.key) ? prev : [...prev, o]
    );
  }

  function toggleExcluded(key: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (!toAllKk) return;
        if (confirmedRef.current) {
          confirmedRef.current = false;
          return;
        }
        e.preventDefault();
        setConfirmMessage(
          String(new FormData(e.currentTarget).get("message") ?? "").trim()
        );
      }}
      className="bg-white border border-gray-200 rounded-lg p-6 space-y-3"
    >
      <select
        name="target"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="phone">Nomor HP (isi di bawah)</option>
        <optgroup label="Banyak penerima">
          {kkGroups.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label} ({g.members.length})
            </option>
          ))}
        </optgroup>
      </select>
      {toAllKk ? (
        <div className="rounded border border-gray-300">
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 text-xs text-gray-500">
            <span>
              {recipients.length} penerima
              {extras.length > 0 && ` · ${extras.length} tambahan`}
              {excludedCount > 0 && ` · ${excludedCount} dikecualikan`}
            </span>
            {excludedCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setExcluded((prev) => {
                    const next = new Set(prev);
                    for (const o of groupMembers) next.delete(o.key);
                    return next;
                  })
                }
                className="text-blue-600 hover:underline"
              >
                Kembalikan semua
              </button>
            )}
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100">
            {groupMembers.length === 0 && extras.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-gray-400">
                Tidak ada warga dengan No. HP di grup ini.
              </li>
            )}
            {groupMembers.map((o) => {
              const isExcluded = excluded.has(o.key);
              return (
                <li
                  key={o.key}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm ${isExcluded ? "bg-gray-50 text-gray-400" : "text-gray-800"}`}
                >
                  {!isExcluded && (
                    <input type="hidden" name="recipient" value={o.key} />
                  )}
                  <span className={`min-w-0 flex-1 truncate ${isExcluded ? "line-through" : ""}`}>
                    {o.label}
                    <span className="ml-2 text-xs text-gray-400">{o.phone}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleExcluded(o.key)}
                    aria-label={
                      isExcluded
                        ? `Masukkan lagi ${o.label}`
                        : `Kecualikan ${o.label}`
                    }
                    className={`shrink-0 rounded px-1.5 text-sm ${isExcluded ? "text-blue-600 hover:bg-blue-50" : "text-gray-400 hover:bg-red-50 hover:text-red-600"}`}
                  >
                    {isExcluded ? "↺" : "✕"}
                  </button>
                </li>
              );
            })}
            {extras.map((o) => (
              <li
                key={o.key}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800 bg-blue-50/40"
              >
                <input type="hidden" name="recipient" value={o.key} />
                <span className="min-w-0 flex-1 truncate">
                  {o.label}
                  <span className="ml-2 text-xs text-gray-400">{o.phone}</span>
                  <span className="ml-2 text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-blue-100 text-blue-700">
                    tambahan
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAdded((prev) => prev.filter((a) => a.key !== o.key))
                  }
                  aria-label={`Hapus ${o.label}`}
                  className="shrink-0 rounded px-1.5 text-sm text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-200 p-2">
            <WargaPhoneSelect
              households={households}
              onPick={addRecipient}
              hiddenKeys={recipientKeys}
              placeholder="+ Tambah penerima: cari nama/no. rumah (kepala keluarga atau pasangan)"
              className="w-full rounded border border-dashed border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      ) : (
        <WargaPhoneSelect
          households={households}
          name="phone"
          placeholder="No. HP, atau cari nama/no. rumah warga"
        />
      )}
      <textarea
        name="message"
        placeholder="Pesan"
        required
        rows={6}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <p className="-mt-2 text-xs text-gray-400">
        Otomatis ditambahkan di akhir pesan: <em>Pesan otomatis dari Kiwari App</em>
      </p>
      <SubmitButton
        pendingText="Mengirim..."
        disabled={toAllKk && recipients.length === 0}
        className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
      >
        Kirim
      </SubmitButton>

      {confirmMessage !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmMessage(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="blast-confirm-title"
            className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="blast-confirm-title"
              className="text-sm font-semibold text-gray-900"
            >
              Kirim ke {recipientCount} nomor
              {` (${groupTitle}${extras.length > 0 ? ` + ${extras.length} tambahan` : ""})`}
              ?
            </h3>
            <p className="text-xs text-gray-400 mt-1 mb-3">
              Tidak bisa dibatalkan setelah terkirim.
            </p>

            <p className="text-xs font-medium text-gray-500 mb-1">Pesan</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words rounded border border-gray-200 bg-gray-50 px-3 py-2 mb-3 max-h-32 overflow-y-auto">
              {confirmMessage}
            </p>

            <p className="text-xs font-medium text-gray-500 mb-1">
              Penerima ({recipients.length})
            </p>
            <ul className="min-h-0 flex-1 overflow-y-auto rounded border border-gray-200 divide-y divide-gray-100 mb-4">
              {recipients.map((r) => (
                <li key={r.key} className="px-3 py-1.5 text-sm text-gray-800">
                  {r.label}
                  <span className="ml-2 text-xs text-gray-400">{r.phone}</span>
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmMessage(null)}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setConfirmMessage(null);
                  confirmedRef.current = true;
                  formRef.current?.requestSubmit();
                }}
                className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
              >
                Kirim
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
