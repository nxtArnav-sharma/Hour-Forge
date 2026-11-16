/**
 * Clock abstraction for deterministic time testing and accelerated simulations.
 */

export interface Clock {
  now(): number; // epoch ms (UTC)
  sleep(ms: number): Promise<void>;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class VirtualClock implements Clock {
  private currentMs: number;

  constructor(startMs = Date.now()) {
    this.currentMs = startMs;
  }

  now(): number {
    return this.currentMs;
  }

  advance(ms: number): void {
    if (ms < 0) throw new Error('Cannot move virtual clock backwards');
    this.currentMs += ms;
  }

  sleep(ms: number): Promise<void> {
    this.advance(ms);
    return Promise.resolve();
  }
}

