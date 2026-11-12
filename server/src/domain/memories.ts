import type { DB } from '../db/database.js';
import { nowIso, parseJson, tx } from '../db/database.js';
import {
  CATEGORIES, CATEGORY_LABEL, type MemoryCategory, detectTags, dimensionOf, getTagDef, normalizeTags,
} from './tags.js';

export type MemoryStatus = 'pending' | 'confirmed';
export type MemorySource = 'stated' | 'inferred' | 'manual';

export interface MemoryRow {
  id: number;
  user_id: number;
  category: MemoryCategory;
  title: string;
  detail: string;
  tags: string;
  source: MemorySource;
  status: MemoryStatus;
  use_for_matching: number;
  conversation_id: number | null;
  conversation_title: string | null;
  message_id: number | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  last_recalled_at: string | null;
  recall_count: number;
  share_family: number;
  engagement: number;
}

export interface Memory {
  id: number;
  category: MemoryCategory;
  categoryLabel: string;
  title: string;
  detail: string;
  tags: string[];
  source: MemorySource;
  status: MemoryStatus;
  useForMatching: boolean;
  conversationId: number | null;
  conversationTitle: string | null;
  conversationExists: boolean;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  lastRecalledAt: string | null;
  recallCount: number;
  shareFamily: boolean;   // 어르신이 가족과 공유하기로 한 기억
  engagement: number;     // 이 기억으로 대화했을 때 어르신이 길게 이야기해 주신 횟수 (좋아하는 주제 파악용)
}

export function toMemory(r: MemoryRow): Memory {
  return {
    id: r.id,
    category: r.category,
    categoryLabel: CATEGORY_LABEL[r.category],
    title: r.title,
    detail: r.detail,
    tags: parseJson<string[]>(r.tags, []),
    source: r.source,
    status: r.status,
    useForMatching: !!r.use_for_matching && r.category !== 'family',
    conversationId: r.conversation_id,
    conversationTitle: r.conversation_title,
    conversationExists: r.conversation_id !== null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    confirmedAt: r.confirmed_at,
    lastRecalledAt: r.last_recalled_at,
    recallCount: r.recall_count,
    shareFamily: !!r.share_family,
    engagement: r.engagement ?? 0,
  };
}

export const isCategory = (c: unknown): c is MemoryCategory => typeof c === 'string' && (CATEGORIES as string[]).includes(c);

