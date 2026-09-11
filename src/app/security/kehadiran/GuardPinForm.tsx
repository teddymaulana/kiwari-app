"use client";

import { useState } from "react";
import SubmitButton from "@/components/SubmitButton";

export default function GuardPinForm({
  action,
  hasPin,
}: {
  action: (formData: FormData) => Promise<void>;
  hasPin: boolean;
}) {
  const [editing, setEditing] = useState(!hasPin);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-gray-500 hover:text-blue-600 transition"
      >
        Ubah PIN
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        setEditing(false);
      }}
      className="flex items-center gap-1.5"
    >
      <input
        type="text"
        name="pin"
        inputMode="numeric"
        placeholder="4-6 digit"
        required
        pattern="\d{4,6}"
        className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
      />
      <SubmitButton
        pendingText="..."
        className="text-xs bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700 transition"
      >
        Simpan
      </SubmitButton>
    </form>
  );
}
