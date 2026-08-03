/**
 * De stregkodetyper der rent faktisk sidder på madvarer.
 *
 * EAN-13 er standarden i Europa, EAN-8 på små emballager, UPC-A/E er de
 * amerikanske varianter som også dukker op på importvarer. Bevidst ingen
 * QR-koder: samme API kan læse dem, men de er aldrig produktets stregkode
 * og ville kun give falske hits.
 */
export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/**
 * Normalisér til den form Open Food Facts bruger som nøgle.
 *
 * UPC-A er reelt en EAN-13 med et foranstillet 0, og OFF gemmer dem
 * 13-cifret. Uden det her ville amerikanske varer give falske "findes
 * ikke"-svar.
 */
export function normalizeBarcode(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12) return `0${digits}`;
  return digits;
}

/** Modulo-10-tjek. Fanger fejllæsninger før vi slår op. */
export function isPlausibleBarcode(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return false;

  const body = digits.slice(0, -1).split('').reverse();
  const check = Number(digits.slice(-1));
  const sum = body.reduce((acc, digit, i) => acc + Number(digit) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
