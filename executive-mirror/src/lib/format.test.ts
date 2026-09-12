import { describe, it, expect } from 'vitest';
import { formatMetric } from './format';

describe('metric formatting', () => {
  it('spaces multi-character word units', () => {
    expect(formatMetric(18, 'words')).toBe('18 words');
    expect(formatMetric(150, 'wpm')).toBe('150 wpm');
    expect(formatMetric(420, 'ms')).toBe('420 ms');
  });
  it('keeps single-character units tight', () => {
    expect(formatMetric(26.8, 's')).toBe('26.8s');
  });
  it('keeps ratio and rate units tight', () => {
    expect(formatMetric(3.8, '/100w')).toBe('3.8/100w');
    expect(formatMetric(5.2, '/min')).toBe('5.2/min');
    expect(formatMetric(1.4, ':1')).toBe('1.4:1');
  });
  it('handles unitless counts', () => {
    expect(formatMetric(3, '')).toBe('3');
  });
});
