const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  const h = ONES[Math.floor(n / 100)];
  const rest = twoDigits(n % 100);
  return rest ? `${h} Hundred ${rest}` : `${h} Hundred`;
}

export function numberToWordsIndian(n: number): string {
  if (n === 0) return 'Zero';
  if (n < 0) return `Minus ${numberToWordsIndian(-n)}`;

  n = Math.round(n);
  const parts: string[] = [];

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const remainder = n;

  if (crore > 0) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (remainder > 0) parts.push(threeDigits(remainder));

  return parts.join(' ');
}

export function paiseToWordsINR(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  return `Indian Rupees ${numberToWordsIndian(rupees)} Only`;
}
