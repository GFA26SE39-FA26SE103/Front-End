import { ApiError } from '../../api/client';

// Store dates are local calendar days ("yyyy-MM-dd"); the API returns instants in UTC.

export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/** Monday of the week that contains [date]; weeks run Monday–Sunday like the 48-hour rule. */
export function weekStart(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return isoDate(monday);
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' });
const longDayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const dayLabel = (value: string) => dayFmt.format(parseDate(value));
export const longDayLabel = (value: string) => longDayFmt.format(parseDate(value));
export const time = (instant: string) => timeFmt.format(new Date(instant));
export const dateTime = (instant: string) => `${longDayFmt.format(new Date(instant))} · ${time(instant)}`;
export const range = (start: string, end: string) => `${time(start)}–${time(end)}`;

/** "06:00:00" → "06:00". */
export const clock = (value: string) => value.slice(0, 5);

/** A failed call phrased for the Manager; ApiError messages come from the backend's ProblemDetails. */
export function problem(reason: unknown): string {
  if (reason instanceof ApiError) {
    if (reason.status === 403) return 'Only a Manager can change the schedule.';
    if (reason.code === 'SWAP_SCHEMA_NOT_READY') return 'The database is missing the shift tables (ERD V6). Ask the team to apply the latest database script.';
    return reason.message;
  }
  return 'Could not reach the server. Check your connection and try again.';
}
