export const INCLUDE_CHEEKY_LINES = true;

export const NEUTRAL_LINES: string[] = [
  "Hours don't forge themselves",
  'Consulting the digital clock',
  'Humanizing the grind rhythm',
  'Carefully calculating rest intervals',
  'Accruing respectable statistics',
  'Simulating human dedication',
  'Clocking in for the backlog',
  'Maintaining peak playtime efficiency',
  'Crafting high-art playtime metrics',
  'Steam numbers going up',
  'Pacing towards the finish line',
  'Precision idle scheduling',
  'Stretching between sessions',
  'Tuning the human profile'
];

export const CHEEKY_LINES: string[] = [
  'Definitely not an automated bot',
  'Engaged in deeply immersive gameplay',
  'My keyboard is definitely making clicks',
  'Professional AFK athlete',
  'Forging hours like a medieval blacksmith',
  'Living rent-free in Steam servers',
  "Don't look at my playtime stats",
  'Doing very important video game research',
  'My backlog fears me',
  'Touching grass scheduled for tomorrow',
  'Peak gamer multitasking',
  'Hydrating between virtual rounds',
  'Totally glued to the screen right now',
  'Level 99 time manager'
];

export function getPresenceLines(includeCheeky: boolean = INCLUDE_CHEEKY_LINES): string[] {
  if (includeCheeky) {
    return [...NEUTRAL_LINES, ...CHEEKY_LINES];
  }
  return [...NEUTRAL_LINES];
}

export interface Clock {
  now(): number;
}

export interface ShuffleBagOptions {
  items?: string[];
  rng?: () => number;
  clock?: Clock;
  minIntervalMs?: number; // default 20 min
  maxIntervalMs?: number; // default 40 min
}

export class PresenceLineRotator {
  private masterItems: string[];
  private currentBag: string[] = [];
  private rng: () => number;
  private clock: Clock;
  private minIntervalMs: number;
  private maxIntervalMs: number;

  private currentLine: string = '';
  private nextRotationTime: number = 0;
  private lastDrawnItem: string | null = null;

  constructor(options?: ShuffleBagOptions) {
    this.masterItems = options?.items && options.items.length > 0
      ? [...options.items]
      : getPresenceLines();
    this.rng = options?.rng || Math.random;
    this.clock = options?.clock || { now: () => Date.now() };
    this.minIntervalMs = options?.minIntervalMs ?? 20 * 60 * 1000; // 20 minutes
    this.maxIntervalMs = options?.maxIntervalMs ?? 40 * 60 * 1000; // 40 minutes

    this.refillBag();
    this.rotateLine();
  }

  /**
   * Refills the bag using Fisher-Yates shuffle.
   * Guarantees no repeat across bag boundaries when bag is refilled.
   */
  private refillBag(): void {
    const pool = [...this.masterItems];
    // Fisher-Yates shuffle with injected RNG
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const temp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = temp;
    }

    // Boundary check: if first item of new bag matches the last drawn item of previous bag, swap it
    if (pool.length > 1 && pool[0] === this.lastDrawnItem) {
      // Swap with the second item (or random non-zero index)
      const swapIdx = pool.length > 2 ? 1 + Math.floor(this.rng() * (pool.length - 1)) : 1;
      const tmp = pool[0]!;
      pool[0] = pool[swapIdx]!;
      pool[swapIdx] = tmp;
    }

    this.currentBag = pool;
  }

  /**
   * Draws the next line from the bag and schedules the next rotation.
   */
  rotateLine(): string {
    if (this.currentBag.length === 0) {
      this.refillBag();
    }

    const drawn = this.currentBag.shift()!;
    this.lastDrawnItem = drawn;
    this.currentLine = drawn;

    const intervalRange = this.maxIntervalMs - this.minIntervalMs;
    const interval = this.minIntervalMs + Math.floor(this.rng() * (intervalRange + 1));
    this.nextRotationTime = this.clock.now() + interval;

    return drawn;
  }

  /**
   * Returns the current line, checking if a rotation is due based on elapsed time.
   */
  getLine(): string {
    const now = this.clock.now();
    if (now >= this.nextRotationTime) {
      this.rotateLine();
    }
    return this.currentLine;
  }

  /**
   * Force set a specific line (e.g. for testing)
   */
  setLine(line: string): void {
    this.currentLine = line;
  }

  getNextRotationTime(): number {
    return this.nextRotationTime;
  }

  getCurrentBagSize(): number {
    return this.currentBag.length;
  }

  getLastDrawnItem(): string | null {
    return this.lastDrawnItem;
  }
}
