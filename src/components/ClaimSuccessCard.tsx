export default function ClaimSuccessCard({
  message,
  resetHref,
}: {
  message: string;
  resetHref: string;
}) {
  return (
    <div className="text-center py-6">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-7 w-7 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Klaim Berhasil Terkirim
      </h3>
      <p className="text-sm text-gray-500 mb-1">{message}</p>
      <p className="text-sm text-gray-500 mb-6">
        Pengurus akan memverifikasi klaim Anda sebelum tercatat Lunas.
      </p>
      <a
        href={resetHref}
        className="inline-block text-sm text-blue-600 hover:text-blue-700 hover:underline"
      >
        Kirim klaim lain
      </a>
    </div>
  );
}
