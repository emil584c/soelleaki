import { describe, expect, it } from 'vitest';

import { isPlausibleBarcode, normalizeBarcode } from './formats.js';

describe('normalizeBarcode', () => {
  it('fjerner alt der ikke er cifre', () => {
    expect(normalizeBarcode(' 570 123-456 7890 ')).toBe('5701234567890');
  });

  it('løfter UPC-A til 13 cifre, som Open Food Facts nøgler på', () => {
    expect(normalizeBarcode('012345678905')).toBe('0012345678905');
  });

  it('lader EAN-13 og EAN-8 være', () => {
    expect(normalizeBarcode('5701234567890')).toBe('5701234567890');
    expect(normalizeBarcode('96385074')).toBe('96385074');
  });
});

describe('isPlausibleBarcode', () => {
  it('godkender rigtige kontrolcifre', () => {
    expect(isPlausibleBarcode('3017620422003')).toBe(true); // Nutella
    expect(isPlausibleBarcode('96385074')).toBe(true); // EAN-8
    expect(isPlausibleBarcode('012345678905')).toBe(true); // UPC-A
  });

  it('afviser forkerte kontrolcifre og forkerte længder', () => {
    expect(isPlausibleBarcode('3017620422004')).toBe(false);
    expect(isPlausibleBarcode('12345')).toBe(false);
    expect(isPlausibleBarcode('')).toBe(false);
    expect(isPlausibleBarcode(null)).toBe(false);
  });
});