export function listMemories(db: DB, userId: number, status?: MemoryStatus): Memory[] {
  const rows = status
    ? db.prepare('SELECT * FROM memories WHERE user_id = ? AND status = ? ORDER BY created_at DESC, id DESC').all(userId, status)
    : db.prepare('SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(userId);
  return (rows as unknown as MemoryRow[]).map(toMemory);
}

export function getMemory(db: DB, userId: number, id: number): Memory | undefined {
  const r = db.prepare('SELECT * FROM memories WHERE id = ? AND user_id = ?').get(id, userId) as MemoryRow | undefined;
  return r ? toMemory(r) : undefined;
}

/** 확인된 기억에서 추천용 태그(interests)를 다시 만듭니다. 가족 기억·추천 제외 기억은 넣지 않습니다. */
export function syncInterests(db: DB, userId: number, memoryId: number): void {
  db.prepare('DELETE FROM interests WHERE memory_id = ? AND user_id = ?').run(memoryId, userId);
  const m = getMemory(db, userId, memoryId);
  if (!m || m.status !== 'confirmed' || !m.useForMatching) return;
  const ins = db.prepare(`INSERT INTO interests (user_id, memory_id, dimension, tag, origin, created_at) VALUES (?, ?, ?, ?, 'memory', ?)`);
  for (const tag of m.tags) {
    const dim = dimensionOf(tag, m.category);
    if (dim === 'family') continue;
    // 사전에 있는 '가족' 태그가 다른 분류 기억에 붙어 있어도 추천에 쓰지 않음
    if (getTagDef(tag)?.category === 'family') continue;
    ins.run(userId, memoryId, dim, tag, nowIso());
  }
}

export interface NewMemoryInput {
  category: MemoryCategory;
  title: string;
  detail: string;
  tags: string[];
  source: MemorySource;
  status: MemoryStatus;
  conversationId?: number | null;
  conversationTitle?: string | null;
  messageId?: number | null;
}

export function createMemory(db: DB, userId: number, input: NewMemoryInput): Memory {
  const now = nowIso();
  const tags = normalizeTags(input.tags, `${input.title} ${input.detail}`);
  return tx(db, () => {
    const r = db.prepare(`INSERT INTO memories
      (user_id, category, title, detail, tags, source, status, use_for_matching, conversation_id, conversation_title, message_id, created_at, updated_at, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      userId, input.category, input.title, input.detail, JSON.stringify(tags), input.source, input.status,
      // 가족 기억은 추천에 절대 쓰지 않고, 최근 일상 이야기는 기본적으로 추천에서 빼 둡니다(어르신이 켤 수 있음).
      input.category === 'family' || input.category === 'daily' ? 0 : 1,
      input.conversationId ?? null, input.conversationTitle ?? null, input.messageId ?? null, now, now,
      input.status === 'confirmed' ? now : null,
    );
    const id = Number(r.lastInsertRowid);
    syncInterests(db, userId, id);
    return getMemory(db, userId, id)!;
  });
}

export interface MemoryPatch {
  category?: MemoryCategory;
  title?: string;
  detail?: string;
  tags?: string[];
  useForMatching?: boolean;
  status?: MemoryStatus;
  shareFamily?: boolean;
}

export function updateMemory(db: DB, userId: number, id: number, patch: MemoryPatch): Memory | undefined {
  const cur = getMemory(db, userId, id);
  if (!cur) return undefined;
  const category = patch.category ?? cur.category;
  const title = patch.title ?? cur.title;
  const detail = patch.detail ?? cur.detail;
  const textChanged = title !== cur.title || detail !== cur.detail;
  // 태그를 직접 고치지 않고 글만 고쳤다면, 새 글에서 태그를 다시 찾습니다(옛 태그가 남지 않도록).
  let tags: string[];
  if (patch.tags) tags = normalizeTags(patch.tags, '');
  else if (textChanged) tags = normalizeTags([], `${title} ${detail}`);
  else tags = cur.tags;
  if (tags.length === 0) tags = normalizeTags([title], '');
  const useForMatching = category === 'family' ? false : (patch.useForMatching ?? cur.useForMatching);
  const status = patch.status ?? cur.status;
  // 확인되지 않은 기억은 가족과 공유할 수 없습니다.
  const shareFamily = status === 'confirmed' ? (patch.shareFamily ?? cur.shareFamily) : false;
  const now = nowIso();
  return tx(db, () => {
    db.prepare(`UPDATE memories SET category=?, title=?, detail=?, tags=?, use_for_matching=?, status=?, share_family=?, updated_at=?,
        confirmed_at = CASE WHEN ?='confirmed' AND confirmed_at IS NULL THEN ? ELSE confirmed_at END
      WHERE id=? AND user_id=?`).run(
      category, title, detail, JSON.stringify(tags), useForMatching ? 1 : 0, status, shareFamily ? 1 : 0, now, status, now, id, userId,
    );
    syncInterests(db, userId, id);
    return getMemory(db, userId, id);
  });
}

export function deleteMemory(db: DB, userId: number, id: number): boolean {
  const r = db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(id, userId);
  return Number(r.changes) > 0;
}

// ── 중복 기억 판단 ─────────────────────────────

function bigrams(s: string): string[] {
  const t = s.replace(/\s+/g, '');
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out.length ? out : [t];
}

/** 문자 2-gram 기반 유사도 (0~1) */
export function dice(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  const pool = [...B];
  let hit = 0;
  for (const g of A) {
    const i = pool.indexOf(g);
    if (i >= 0) { hit++; pool.splice(i, 1); }
  }
  return (2 * hit) / (A.length + B.length);
}

/** 같은 분류에서 핵심(지역 제외) 표준 태그가 겹치거나 제목이 매우 비슷하면 같은 기억으로 봅니다. */
export function findDuplicate(existing: Memory[], cand: { category: MemoryCategory; title: string; tags: string[] }): Memory | undefined {
  const core = (tags: string[], category: MemoryCategory) =>
    tags.filter((t) => { const d = getTagDef(t); return d && (category === 'place' || d.category !== 'place'); });
  const candCore = core(cand.tags, cand.category);
  return existing.find((m) => {
    if (m.category !== cand.category) return false;
    if (dice(m.title, cand.title) >= 0.7) return true;
    const mCore = core(m.tags, m.category);
    return candCore.some((t) => mCore.includes(t));
  });
}

// ── 관련 기억 검색 ─────────────────────────────

export interface ScoredMemory { memory: Memory; relevance: number }

/**
 * 이번 발화와 관련된 '확인된' 기억을 찾습니다.
 * 점수 = 표준 태그 겹침(×3) + 제목 단어 포함(×2). 관련 기억이 부족하면 최근 기억으로 채웁니다(relevance 0).
 */
export function retrieveRelevant(db: DB, userId: number, text: string, limit = 6): ScoredMemory[] {
  const confirmed = listMemories(db, userId, 'confirmed');
  const textTags = new Set(detectTags(text).map((m) => m.def.tag));
  const scored = confirmed.map((m) => {
    let s = 0;
    for (const t of m.tags) if (textTags.has(t)) s += 3;
    for (const w of m.title.split(/\s+/)) if (w.length >= 2 && text.includes(w)) s += 2;
    return { memory: m, relevance: s };
  });
  const relevant = scored.filter((x) => x.relevance > 0).sort((a, b) => b.relevance - a.relevance);
  const rest = scored.filter((x) => x.relevance === 0); // 이미 최신순
  return [...relevant, ...rest].slice(0, limit);
}

export function markRecalled(db: DB, userId: number, id: number): void {
  db.prepare('UPDATE memories SET last_recalled_at = ?, recall_count = recall_count + 1 WHERE id = ? AND user_id = ?').run(nowIso(), id, userId);
}

/** 피하고 싶다고 하신 이야기(설정)와 관련된 기억인지 */
export function isAvoided(m: Pick<Memory, 'title' | 'detail' | 'tags'>, avoid: string[]): boolean {
  return avoid.some((a) => a && (m.title.includes(a) || m.detail.includes(a) || m.tags.some((t) => t.includes(a) || a.includes(t))));
}

/**
 * 회상 대화에 쓸 기억 고르기 (가족 기억은 직접 고른 경우에만)
 * 1) 하루 안에 이미 꺼낸 기억은 건너뜀(같은 질문 반복 방지)
 * 2) 아직 한 번도 꺼내지 않은 기억 우선
 * 3) 그다음은 어르신이 길게 이야기해 주셨던(좋아하시는) 기억 우선, 같으면 가장 오래 전에 꺼낸 것
 */
export function pickMemoryForRecall(db: DB, userId: number, opts: { avoid?: string[]; excludeIds?: number[] } = {}): Memory | undefined {
  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  const rows = db.prepare(`SELECT * FROM memories WHERE user_id = ? AND status = 'confirmed' AND category != 'family'
     ORDER BY (last_recalled_at IS NOT NULL), engagement DESC, last_recalled_at ASC, recall_count ASC, created_at DESC`).all(userId) as unknown as MemoryRow[];
  const list = rows.map(toMemory).filter((m) => !isAvoided(m, opts.avoid ?? []) && !(opts.excludeIds ?? []).includes(m.id));
  return list.find((m) => !m.lastRecalledAt || m.lastRecalledAt < since) ?? list[0];
}

/** 기억을 꺼냈을 때 어르신이 길게 이야기해 주셨다면 '좋아하는 주제' 점수를 올립니다. */
export function bumpEngagement(db: DB, userId: number, ids: number[]): void {
  const st = db.prepare('UPDATE memories SET engagement = engagement + 1 WHERE id = ? AND user_id = ?');
  for (const id of ids) st.run(id, userId);
}
