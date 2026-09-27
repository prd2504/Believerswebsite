import { Navigate, useParams } from 'react-router-dom';

/**
 * /book/<slug> used to serve a standalone slot-booking portal that wrote a
 * slotBooking document and nothing else — no payment record, no invoice
 * number, no receipt email — leaving those bookings invisible to the payment
 * ledger and to the CA's invoice sequence. /fees does the whole job, so the
 * old links now land there instead of running a second, parallel flow.
 *
 * Kept as a redirect rather than deleted: the /book/ruia link is already out
 * in WhatsApp groups and printed material, and it must keep working.
 */
const SLUG_TO_CENTRE_CODE: Record<string, string> = {
  ruia: 'RUI',
};

export default function BookingRedirect() {
  const { centreSlug } = useParams<{ centreSlug: string }>();
  const centreCode = centreSlug ? SLUG_TO_CENTRE_CODE[centreSlug.toLowerCase()] : undefined;
  // Pre-select the centre so an existing link still feels like a direct route
  // to that centre's form, not a generic landing page.
  return <Navigate to={centreCode ? `/fees?centre=${centreCode}` : '/fees'} replace />;
}
