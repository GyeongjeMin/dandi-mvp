/** 한국 시간(KST) 기준 날짜·시각 도우미 — 서버가 어느 시간대에서 돌아도 같은 결과 */

/** 'YYYY-MM-DD' (KST) */
export const kstDate = (d: Date = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

/** 자정부터 지난 분 (KST) */
export function kstMinutes(d: Date = new Date()): number {
  const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
  return (h % 24) * 60 + m;
}

/** 두 KST 날짜 사이의 일수 (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 0 → '오늘', 1 → '어제', 2 → '그저께', 그 이상 → '지난번에' */
export function whenWord(daysAgo: number): string {
  if (daysAgo <= 0) return '아까';
  if (daysAgo === 1) return '어제';
  if (daysAgo === 2) return '그저께';
  return '지난번에';
}

/** 'HH:MM' → '오후 2시', '오전 8시 30분' */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}시${m ? ` ${m}분` : ''}`;
}
