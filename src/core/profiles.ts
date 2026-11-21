import { HumanProfile, CustomPattern } from './types';

export const BUILTIN_CUSTOM_PATTERN: CustomPattern = {
  id: 'builtin-example',
  name: 'My original example',
  steps: [
    { type: 'play', minMin: 60, maxMin: 60 },
    { type: 'rest', minMin: 5, maxMin: 5 },
    { type: 'play', minMin: 120, maxMin: 120 },
    { type: 'rest', minMin: 60, maxMin: 60 }
  ]
};

export const BUILTIN_PROFILES: Record<string, HumanProfile> = {
  casual: {
    id: 'casual',
    name: 'Casual',
    session: { minMin: 45, maxMin: 120 },
    rest: {
      minMin: 5,
      maxMin: 30,
      longChance: 0.15,
      longMinMin: 35,
      longMaxMin: 60
    },
    restScalesWithSession: true,
    bootJitterSec: { min: 45, max: 420 },
    activeWindow: { start: '10:00', end: '01:00', edgeJitterMin: 15 },
    dailyCapHours: 8,
    weekendSessionBoost: 1.0
  },
  regular: {
    id: 'regular',
    name: 'Regular (Default)',
    session: { minMin: 60, maxMin: 180 },
    rest: {
      minMin: 5,
      maxMin: 45,
      longChance: 0.2,
      longMinMin: 45,
      longMaxMin: 60
    },
    restScalesWithSession: true,
    bootJitterSec: { min: 45, max: 420 },
    activeWindow: { start: '09:00', end: '02:00', edgeJitterMin: 15 },
    dailyCapHours: 12,
    weekendSessionBoost: 1.0
  },
  grinder: {
    id: 'grinder',
    name: 'Grinder',
    session: { minMin: 90, maxMin: 240 },
    rest: {
      minMin: 3,
      maxMin: 20,
      longChance: 0.1,
      longMinMin: 30,
      longMaxMin: 60
    },
    restScalesWithSession: true,
    bootJitterSec: { min: 30, max: 180 },
    activeWindow: { start: '09:00', end: '04:00', edgeJitterMin: 15 },
    dailyCapHours: 16,
    weekendSessionBoost: 1.0
  },
  'weekend-warrior': {
    id: 'weekend-warrior',
    name: 'Weekend Warrior',
    session: { minMin: 30, maxMin: 90 },
    rest: {
      minMin: 10,
      maxMin: 45,
      longChance: 0.25,
      longMinMin: 45,
      longMaxMin: 60
    },
    restScalesWithSession: true,
    bootJitterSec: { min: 45, max: 300 },
    activeWindow: { start: '12:00', end: '02:00', edgeJitterMin: 15 },
    dailyCapHours: 10,
    weekendSessionBoost: 1.8
  },
  'fast-test': {
    id: 'fast-test',
    name: 'Fast Test (Automated / Simulator)',
    session: { minMin: 2, maxMin: 4 },
    rest: {
      minMin: 1,
      maxMin: 2,
      longChance: 0,
      longMinMin: 0,
      longMaxMin: 0
    },
    restScalesWithSession: false,
    bootJitterSec: { min: 5, max: 15 },
    weekendSessionBoost: 1.0
  }
};

export const DEFAULT_PROFILE = BUILTIN_PROFILES['regular']!;

