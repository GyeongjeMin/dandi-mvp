/**
 * 어르신별 대화 방식과 가족 공유 범위.
 * 기기(브라우저·태블릿·향후 전용 기기)가 아니라 '계정'에 저장되므로 어디서 접속해도 같은 방식으로 대화합니다.
 */
import type { DB } from '../db/database.js';
import { nowIso, parseJson } from '../db/database.js';

export interface Prefs {
  replyLength: 'short' | 'normal';   // 단디 말 길이
  speechRate: number;                // 단디 목소리 빠르기 (0.7~1.1, 브라우저 음성합성에 사용)
  avoidTopics: string[];             // 먼저 꺼내지 않았으면 하는 이야기
  shareActivity: boolean;            // 가족에게 이용 현황(대화 날짜·횟수·시간) 공유
  shareTopics: boolean;              // 가족에게 대화 주제(관심사 이름만, 대화 내용 X) 공유
  reduceMotion: boolean;             // 캐릭터 움직임 줄이기
}

export const DEFAULT_PREFS: Prefs = {
  replyLength: 'short',
  speechRate: 0.9,
  avoidTopics: [],
  // 공유는 어르신이 가족 연결 화면에서 직접 켜기 전까지 꺼져 있습니다.
  shareActivity: false,
  shareTopics: false,
  reduceMotion: false,
};

export function getPrefs(db: DB, userId: number): Prefs {
  const r = db.prepare('SELECT data FROM user_prefs WHERE user_id = ?').get(userId) as { data: string } | undefined;
  return { ...DEFAULT_PREFS, ...parseJson<Partial<Prefs>>(r?.data, {}) };
}

export function validatePrefsPatch(b: Record<string, unknown>): Partial<Prefs> {
  const out: Partial<Prefs> = {};
  const bad = (m: string) => Object.assign(new Error(m), { status: 400 });
  if (b.replyLength !== undefined) {
    if (b.replyLength !== 'short' && b.replyLength !== 'normal') throw bad('말 길이 값이 올바르지 않아요.');
    out.replyLength = b.replyLength;
  }
  if (b.speechRate !== undefined) {
    const n = Number(b.speechRate);
    if (!Number.isFinite(n) || n < 0.6 || n > 1.2) throw bad('말 빠르기 값이 올바르지 않아요.');
    out.speechRate = Math.round(n * 100) / 100;
  }
  if (b.avoidTopics !== undefined) {
    if (!Array.isArray(b.avoidTopics) || b.avoidTopics.some((t) => typeof t !== 'string')) throw bad('피하고 싶은 이야기 형식이 올바르지 않아요.');
    out.avoidTopics = (b.avoidTopics as string[]).map((t) => t.trim().slice(0, 15)).filter(Boolean).slice(0, 10);
  }
  if (b.shareActivity !== undefined) out.shareActivity = b.shareActivity === true;
  if (b.shareTopics !== undefined) out.shareTopics = b.shareTopics === true;
  if (b.reduceMotion !== undefined) out.reduceMotion = b.reduceMotion === true;
  return out;
}

export function setPrefs(db: DB, userId: number, patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(db, userId), ...patch };
  db.prepare(`INSERT INTO user_prefs (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).run(userId, JSON.stringify(next), nowIso());
  return next;
}
