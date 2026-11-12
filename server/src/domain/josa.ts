// 한국어 조사 자동 선택 (받침 유무에 따라 을/를, 이/가, 은/는, 와/과, 으로/로)

function lastHangul(word: string): number | null {
  const trimmed = word.trim();
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const code = trimmed.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) return code;
    if (/[0-9A-Za-z]/.test(trimmed[i])) return null;
  }
  return null;
}

function batchim(word: string): number {
  const c = lastHangul(word);
  return c === null ? 0 : (c - 0xac00) % 28;
}

const pick = (word: string, withB: string, withoutB: string) => word + (batchim(word) ? withB : withoutB);

export const eul = (w: string) => pick(w, '을', '를');
export const iga = (w: string) => pick(w, '이', '가');
export const eun = (w: string) => pick(w, '은', '는');
export const wa = (w: string) => pick(w, '과', '와');
export const euro = (w: string) => {
  const b = batchim(w);
  return w + (b && b !== 8 ? '으로' : '로'); // ㄹ 받침(8)은 '로'
};

/** ["요리","텃밭 가꾸기","등산"] → "요리, 텃밭 가꾸기와 등산" */
export function joinKo(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const head = items.slice(0, -1);
  const last = items[items.length - 1];
  return `${head.slice(0, -1).map((s) => s + ', ').join('')}${wa(head[head.length - 1])} ${last}`;
}
