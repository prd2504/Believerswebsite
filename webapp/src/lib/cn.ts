/**
 * `cn` — the single class-name composition helper used throughout the app.
 * Combines clsx (conditional classes) with tailwind-merge (dedupe conflicting Tailwind
 * utilities so later classes actually win).
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
