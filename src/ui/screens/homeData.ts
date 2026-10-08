import { strings } from '../i18n/es';

/** How many of the latest additions the home view lists. */
export const RECENT_COUNT = 6;

/** Time-of-day greeting. */
export function greetingFor(hour: number): string {
  if (hour >= 6 && hour < 13) return strings.home.greetingMorning;
  if (hour >= 13 && hour < 20) return strings.home.greetingAfternoon;
  return strings.home.greetingEvening;
}
