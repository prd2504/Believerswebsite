/**
 * Common primitive types reused throughout the data model.
 *
 * Timestamps are stored in Firestore as server timestamps but serialised in-app as ISO-8601
 * strings (UTC). Consumers should convert to IST (Asia/Kolkata) for display via
 * `utils/date.ts` — never render a raw ISO string to end users.
 */

/** ISO-8601 UTC timestamp — the canonical serialised time across the app. */
export type IsoTimestamp = string;

/** A date without time (YYYY-MM-DD), interpreted in IST unless stated otherwise. */
export type IsoDate = string;

/** A month identifier in YYYY-MM format — used as the partition key for monthly fees. */
export type YearMonth = string;

/** Canonical currency used across the platform. India-first: INR only. */
export type CurrencyCode = 'INR';

/**
 * Base fields present on every persisted document. Consumer code should spread this into
 * every domain type to guarantee consistent audit columns.
 */
export interface BaseDocument {
  /** Firestore document id. Duplicated into the document body for convenience. */
  id: string;
  /** UTC ISO-8601 timestamp when the doc was first written. */
  createdAt: IsoTimestamp;
  /** UTC ISO-8601 timestamp of the last update. */
  updatedAt: IsoTimestamp;
  /** User id of whoever created the doc. Null for system-authored writes. */
  createdBy: string | null;
  /** User id of whoever last updated the doc. Null for system-authored writes. */
  updatedBy: string | null;
}

/** Generic result wrapper for service functions that can fail predictably. */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };
