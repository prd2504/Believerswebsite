/**
 * Scannable UPI QR, generated client-side from the same upi:// string as any
 * "open UPI app" link on the page, so the two can never drift apart.
 *
 * Exists because the deep link alone isn't reliable: some UPI apps (notably
 * certain Android/PhonePe/GPay combinations) reject it with "receiver's VPA
 * not available" even for a valid ID. Scanning a QR for the same payee
 * doesn't hit that. It's also the only way to pay from a desktop.
 *
 * No network call and no third-party image host — the code is rendered
 * locally, so a payee string never leaves the device to a stranger's server.
 */

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import { cn } from '@/lib/cn';

export function UpiQrCode({
  upiUrl,
  size = 180,
  className,
}: {
  upiUrl: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    QRCode.toDataURL(upiUrl, {
      width: size + 40,
      margin: 1,
      color: { dark: '#0D1B2A', light: '#FFFFFF' },
    })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [upiUrl, size]);

  // Fail quietly — the manual UPI ID and any deep link still work, so a QR
  // that won't render must not take the whole payment step down with it.
  if (failed) return null;

  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-xl border bg-white p-4', className)}>
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="Scan to pay via UPI"
          width={size}
          height={size}
          style={{ width: size, height: size }}
        />
      ) : (
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      )}
      <p className="text-center text-xs font-medium text-gray-600">Scan &amp; Pay</p>
    </div>
  );
}
