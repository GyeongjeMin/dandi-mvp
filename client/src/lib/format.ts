export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  if (!withTime) return date;
  return `${date} ${d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}`;
}

export function todayLabel(): string {
  return new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}

export function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 11) return '좋은 아침이에요';
  if (h < 17) return '좋은 오후예요';
  return '편안한 저녁이에요';
}

// 받침에 따라 조사 고르기
function hasBatchim(w: string): boolean {
  const c = w.trim().charCodeAt(w.trim().length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}
export const eul = (w: string) => w + (hasBatchim(w) ? '을' : '를');
export const wa = (w: string) => w + (hasBatchim(w) ? '과' : '와');
