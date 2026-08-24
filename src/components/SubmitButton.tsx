"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

// Drop-in replacement for a plain <button type="submit"> inside a
// <form action={serverAction}> — must be a child of that form for
// useFormStatus to see its pending state. Shows a spinner + pendingText
// (or the same label) and disables the button while the action runs, so
// slow actions (file uploads, OCR, auth) can't be double-submitted and
// give the user feedback instead of looking frozen.
export default function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={`${className ?? ""} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          {pendingText ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
