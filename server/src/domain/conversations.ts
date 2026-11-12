import type { DB } from '../db/database.js';
import { nowIso, parseJson } from '../db/database.js';
import { getMemory, type Memory } from './memories.js';
import { getPost } from './family.js';
import type { PendingAction } from './opening.js';

/** demo: 규칙 기반 / ai: AI 생성 / fallback: AI 오류로 대체 / template: AI 모드에서도 정해진 안내 문장(예/아니요 확인 등) */
export type MessageMode = 'demo' | 'ai' | 'fallback' | 'template';
export type Channel = 'text' | 'voice';

export interface MessageMeta {
  candidateIds?: number[];     // 이 응답과 함께 저장 여부를 여쭤본 기억 후보
  alreadyKnownIds?: number[];  // 이미 알고 있어 다시 저장하지 않은 기억
  usedMemoryIds?: number[];    // 응답을 만들 때 참고한 기억
  notice?: string;             // 화면에 보여줄 알림 (예: AI 오류로 데모 응답 대체)
  pendingAction?: PendingAction; // 다음 말씀을 '예/아니요'로 받을 질문 (가족 소식 보기, 음성으로 기억 확인)
  showPostId?: number;         // 화면에 크게 보여 줄 가족 소식
  confirmedIds?: number[];     // 이번에 음성으로 확인(저장)한 기억
  rejectedIds?: number[];      // 이번에 음성으로 '기억하지 않기'로 한 기억
  reminderIds?: number[];      // 안내했거나 확인한 알림
  endSession?: boolean;        // 음성 대화를 마무리하는 인사
  openingKind?: string;        // 첫마디의 종류 (후속 질문, 가족 소식 등)
  emotion?: 'neutral' | 'happy' | 'comforting'; // 이 답을 말할 때 캐릭터 표정
}

interface MessageRow {
  id: number; conversation_id: number; role: 'user' | 'assistant'; content: string; mode: MessageMode; meta: string; created_at: string;
}
export interface ConversationRow {
  id: number; user_id: number; title: string; created_at: string; last_message_at: string;
  channel: Channel; ended_at: string | null; family_post_id: number | null;
}

export const kstDateLabel = (d = new Date()) =>
  d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

export function kstHour(d = new Date()): number {
  return Number(d.toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false })) % 24;
}

export function createConversation(db: DB, userId: number, channel: Channel = 'text'): ConversationRow {
  const now = nowIso();
  const r = db.prepare('INSERT INTO conversations (user_id, title, created_at, last_message_at, channel) VALUES (?, ?, ?, ?, ?)')
    .run(userId, `${kstDateLabel()} ${channel === 'voice' ? '음성 이야기' : '이야기'}`, now, now, channel);
  return getConversationRow(db, userId, Number(r.lastInsertRowid))!;
}

export function setConversationPost(db: DB, userId: number, id: number, postId: number): void {
  db.prepare('UPDATE conversations SET family_post_id = ? WHERE id = ? AND user_id = ?').run(postId, id, userId);
}

export function endConversation(db: DB, userId: number, id: number): boolean {
  return Number(db.prepare('UPDATE conversations SET ended_at = COALESCE(ended_at, ?) WHERE id = ? AND user_id = ?').run(nowIso(), id, userId).changes) > 0;
}

/** 이 대화에서 단디가 마지막으로 한 말의 meta (예/아니요 대기 여부 확인용) */
export function lastAssistantMeta(db: DB, conversationId: number): MessageMeta {
  const r = db.prepare(`SELECT meta FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1`).get(conversationId) as { meta: string } | undefined;
  return parseJson<MessageMeta>(r?.meta, {});
}

