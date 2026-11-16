import { describe, it, expect } from 'vitest';
import { Mulberry32 } from '../../src/core/rng';
import { BUILTIN_PROFILES } from '../../src/core/profiles';
import { planTrackBlocks, avoidBoundaryCollisions, mergeConsecutiveRests } from '../../src/core/planner';
import { computeActiveWindow, getNextDayBoundaryMs } from '../../src/core/calendar';
import { Block } from '../../src/core/types';

describe('Core Planner & Rules', () => {
  const profile = BUILTIN_PROFILES['regular']!;

  it('guarantees identical plans for identical seeds and profiles', () => {
    const t0 = 1731542400000; // Fixed epoch
    const rng1 = new Mulberry32(123456);
    const rng2 = new Mulberry32(123456);

    const plan1 = planTrackBlocks(rng1, { profile, quotaSeconds: 7200, startTimeUtc: t0 });
    const plan2 = planTrackBlocks(rng2, { profile, quotaSeconds: 7200, startTimeUtc: t0 });

    expect(plan1.map(b => ({ type: b.type, durationSec: b.durationSec })))
      .toEqual(plan2.map(b => ({ type: b.type, durationSec: b.durationSec })));
  });

  it('delivers quota exact to the second in DEDICATED mode', () => {
    // Test target = 3600s (1h)
    const rng1 = new Mulberry32(777111);
    const plan1h = planTrackBlocks(rng1, { profile, quotaSeconds: 3600, startTimeUtc: 1731542400000 });
    const totalPlay1h = plan1h.filter(b => b.type === 'play').reduce((acc, b) => acc + b.durationSec, 0);
    expect(totalPlay1h).toBe(3600);

    // Test target = 7200s (2h)
    const rng2 = new Mulberry32(888222);
    const plan2h = planTrackBlocks(rng2, { profile, quotaSeconds: 7200, startTimeUtc: 1731542400000 });
    const totalPlay2h = plan2h.filter(b => b.type === 'play').reduce((acc, b) => acc + b.durationSec, 0);
    expect(totalPlay2h).toBe(7200);

    // Test non-round target = 4521s
    const rng3 = new Mulberry32(999333);
    const planOdd = planTrackBlocks(rng3, { profile, quotaSeconds: 4521, startTimeUtc: 1731542400000 });
    const totalPlayOdd = planOdd.filter(b => b.type === 'play').reduce((acc, b) => acc + b.durationSec, 0);
    expect(totalPlayOdd).toBe(4521);
  });

  it('has no rest block after the final quota block', () => {
    const rng = new Mulberry32(54321);
    const plan = planTrackBlocks(rng, { profile, quotaSeconds: 3600, startTimeUtc: 1731542400000 });
    const lastBlock = plan[plan.length - 1]!;
    expect(lastBlock.type).toBe('play');
  });

  it('correctly handles active window wrapping past midnight', () => {
    // 09:00 to 02:00 window
    const customProfile = {
      ...profile,
      activeWindow: { start: '09:00', end: '02:00', edgeJitterMin: 0 }
    };

    // Test during daytime (14:00)
    const daytime = new Date(2026, 10, 14, 14, 0, 0).getTime();
    const winDay = computeActiveWindow(daytime, customProfile);
    expect(winDay).not.toBeNull();
    expect(daytime).toBeGreaterThanOrEqual(winDay!.windowStartMs);
    expect(daytime).toBeLessThan(winDay!.windowEndMs);

    // Test after midnight within wrapped window (01:30)
    const lateNight = new Date(2026, 10, 15, 1, 30, 0).getTime();
    const winNight = computeActiveWindow(lateNight, customProfile);
    expect(winNight).not.toBeNull();
    expect(lateNight).toBeGreaterThanOrEqual(winNight!.windowStartMs);
    expect(lateNight).toBeLessThan(winNight!.windowEndMs);

    // Test during sleep window (04:00)
    const sleepTime = new Date(2026, 10, 15, 4, 0, 0).getTime();
    const winSleep = computeActiveWindow(sleepTime, customProfile);
    expect(sleepTime).toBeLessThan(winSleep!.windowStartMs);
  });

  it('computes next day boundary correctly', () => {
    const at4am = new Date(2026, 10, 14, 4, 0, 0).getTime();
    const next5am = getNextDayBoundaryMs(at4am, 5, 0);
    const d5 = new Date(next5am);
    expect(d5.getHours()).toBe(5);
    expect(d5.getDate()).toBe(14); // Same day 05:00

    const at8am = new Date(2026, 10, 14, 8, 0, 0).getTime();
    const tomorrow5am = getNextDayBoundaryMs(at8am, 5, 0);
    const dTomorrow = new Date(tomorrow5am);
    expect(dTomorrow.getHours()).toBe(5);
    expect(dTomorrow.getDate()).toBe(15); // Next day 05:00
  });

  it('shifts multi-track boundary collisions within 20s window', () => {
    const rng = new Mulberry32(123);
    const track1 = [
      { id: 'b1', type: 'play' as const, startUtc: 1000, endUtc: 5000, durationSec: 4 }
    ];
    // Track 2 starts within 5s of Track 1 endUtc
    const track2 = [
      { id: 'b2', type: 'play' as const, startUtc: 5005, endUtc: 9000, durationSec: 4 }
    ];

    const adjusted = avoidBoundaryCollisions([track1, track2], rng);
    const delta = Math.abs(adjusted[1]![0]!.startUtc - adjusted[0]![0]!.endUtc);

    // Delta should now be >= 20s (20,000ms)
    expect(delta).toBeGreaterThanOrEqual(20_000);
  });

  it('skips sessions cut shorter than 10 minutes by boundary, but allows short quota-end sessions', () => {
    const rng = new Mulberry32(12345);
    // Profile with active window ending in 5 minutes (300s) from now
    const now = new Date(2026, 10, 14, 1, 55, 0).getTime(); // 01:55:00
    const profileEndingSoon = {
      ...profile,
      activeWindow: { start: '09:00', end: '02:00', edgeJitterMin: 0 } // ends at 02:00 (in 5 mins)
    };

    // 1. Open-ended: only 5 mins left before sleep window -> MUST SKIP play and emit rest
    const blocksOpen = planTrackBlocks(rng, {
      profile: profileEndingSoon,
      startTimeUtc: now
    });
    // First block should be REST, not a tiny 5-min PLAY
    expect(blocksOpen[0]!.type).toBe('rest');

    // 2. Quota mode with remaining quota = 300s (5m) -> MUST NOT SKIP, quota completes!
    const blocksQuota = planTrackBlocks(rng, {
      profile,
      quotaSeconds: 300,
      startTimeUtc: new Date(2026, 10, 14, 12, 0, 0).getTime()
    });
    const playQuota = blocksQuota.filter(b => b.type === 'play');
    expect(playQuota.length).toBe(1);
    expect(playQuota[0]!.durationSec).toBe(300);
    expect(playQuota[0]!.cutReason).toBe('quota_end');
  });

  it('rests until next day boundary when remaining daily cap is < 10m (300s), producing exactly one rest and no loop', () => {
    const rng = new Mulberry32(54321);
    // Profile with daily cap 12h (43,200s). Start with 42,900s already credited (remaining cap = 300s).
    const now = new Date(2026, 10, 14, 20, 0, 0).getTime(); // 20:00:00
    const blocks = planTrackBlocks(
      rng,
      {
        profile,
        todayCreditedSeconds: 42900,
        startTimeUtc: now
      },
      8 // 8 hours horizon
    );

    console.log('BLOCKS PRODUCED FOR 300s CAP TEST:', blocks.slice(0, 3));

    // First block MUST be a single rest block for daily_cap
    expect(blocks[0]!.type).toBe('rest');
    expect(blocks[0]!.reason).toBe('daily_cap');

    // It must end at or after next day boundary (05:00 next day)
    const nextDayBoundaryMs = new Date(2026, 10, 15, 5, 0, 0).getTime();
    expect(blocks[0]!.endUtc).toBeGreaterThanOrEqual(nextDayBoundaryMs);

    // Must not be immediately followed by another rest block (consecutive rests are merged)
    if (blocks.length > 1) {
      expect(blocks[1]!.type).not.toBe('rest');
    }
  });

  it('merges consecutive rest blocks into a single continuous rest block', () => {
    const blocks: Block[] = [
      {
        id: 'b1',
        type: 'play',
        startUtc: 1000 * 1000,
        endUtc: 2000 * 1000,
        durationSec: 1000
      },
      {
        id: 'b2',
        type: 'rest',
        reason: 'sample',
        startUtc: 2000 * 1000,
        endUtc: 3000 * 1000,
        durationSec: 1000
      },
      {
        id: 'b3',
        type: 'rest',
        reason: 'daily_cap',
        startUtc: 3000 * 1000,
        endUtc: 5000 * 1000,
        durationSec: 2000
      },
      {
        id: 'b4',
        type: 'play',
        startUtc: 5000 * 1000,
        endUtc: 6000 * 1000,
        durationSec: 1000
      }
    ];

    const merged = mergeConsecutiveRests(blocks);
    expect(merged.length).toBe(3);
    expect(merged[0]!.type).toBe('play');
    expect(merged[1]!.type).toBe('rest');
    expect(merged[1]!.startUtc).toBe(2000 * 1000);
    expect(merged[1]!.endUtc).toBe(5000 * 1000);
    expect(merged[1]!.durationSec).toBe(3000);
    expect(merged[1]!.reason).toBe('daily_cap');
    expect(merged[2]!.type).toBe('play');
  });
});

