/**
 * 가족·보호자 연계
 * - 연결: 어르신이 만든 6자리 초대 코드(24시간 유효) → 가족이 이름·관계를 적고 연결 → 가족 전용 접속 토큰 발급
 *   (토큰 원문은 가족 브라우저에만 있고, 서버에는 해시만 저장)
 * - 가족이 볼 수 있는 것: 어르신이 켠 공유 범위(이용 현황·대화 주제), 어르신이 '가족과 공유'를 켠 추억, 가족이 보낸 소식, 알림
 * - 가족이 볼 수 없는 것: 대화 원문, 공유하지 않은 추억, 다른 사람의 정보
 */
import crypto from 'node:crypto';
import type { DB } from '../db/database.js';
import { nowIso } from '../db/database.js';
import { getUser } from './users.js';
import { getMemory, listMemories, type Memory } from './memories.js';
import { getPrefs } from './prefs.js';
import { listReminders } from './reminders.js';
import { detectTags } from './tags.js';
import { kstDate } from './time.js';

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

// ── 초대 코드 ─────────────────────────────────

export function createInvite(db: DB, userId: number): { code: string; expiresAt: string } {
  db.prepare('DELETE FROM family_invites WHERE user_id = ?').run(userId);
  let code = '';
  for (let i = 0; i < 20; i++) {
    code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const taken = db.prepare('SELECT 1 FROM family_invites WHERE code = ? AND expires_at > ?').get(code, nowIso());
    if (!taken) break;
  }
  const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
  db.prepare('INSERT INTO family_invites (user_id, code, expires_at, created_at) VALUES (?, ?, ?, ?)').run(userId, code, expiresAt, nowIso());
  return { code, expiresAt };
}

export function activeInvite(db: DB, userId: number): { code: string; expiresAt: string } | null {
  const r = db.prepare('SELECT code, expires_at FROM family_invites WHERE user_id = ? AND expires_at > ? ORDER BY id DESC LIMIT 1').get(userId, nowIso()) as { code: string; expires_at: string } | undefined;
  return r ? { code: r.code, expiresAt: r.expires_at } : null;
}

export function cancelInvite(db: DB, userId: number): void {
  db.prepare('DELETE FROM family_invites WHERE user_id = ?').run(userId);
}

// ── 가족 구성원 ───────────────────────────────

export interface FamilyMemberRow {
  id: number; user_id: number; name: string; relation: string; token_hash: string; created_at: string; last_seen_at: string | null;
}

export const memberLabel = (m: Pick<FamilyMemberRow, 'name' | 'relation'>) => `${m.relation} ${m.name}`;

