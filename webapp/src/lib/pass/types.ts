/**
 * The pass payload as getPass returns it.
 *
 * Aliased to the shared PassView rather than restated here. It WAS restated,
 * and adding the UPCOMING state to the shared union left this copy behind —
 * so the renderer and the page both compared against a state the local type
 * said could not exist. TypeScript caught it, but only because the comparison
 * happened to be written; a field renamed on one side and not the other would
 * have shown up as a blank line on a printed pass instead.
 *
 * One definition, imported in both places.
 */
export type { PassView as PassPayload } from '@bba/shared';
