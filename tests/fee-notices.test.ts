import { describe, it, expect } from 'vitest';
import { activeFeeNotices } from '@bba/shared';

describe('fees page notices', () => {
  it('Dadar sees fees and gate pass on 30 Oct; RBI sees no gate pass', () => {
    expect(activeFeeNotices('DAD', '2026-10-30').map((n) => n.id)).toEqual(['fees-nov-2026', 'gate-pass-dadar']);
    expect(activeFeeNotices('RBI', '2026-10-30').map((n) => n.id)).toEqual(['fees-nov-2026']);
  });
  it('Diwali notice runs to 11 Nov and each notice expires on its own', () => {
    expect(activeFeeNotices('RBI', '2026-11-08').map((n) => n.id)).toEqual(['diwali-2026']);
    expect(activeFeeNotices('BAN', '2026-11-11').map((n) => n.id)).toEqual(['diwali-2026']);
    expect(activeFeeNotices('RBI', '2026-11-12')).toEqual([]);
    expect(activeFeeNotices('RUI', '2026-10-30')).toEqual([]);
  });
});
