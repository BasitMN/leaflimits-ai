import { describe, expect, it } from 'vitest';
import { MAX_INPUT_BYTES, checkImageFile, decodeErrorMessage, fitWithin } from './image';

describe('fitWithin', () => {
  it('scales the longer side down to the maximum', () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });
  it('never scales up', () => expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 }));
});

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('checkImageFile', () => {
  it('accepts common photo types', () => {
    for (const [n, t] of [['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp'], ['IMG_1.HEIC', 'image/heic']]) {
      expect(checkImageFile(file(n, t))).toBeNull();
    }
  });
  it('uses the extension when the browser gives no MIME type', () => {
    expect(checkImageFile(file('IMG_1.HEIC', ''))).toBeNull();
    expect(checkImageFile(file('photo.JPG', ''))).toBeNull();
  });
  it('rejects things that are not photos', () => {
    expect(checkImageFile(file('notes.txt', 'text/plain'))).toMatch(/not an image/);
    expect(checkImageFile(file('report.pdf', 'application/pdf'))).toMatch(/not an image/);
    expect(checkImageFile(file('noext', ''))).toMatch(/not an image/);
    expect(checkImageFile(file('drawing.svg', 'image/svg+xml'))).toMatch(/SVG/);
  });
  it('rejects empty and oversized files, and accepts exactly the limit', () => {
    expect(checkImageFile(file('a.jpg', 'image/jpeg', 0))).toMatch(/empty/);
    expect(checkImageFile(file('a.jpg', 'image/jpeg', MAX_INPUT_BYTES + 1))).toMatch(/25 MB/);
    expect(checkImageFile(file('a.jpg', 'image/jpeg', MAX_INPUT_BYTES))).toBeNull();
  });
});

describe('decodeErrorMessage', () => {
  it('explains HEIC specifically', () => {
    expect(decodeErrorMessage(file('a.heic', 'image/heic'))).toMatch(/HEIC/);
    expect(decodeErrorMessage(file('a.HEIF', ''))).toMatch(/HEIC/);
  });
  it('has a generic message for everything else', () => {
    expect(decodeErrorMessage(file('a.jpg', 'image/jpeg'))).toMatch(/Could not read/);
  });
});
