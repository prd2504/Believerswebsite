/**
 * @bba/shared — entry point.
 *
 * This package contains ONLY types and pure utilities. It must not import any runtime SDK
 * (Firebase, React, etc.) so it can be consumed by both the browser bundle (@bba/webapp)
 * and the Node backend (@bba/functions) with zero side effects.
 */

export * from './types/index.js';
export * from './constants/index.js';
export * from './utils/index.js';
