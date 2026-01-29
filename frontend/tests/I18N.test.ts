import { describe, expect, it } from 'vitest';

import { I18N } from '../constants';


describe('I18N', () => {
  it('has required keys for each language', () => {
    const required = [
      'title',
      'start',
      'setup',
      'track',
      'seniority',
      'stacks',
      'style',
      'duration',
      'enterRoom',
      'finishEarly',
      'confirmFinish',
    ];

    (Object.keys(I18N) as Array<keyof typeof I18N>).forEach((lang) => {
      const dict = I18N[lang];
      required.forEach((key) => {
        expect(dict[key]).toBeDefined();
        expect(String(dict[key]).length).toBeGreaterThan(0);
      });
    });
  });
});
