import { describe, it, expect } from 'vitest';
import { activeFeeNotices } from '@bba/shared';

describe('fees page notices', () => {
  it('Dadar sees fees, gate pass and Diwali on 30 Oct; RBI sees no gate pass', () => {
    expect(activeFeeNotices('DAD', '2026-10-30').map((n) => n.id)).toEqual(['fees-nov-2026', 'gate-pass-dadar', 'diwali-2026']);
    expect(activeFeeNotices('RBI', '2026-10-30').map((n) => n.id)).toEqual(['fees-nov-2026', 'diwali-2026']);
  });
  it('each notice expires on its own', () => {
    expect(activeFeeNotices('RBI', '2026-11-02').map((n) => n.id)).toEqual(['fees-nov-2026']);
    expect(activeFeeNotices('RBI', '2026-11-06')).toEqual([]);
    expect(activeFeeNotices('RUI', '2026-10-30')).toEqual([]);
  });
});
