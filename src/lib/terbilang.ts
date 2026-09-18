const SATUAN = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

// Recursive Indonesian number-to-words, standard algorithm (satuan/belas/
// puluh/ratus/ribu/juta/miliar/triliun) — used on the Kwitansi print page
// to spell out the "Terbilang" line next to the numeric amount.
export function terbilang(n: number): string {
  n = Math.floor(n);
  if (n < 0) return `minus ${terbilang(-n)}`;
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) {
    const sisa = n % 10;
    return `${terbilang(Math.floor(n / 10))} puluh${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 200) {
    const sisa = n % 100;
    return `seratus${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 1000) {
    const sisa = n % 100;
    return `${terbilang(Math.floor(n / 100))} ratus${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 2000) {
    const sisa = n % 1000;
    return `seribu${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 1000000) {
    const sisa = n % 1000;
    return `${terbilang(Math.floor(n / 1000))} ribu${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 1000000000) {
    const sisa = n % 1000000;
    return `${terbilang(Math.floor(n / 1000000))} juta${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  if (n < 1000000000000) {
    const sisa = n % 1000000000;
    return `${terbilang(Math.floor(n / 1000000000))} miliar${sisa ? ` ${terbilang(sisa)}` : ""}`;
  }
  const sisa = n % 1000000000000;
  return `${terbilang(Math.floor(n / 1000000000000))} triliun${sisa ? ` ${terbilang(sisa)}` : ""}`;
}

export function terbilangRupiah(amount: number): string {
  const words = terbilang(amount);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} rupiah`;
}