export function connectFamily(db: DB, code: string, name: string, relation: string) {
  const inv = db.prepare('SELECT user_id FROM family_invites WHERE code = ? AND expires_at > ?').get(code, nowIso()) as { user_id: number } | undefined;
  if (!inv) throw httpError(404, '초대 코드가 맞지 않거나 시간이 지났어요. 어르신 화면에서 새 코드를 받아 주세요.');
  const elder = getUser(db, inv.user_id);
  if (!elder || elder.kind !== 'member') throw httpError(404, '연결할 어르신 정보를 찾을 수 없어요.');
  const count = (db.prepare('SELECT COUNT(*) AS n FROM family_members WHERE user_id = ?').get(inv.user_id) as { n: number }).n;
  if (count >= 10) throw httpError(400, '가족은 10명까지 연결할 수 있어요.');
  const token = crypto.randomBytes(24).toString('base64url');
  const r = db.prepare('INSERT INTO family_members (user_id, name, relation, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(inv.user_id, name, relation, hash(token), nowIso());
  return { token, memberId: Number(r.lastInsertRowid), elderNickname: elder.nickname };
}

export function memberByToken(db: DB, token: string): FamilyMemberRow | undefined {
  if (!token || token.length > 100) return undefined;
  const m = db.prepare('SELECT * FROM family_members WHERE token_hash = ?').get(hash(token)) as FamilyMemberRow | undefined;
  if (m) db.prepare('UPDATE family_members SET last_seen_at = ? WHERE id = ?').run(nowIso(), m.id);
  return m;
}

export function listMembers(db: DB, userId: number) {
  return (db.prepare('SELECT * FROM family_members WHERE user_id = ? ORDER BY id').all(userId) as unknown as FamilyMemberRow[])
    .map((m) => ({ id: m.id, name: m.name, relation: m.relation, label: memberLabel(m), createdAt: m.created_at, lastSeenAt: m.last_seen_at }));
}

export function removeMember(db: DB, userId: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM family_members WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;
}

// ── 가족 소식 (사진·메시지) ─────────────────────

interface PostRow {
  id: number; user_id: number; family_member_id: number | null; sender_label: string; message: string; photo_file: string | null;
  created_at: string; offered_at: string | null; seen_at: string | null; talked_at: string | null;
}

export interface FamilyPost {
  id: number;
  from: string;
  message: string;
  photoUrl: string | null;
  createdAt: string;
  offeredAt: string | null;
  seenAt: string | null;
  talkedAt: string | null;
  mine?: boolean;
}

export const photoUrl = (file: string | null) => (file ? `/api/media/${file}` : null);

function toPost(r: PostRow, memberId?: number): FamilyPost {
  return {
    id: r.id, from: r.sender_label, message: r.message, photoUrl: photoUrl(r.photo_file), createdAt: r.created_at,
    offeredAt: r.offered_at, seenAt: r.seen_at, talkedAt: r.talked_at,
    ...(memberId !== undefined ? { mine: r.family_member_id === memberId } : {}),
  };
}

export function createPost(db: DB, member: FamilyMemberRow, input: { message: string; photoFile: string | null }): FamilyPost {
  const r = db.prepare(`INSERT INTO family_posts (user_id, family_member_id, sender_label, message, photo_file, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(member.user_id, member.id, memberLabel(member), input.message, input.photoFile, nowIso());
  return getPost(db, member.user_id, Number(r.lastInsertRowid), member.id)!;
}

export function getPost(db: DB, userId: number, id: number, memberId?: number): FamilyPost | undefined {
  const r = db.prepare('SELECT * FROM family_posts WHERE id = ? AND user_id = ?').get(id, userId) as PostRow | undefined;
  return r ? toPost(r, memberId) : undefined;
}

export function listPosts(db: DB, userId: number, memberId?: number, limit = 50): FamilyPost[] {
  return (db.prepare('SELECT * FROM family_posts WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(userId, limit) as unknown as PostRow[])
    .map((r) => toPost(r, memberId));
}

/** 가족이 자기가 보낸 소식을 지웁니다. 지운 사진 파일 이름을 돌려줘 실제 파일도 지우게 합니다. */
export function deletePost(db: DB, member: FamilyMemberRow, id: number): { photoFile: string | null } | null {
  const r = db.prepare('SELECT * FROM family_posts WHERE id = ? AND user_id = ? AND family_member_id = ?').get(id, member.user_id, member.id) as PostRow | undefined;
  if (!r) return null;
  db.prepare('DELETE FROM family_posts WHERE id = ?').run(id);
  return { photoFile: r.photo_file };
}

export function markPost(db: DB, userId: number, id: number, field: 'offered_at' | 'seen_at' | 'talked_at'): void {
  db.prepare(`UPDATE family_posts SET ${field} = COALESCE(${field}, ?) WHERE id = ? AND user_id = ?`).run(nowIso(), id, userId);
  if (field === 'talked_at') db.prepare('UPDATE family_posts SET seen_at = COALESCE(seen_at, ?) WHERE id = ? AND user_id = ?').run(nowIso(), id, userId);
}

/** 단디가 먼저 소개할 소식: 아직 보지 않았고, 오늘(20시간 안에) 소개한 적 없는 가장 오래된 소식 */
export function postToOffer(db: DB, userId: number): FamilyPost | undefined {
  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  const r = db.prepare(`SELECT * FROM family_posts WHERE user_id = ? AND seen_at IS NULL AND (offered_at IS NULL OR offered_at < ?)
    ORDER BY created_at ASC LIMIT 1`).get(userId, since) as PostRow | undefined;
  if (!r) return undefined;
  // 매일 다시 소개하되, 같은 소식을 계속 소개하지 않도록 offered_at 은 매번 갱신
  return toPost(r);
}

export function touchOffered(db: DB, userId: number, id: number): void {
  db.prepare('UPDATE family_posts SET offered_at = ? WHERE id = ? AND user_id = ?').run(nowIso(), id, userId);
}

export function unseenPostCount(db: DB, userId: number): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM family_posts WHERE user_id = ? AND seen_at IS NULL').get(userId) as { n: number }).n;
}

export function allPhotoFiles(db: DB, userId: number): string[] {
  return (db.prepare('SELECT photo_file FROM family_posts WHERE user_id = ? AND photo_file IS NOT NULL').all(userId) as Array<{ photo_file: string }>).map((r) => r.photo_file);
}

// ── 공유된 추억과 가족 댓글·질문 ────────────────

interface CommentRow {
  id: number; memory_id: number; user_id: number; family_member_id: number | null; sender_label: string;
  kind: 'comment' | 'question'; content: string; created_at: string; used_at: string | null;
}
export interface MemoryComment {
  id: number; memoryId: number; from: string; kind: 'comment' | 'question'; content: string; createdAt: string; usedAt: string | null; mine?: boolean;
}
const toComment = (r: CommentRow, memberId?: number): MemoryComment => ({
  id: r.id, memoryId: r.memory_id, from: r.sender_label, kind: r.kind, content: r.content, createdAt: r.created_at, usedAt: r.used_at,
  ...(memberId !== undefined ? { mine: r.family_member_id === memberId } : {}),
});

export function commentsFor(db: DB, userId: number, memoryIds: number[], memberId?: number): Record<number, MemoryComment[]> {
  const out: Record<number, MemoryComment[]> = {};
  if (!memoryIds.length) return out;
  const rows = db.prepare(`SELECT * FROM memory_comments WHERE user_id = ? AND memory_id IN (${memoryIds.map(() => '?').join(',')}) ORDER BY id`)
    .all(userId, ...memoryIds) as unknown as CommentRow[];
  for (const r of rows) (out[r.memory_id] ??= []).push(toComment(r, memberId));
  return out;
}

export function sharedMemories(db: DB, userId: number): Memory[] {
  return listMemories(db, userId, 'confirmed').filter((m) => m.shareFamily);
}

export function addComment(db: DB, member: FamilyMemberRow, memoryId: number, kind: 'comment' | 'question', content: string): MemoryComment {
  const m = getMemory(db, member.user_id, memoryId);
  // 공유되지 않은 추억은 가족에게 '없는 것'으로 보입니다.
  if (!m || m.status !== 'confirmed' || !m.shareFamily) throw httpError(404, '추억을 찾을 수 없어요.');
  const r = db.prepare(`INSERT INTO memory_comments (memory_id, user_id, family_member_id, sender_label, kind, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(memoryId, member.user_id, member.id, memberLabel(member), kind, content, nowIso());
  return toComment(db.prepare('SELECT * FROM memory_comments WHERE id = ?').get(Number(r.lastInsertRowid)) as unknown as CommentRow, member.id);
}

export function deleteComment(db: DB, member: FamilyMemberRow, id: number): boolean {
  return Number(db.prepare('DELETE FROM memory_comments WHERE id = ? AND family_member_id = ?').run(id, member.id).changes) > 0;
}

/** 다음 회상 대화에서 여쭤볼 가족 질문 (공유 중인 추억에 달린, 아직 쓰지 않은 가장 오래된 질문) */
export function nextFamilyQuestion(db: DB, userId: number): { comment: MemoryComment; memory: Memory } | undefined {
  const rows = db.prepare(`SELECT c.* FROM memory_comments c JOIN memories m ON m.id = c.memory_id
    WHERE c.user_id = ? AND c.kind = 'question' AND c.used_at IS NULL AND m.status = 'confirmed' AND m.share_family = 1
    ORDER BY c.created_at ASC LIMIT 1`).all(userId) as unknown as CommentRow[];
  const r = rows[0];
  if (!r) return undefined;
  const memory = getMemory(db, userId, r.memory_id);
  return memory ? { comment: toComment(r), memory } : undefined;
}

export function markCommentUsed(db: DB, userId: number, id: number): void {
  db.prepare('UPDATE memory_comments SET used_at = COALESCE(used_at, ?) WHERE id = ? AND user_id = ?').run(nowIso(), id, userId);
}

// ── 가족 대시보드 ─────────────────────────────

const MIN_MESSAGES_FOR_SUMMARY = 3;

export function buildDashboard(db: DB, member: FamilyMemberRow) {
  const userId = member.user_id;
  const elder = getUser(db, userId)!;
  const prefs = getPrefs(db, userId);
  const now = Date.now();
  const since7 = new Date(now - 7 * 86_400_000).toISOString();
  const since14 = new Date(now - 14 * 86_400_000).toISOString();

  // ① 이용 현황 — 어르신이 공유를 켠 경우에만, 실제 기록으로만 계산
  let activity: Record<string, unknown> = { shared: false };
  if (prefs.shareActivity) {
    const last = db.prepare(`SELECT MAX(created_at) AS t FROM messages WHERE user_id = ? AND role = 'user'`).get(userId) as { t: string | null };
    const convs = db.prepare(`SELECT c.id, c.channel, MIN(m.created_at) AS first, MAX(m.created_at) AS last,
        SUM(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END) AS userCount
      FROM conversations c JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = ? AND m.created_at >= ? GROUP BY c.id HAVING userCount > 0`).all(userId, since7) as Array<{ id: number; channel: string; first: string; last: string; userCount: number }>;
    const minutes = convs.reduce((s, c) => s + Math.min(60, Math.max(1, Math.round((Date.parse(c.last) - Date.parse(c.first)) / 60_000))), 0);
    const days: Array<{ date: string; conversations: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = kstDate(new Date(now - i * 86_400_000));
      days.push({ date: d, conversations: convs.filter((c) => kstDate(new Date(c.last)) === d).length });
    }
    const userMsgs14 = (db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND role = 'user' AND created_at >= ?`).get(userId, since14) as { n: number }).n;
    activity = {
      shared: true,
      lastUsedAt: last.t,
      conversations7d: convs.length,
      voiceConversations7d: convs.filter((c) => c.channel === 'voice').length,
      minutes7d: minutes,
      days,
      enoughData: userMsgs14 >= MIN_MESSAGES_FOR_SUMMARY,
    };
  }

  // ② 대화 주제 — 관심사 '이름'만 (대화 문장은 보내지 않음). 가족 관련 단어는 제외.
  let topics: Record<string, unknown> = { shared: false };
  if (prefs.shareTopics) {
    const texts = db.prepare(`SELECT content FROM messages WHERE user_id = ? AND role = 'user' AND created_at >= ?`).all(userId, since14) as Array<{ content: string }>;
    const counts = new Map<string, number>();
    for (const t of texts) for (const m of detectTags(t.content)) {
      if (m.def.category === 'family') continue;
      counts.set(m.def.tag, (counts.get(m.def.tag) ?? 0) + 1);
    }
    const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag, count]) => ({ tag, count }));
    topics = { shared: true, list, enoughData: texts.length >= MIN_MESSAGES_FOR_SUMMARY && list.length > 0 };
  }

  // ③ 공유된 추억 + 댓글
  const shared = sharedMemories(db, userId);
  const comments = commentsFor(db, userId, shared.map((m) => m.id), member.id);
  const memories = shared.map((m) => ({
    id: m.id, category: m.category, categoryLabel: m.categoryLabel, title: m.title, detail: m.detail, createdAt: m.createdAt,
    comments: comments[m.id] ?? [],
  }));

  // ④ 가족 소식과 교류 요약 (최근 30일)
  const posts = listPosts(db, userId, member.id, 30);
  const since30 = new Date(now - 30 * 86_400_000).toISOString();
  const recent = posts.filter((p) => p.createdAt >= since30);
  const exchange = { sent: recent.length, seen: recent.filter((p) => p.seenAt).length, talked: recent.filter((p) => p.talkedAt).length };

  return {
    elder: { nickname: elder.nickname, ageBand: elder.age_band },
    me: { id: member.id, name: member.name, relation: member.relation, label: memberLabel(member) },
    sharing: { activity: prefs.shareActivity, topics: prefs.shareTopics, memories: shared.length },
    activity, topics, memories, posts, exchange,
    reminders: listReminders(db, userId),
  };
}
