/**
 * 교류 연결: 제안 → (상대방) 수락/거절 → 양측 동의 시 연결 완료
 * MVP 에서는 상대방이 시연용 가상 이용자이므로 is_demo=1 로 표시하고,
 * 상대방의 응답은 '시연용 컨트롤'로 사람이 직접 눌러야만 바뀝니다(자동 수락 없음).
 * 연락처는 어느 단계에서도 공개하지 않습니다.
 */
import type { DB } from '../db/database.js';
import { nowIso } from '../db/database.js';
import { getUser, publicRegion } from './users.js';

export type ConnStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

interface ConnRow {
  id: number; from_user_id: number; to_user_id: number; status: ConnStatus; message: string; is_demo: number; created_at: string; responded_at: string | null;
}

function toDTO(db: DB, r: ConnRow) {
  const other = getUser(db, r.to_user_id);
  return {
    id: r.id,
    status: r.status,
    message: r.message,
    isDemo: !!r.is_demo,
    createdAt: r.created_at,
    respondedAt: r.responded_at,
    target: other ? { id: other.id, nickname: other.nickname, ageBand: other.age_band, region: publicRegion(other) } : null,
  };
}

export function listConnections(db: DB, userId: number) {
  const rows = db.prepare('SELECT * FROM connection_requests WHERE from_user_id = ? ORDER BY created_at DESC, id DESC').all(userId) as unknown as ConnRow[];
  return rows.map((r) => toDTO(db, r));
}

export function createConnection(db: DB, fromId: number, toId: number, message: string) {
  const target = getUser(db, toId);
  if (!target || target.id === fromId) throw Object.assign(new Error('교류를 제안할 수 없는 이용자예요.'), { status: 404 });
  if (target.kind !== 'demo_persona') throw Object.assign(new Error('MVP 에서는 시연용 이용자에게만 제안할 수 있어요.'), { status: 400 });
  const open = db.prepare(`SELECT * FROM connection_requests WHERE from_user_id = ? AND to_user_id = ? AND status IN ('pending','accepted')`).get(fromId, toId) as ConnRow | undefined;
  if (open) throw Object.assign(new Error(open.status === 'accepted' ? '이미 연결된 분이에요.' : '이미 제안을 보내고 답을 기다리는 중이에요.'), { status: 409 });
  const r = db.prepare(`INSERT INTO connection_requests (from_user_id, to_user_id, status, message, is_demo, created_at) VALUES (?, ?, 'pending', ?, 1, ?)`)
    .run(fromId, toId, message.slice(0, 200), nowIso());
  return getConnection(db, fromId, Number(r.lastInsertRowid))!;
}

export function getConnection(db: DB, userId: number, id: number) {
  const r = db.prepare('SELECT * FROM connection_requests WHERE id = ? AND from_user_id = ?').get(id, userId) as ConnRow | undefined;
  return r ? toDTO(db, r) : undefined;
}

/** 시연용: 상대방(가상 이용자) 역할로 수락/거절. pending 상태의 시연 요청만 가능합니다. */
export function demoRespond(db: DB, userId: number, id: number, decision: 'accepted' | 'declined') {
  const cur = getConnection(db, userId, id);
  if (!cur) throw Object.assign(new Error('요청을 찾을 수 없어요.'), { status: 404 });
  if (!cur.isDemo) throw Object.assign(new Error('시연용 요청이 아니에요.'), { status: 400 });
  if (cur.status !== 'pending') throw Object.assign(new Error('이미 답이 정해진 요청이에요.'), { status: 409 });
  db.prepare('UPDATE connection_requests SET status = ?, responded_at = ? WHERE id = ?').run(decision, nowIso(), id);
  return getConnection(db, userId, id)!;
}

export function cancelConnection(db: DB, userId: number, id: number) {
  const cur = getConnection(db, userId, id);
  if (!cur) throw Object.assign(new Error('요청을 찾을 수 없어요.'), { status: 404 });
  if (cur.status !== 'pending') throw Object.assign(new Error('기다리는 중인 요청만 취소할 수 있어요.'), { status: 409 });
  db.prepare(`UPDATE connection_requests SET status = 'cancelled', responded_at = ? WHERE id = ?`).run(nowIso(), id);
  return getConnection(db, userId, id)!;
}