/** 최근 대화들에서 단디가 이미 한 질문 (같은 질문 반복 방지용) */
export function recentDandiQuestions(db: DB, userId: number, limit = 8): string[] {
  const rows = db.prepare(`SELECT content FROM messages WHERE user_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 30`).all(userId) as Array<{ content: string }>;
  const out: string[] = [];
  for (const r of rows) {
    for (const s of r.content.split(/(?<=[.!?])\s+/)) if (s.trim().endsWith('?') && !out.includes(s.trim())) out.push(s.trim());
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export function getConversationRow(db: DB, userId: number, id: number): ConversationRow | undefined {
  return db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, userId) as ConversationRow | undefined;
}

export function renameFromFirstMessage(db: DB, conv: ConversationRow, text: string): string {
  const count = (db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND role = 'user'`).get(conv.id) as { n: number }).n;
  if (count !== 1) return conv.title;
  const short = text.replace(/\s+/g, ' ').trim();
  const title = `${kstDateLabel(new Date(conv.created_at))} · "${short.length > 16 ? short.slice(0, 16) + '…' : short}"`;
  db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, conv.id);
  return title;
}

export function insertMessage(db: DB, userId: number, conversationId: number, role: 'user' | 'assistant', content: string, mode: MessageMode, meta: MessageMeta = {}): number {
  const now = nowIso();
  const r = db.prepare('INSERT INTO messages (conversation_id, user_id, role, content, mode, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(conversationId, userId, role, content, mode, JSON.stringify(meta), now);
  db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(now, conversationId);
  return Number(r.lastInsertRowid);
}

export function updateMessageMeta(db: DB, id: number, meta: MessageMeta): void {
  db.prepare('UPDATE messages SET meta = ? WHERE id = ?').run(JSON.stringify(meta), id);
}

export function recentTurns(db: DB, conversationId: number, limit = 12): Array<{ role: 'user' | 'assistant'; content: string }> {
  const rows = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?').all(conversationId, limit) as Array<{ role: 'user' | 'assistant'; content: string }>;
  return rows.reverse();
}

/** 화면용 메시지: meta 안의 기억 ID를 '현재 상태'의 기억으로 풀어서 보냅니다(삭제된 기억은 deleted 표시). */
export function toMessageDTO(db: DB, userId: number, r: MessageRow) {
  const meta = parseJson<MessageMeta>(r.meta, {});
  const resolve = (ids?: number[]) => (ids ?? []).map((id) => getMemory(db, userId, id) ?? { id, deleted: true as const });
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    mode: r.mode,
    createdAt: r.created_at,
    candidates: resolve(meta.candidateIds),
    alreadyKnown: resolve(meta.alreadyKnownIds),
    usedMemories: resolve(meta.usedMemoryIds).filter((m): m is Memory => !('deleted' in m)).map((m) => ({ id: m.id, title: m.title })),
    notice: meta.notice ?? null,
    pendingAction: meta.pendingAction?.type ?? null,
    showPost: meta.showPostId ? getPost(db, userId, meta.showPostId) ?? null : null,
    confirmed: resolve(meta.confirmedIds).filter((m): m is Memory => !('deleted' in m)).map((m) => ({ id: m.id, title: m.title })),
    endSession: !!meta.endSession,
    emotion: meta.emotion ?? 'neutral',
  };
}

export function getMessage(db: DB, userId: number, id: number) {
  const r = db.prepare('SELECT * FROM messages WHERE id = ? AND user_id = ?').get(id, userId) as MessageRow | undefined;
  return r ? toMessageDTO(db, userId, r) : undefined;
}

export function getConversation(db: DB, userId: number, id: number) {
  const c = getConversationRow(db, userId, id);
  if (!c) return undefined;
  const rows = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').all(id) as unknown as MessageRow[];
  return {
    id: c.id, title: c.title, createdAt: c.created_at, lastMessageAt: c.last_message_at, channel: c.channel, endedAt: c.ended_at,
    messages: rows.map((r) => toMessageDTO(db, userId, r)),
  };
}

export function listConversations(db: DB, userId: number, limit = 20) {
  return db.prepare(`SELECT c.id, c.title, c.channel, c.created_at AS createdAt, c.last_message_at AS lastMessageAt,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messageCount,
      (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY id DESC LIMIT 1) AS lastMessage
    FROM conversations c WHERE c.user_id = ? ORDER BY c.last_message_at DESC, c.id DESC LIMIT ?`).all(userId, limit);
}

export function deleteConversation(db: DB, userId: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;
}
