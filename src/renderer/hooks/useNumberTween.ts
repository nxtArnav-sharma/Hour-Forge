import { useState, useEffect, useRef } from 'react';

/**
 * Smoothly tweens a number from its previous value to target value.
 * Runs only when window is visible and respects prefers-reduced-motion.
 */
export function useNumberTween(targetValue: number, durationMs: number = 400): number {
  const [current, setCurrent] = useState(targetValue);
  const startRef = useRef(targetValue);
  const targetRef = useRef(targetValue);
  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // If reduced motion is requested or window is hidden, snap immediately
    const prefersReducedMotion = typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || document.hidden || Math.abs(current - targetValue) < 0.01) {
      setCurrent(targetValue);
      startRef.current = targetValue;
      targetRef.current = targetValue;
      return;
    }

    startRef.current = current;
    targetRef.current = targetValue;
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - (startTimeRef.current || now);
      const progress = Math.min(1, elapsed / durationMs);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = startRef.current + (targetRef.current - startRef.current) * eased;

      setCurrent(nextVal);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setCurrent(targetRef.current);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [targetValue, durationMs]);

  return current;
}

