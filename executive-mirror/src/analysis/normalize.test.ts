import { describe, it, expect } from 'vitest';
import { normalize, foldDigits, scriptOf, dominantScript } from './normalize';

describe('Arabic normalisation', () => {
  it('strips harakat so diacritised and bare text match', () => {
    // "الجَوْدَة" (diacritised) must match "الجودة"
    expect(normalize('الجَوْدَة')).toBe(normalize('الجودة'));
  });

  it('strips tatweel', () => {
    expect(normalize('الجـــودة')).toBe(normalize('الجودة'));
  });

  it('unifies alef variants', () => {
    expect(normalize('أحمد')).toBe(normalize('احمد'));
    expect(normalize('إدارة')).toBe(normalize('ادارة'));
    expect(normalize('آمن')).toBe(normalize('امن'));
  });

  it('unifies yaa and taa marbuta', () => {
    expect(normalize('على')).toBe(normalize('علي'));
    expect(normalize('جودة')).toBe(normalize('جوده'));
  });

  it('folds Arabic-Indic digits to ASCII', () => {
    expect(foldDigits('٩٩٫٥')).toContain('99');
    expect(foldDigits('٢٠٢٦')).toBe('2026');
  });

  it('normalises Arabic punctuation', () => {
    expect(normalize('ما رأيك؟')).toBe(normalize('ما رايك'));
    expect(normalize('أولاً، ثانياً')).toBe(normalize('اولا ثانيا'));
  });

  it('is idempotent', () => {
    const s = 'الحَوْكَمَة الإكلينيكيّة';
    expect(normalize(normalize(s))).toBe(normalize(s));
  });

  it('leaves English behaviour intact', () => {
    expect(normalize('The  Quality,  Department!')).toBe('the quality department');
  });
});

describe('script detection', () => {
  it('tags Arabic and Latin tokens', () => {
    expect(scriptOf('الجودة')).toBe('arabic');
    expect(scriptOf('governance')).toBe('latin');
    expect(scriptOf('123')).toBe('other');
  });

  it('detects dominant script in a code-switched sentence', () => {
    expect(dominantScript('احنا طبقنا الـ governance framework في المجموعة')).toBe('arabic');
    expect(dominantScript('we applied the حوكمة model')).toBe('latin');
  });

  it('returns null for genuinely mixed text', () => {
    expect(dominantScript('governance حوكمة')).toBeNull();
  });
});
