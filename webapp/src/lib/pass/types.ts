/**
 * The pass payload as getPass returns it.
 *
 * Lives here rather than inside the page so the canvas renderer and the page
 * are typed against the same shape — the two draw the same card twice, and a
 * field renamed in one and not the other would show up as a blank line on a
 * printed pass rather than as a build error.
 */
export interface PassPayload {
  kind: 'STANDING' | 'DAY';
  state: 'VALID' | 'EXPIRED' | 'PENDING' | 'REJECTED' | 'UNKNOWN';
  personName: string;
  centreName: string;
  centreCode: string;
  validLabel: string;
  validUntilLabel: string;
  coversMonths: string[];
  colourMonth: string;
  code: string;
  reasonLabel: string | null;
  message: string | null;
}
