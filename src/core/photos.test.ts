import { describe, expect, it } from 'vitest';
import { cleanPhotos, fitSize, isPhoto, MAX_RAPPORT_PHOTOS } from './photos';

const jpeg = 'data:image/jpeg;base64,/9j/4AAQ';

describe('photos', () => {
  it('shrinks the longest side and keeps the proportions', () => {
    expect(fitSize(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitSize(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it('never enlarges a small photo', () => {
    expect(fitSize(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it('accepts only JPEG data URLs', () => {
    expect(isPhoto(jpeg)).toBe(true);
    expect(isPhoto('data:text/html;base64,PGI+')).toBe(false);
    expect(isPhoto('https://example.com/a.jpg')).toBe(false);
    expect(isPhoto(42)).toBe(false);
  });

  it('keeps valid photos only, at most the allowed number', () => {
    const many = Array.from({ length: MAX_RAPPORT_PHOTOS + 2 }, () => jpeg);
    expect(cleanPhotos([jpeg, 'x', null])).toEqual([jpeg]);
    expect(cleanPhotos(many)).toHaveLength(MAX_RAPPORT_PHOTOS);
    expect(cleanPhotos(undefined)).toEqual([]);
  });
});
