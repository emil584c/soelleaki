/**
 * Open Food Facts-klient.
 *
 * Data er ODbL-licenseret og krediteres synligt i appen (se Om-siden).
 * Ingen nøgler, ingen konto, ingen backend imellem — browseren taler
 * direkte med API'et.
 */

const API_BASE = 'https://world.openfoodfacts.org/api/v2/product';

/** Kun de felter vi rent faktisk bruger. Mindre svar = hurtigere i butikken. */
const FIELDS = [
  'code',
  'product_name',
  'product_name_da',
  'generic_name',
  'brands',
  'quantity',
  'ingredients_text',
  'ingredients_text_da',
  'allergens_tags',
  'traces_tags',
  'labels_tags',
  'image_front_url',
  'image_front_small_url',
].join(',');

export const PRODUCT_EDIT_URL = (barcode) =>
  `https://world.openfoodfacts.org/cgi/product.pl?type=edit&code=${encodeURIComponent(barcode)}`;

export const PRODUCT_PAGE_URL = (barcode) =>
  `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`;

export class ProductNotFoundError extends Error {
  constructor(barcode) {
    super(`Produktet ${barcode} findes ikke i Open Food Facts.`);
    this.name = 'ProductNotFoundError';
    this.barcode = barcode;
  }
}

export class LookupError extends Error {
  constructor(message, { cause, offline = false } = {}) {
    super(message, { cause });
    this.name = 'LookupError';
    this.offline = offline;
  }
}

/**
 * Slå en stregkode op.
 * @param {string} barcode Normaliseret stregkode.
 * @param {{signal?: AbortSignal, timeoutMs?: number}} [options]
 * @returns {Promise<object>} Rå `product`-objekt fra API'et.
 */
export async function fetchProduct(barcode, { signal, timeoutMs = 12000 } = {}) {
  const url = `${API_BASE}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response;
  try {
    response = await fetch(url, { signal: combined, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (!navigator.onLine) {
      throw new LookupError('Ingen forbindelse. Opslaget kræver internet.', {
        cause: error,
        offline: true,
      });
    }
    throw new LookupError('Kunne ikke få fat i Open Food Facts. Prøv igen.', { cause: error });
  }

  // v2 svarer 404 på ukendte koder, ældre ruter svarer 200 med status: 0.
  if (response.status === 404) throw new ProductNotFoundError(barcode);
  if (!response.ok) {
    throw new LookupError(`Open Food Facts svarede med fejl (${response.status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new LookupError('Svaret fra Open Food Facts kunne ikke læses.', { cause: error });
  }

  if (payload?.status === 0 || !payload?.product) throw new ProductNotFoundError(barcode);

  return payload.product;
}

/** Produktnavn med de danske felter først. */
export function productTitle(product) {
  const name =
    product?.product_name_da?.trim() ||
    product?.product_name?.trim() ||
    product?.generic_name?.trim();
  return name || 'Uden navn i databasen';
}

export function ingredientsText(product) {
  return product?.ingredients_text_da?.trim() || product?.ingredients_text?.trim() || '';
}

/**
 * Allergen-tags til visning: 'en:gluten' -> 'gluten'.
 * Vi oversætter ikke — et forkert oversat allergennavn er værre end et engelsk.
 */
export function humanizeTag(tag) {
  return String(tag)
    .replace(/^[a-z]{2}:/, '')
    .replace(/-/g, ' ');
}
