/**
 * 기억 추출: (1) LLM 출력 JSON 검증, (2) 데모 모드용 규칙 기반 추출기, (3) 공통 저장 파이프라인
 */
import type { DB } from '../db/database.js';
import { isCategory, findDuplicate, listMemories, createMemory, type Memory } from './memories.js';
import { type MemoryCategory, detectTags, type TagMatch, normalizeTags } from './tags.js';

export interface ExtractedMemory {
  category: MemoryCategory;
  title: string;
  detail: string;
  tags: string[];
  certainty: 'stated' | 'inferred';
}

// ── (1) JSON 형식 검증 ─────────────────────────

/** LLM 응답에서 JSON 부분만 꺼냅니다 (```json 코드블록, 앞뒤 설명문 허용). */
export function extractJsonText(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : null;
}

export interface ValidationResult {
  items: ExtractedMemory[];
  errors: string[];
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** {"memories":[...]} 형식을 엄격하게 검사하고, 문제가 있는 항목만 버립니다. */
export function validateExtraction(raw: string): ValidationResult {
  const errors: string[] = [];
  const jsonText = extractJsonText(raw);
  if (!jsonText) return { items: [], errors: ['JSON 객체를 찾을 수 없음'] };
  let data: unknown;
  try { data = JSON.parse(jsonText); } catch (e) { return { items: [], errors: [`JSON 파싱 실패: ${(e as Error).message}`] }; }
  const list = (data as { memories?: unknown })?.memories;
  if (!Array.isArray(list)) return { items: [], errors: ['"memories" 배열이 없음'] };

  const items: ExtractedMemory[] = [];
  list.slice(0, 5).forEach((it, i) => {
    const o = it as Record<string, unknown>;
    if (!o || typeof o !== 'object') return void errors.push(`#${i}: 객체가 아님`);
    if (!isCategory(o.category)) return void errors.push(`#${i}: 잘못된 category "${String(o.category)}"`);
    const title = clean(o.title, 40);
    if (title.length < 2) return void errors.push(`#${i}: title 누락`);
    const detail = clean(o.detail, 200);
    const tags = Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string').map((t) => clean(t, 20)).filter(Boolean).slice(0, 4) : [];
    const certainty = o.certainty === 'inferred' ? 'inferred' : o.certainty === 'stated' ? 'stated' : null;
    if (!certainty) return void errors.push(`#${i}: certainty 는 stated/inferred 여야 함`);
    items.push({ category: o.category, title, detail, tags, certainty });
  });
  return { items, errors };
}

// ── (2) 데모 모드: 규칙 기반 추출기 ─────────────

const NEGATION = /(싫어|싫다|안 좋아|별로|안 해|안해|못 해|그만뒀|그만 뒀|관심 없|안 했)/;

function sentenceAround(text: string, index: number): string {
  const parts = text.split(/(?<=[.!?。…~\n])\s*/);
  let pos = 0;
  for (const p of parts) {
    const at = text.indexOf(p, pos);
    if (index >= at && index < at + p.length) return p.trim();
    pos = at + p.length;
  }
  return text.trim();
}

export interface DemoExtraction {
  items: ExtractedMemory[];
  matches: TagMatch[];
  negated: TagMatch[];
}

/**
 * 데모 모드 추출: 표준 태그 사전으로 발화에서 직업·취미·지역·가족·생애경험을 찾습니다.
 * - 부정 표현("~는 싫어")이 있는 문장은 저장 후보에서 뺍니다.
 * - 가족이 '보고 싶다'는 말에서는 "가족과 떨어져 지내심"을 '짐작(inferred)'으로만 제안합니다.
 */
export function demoExtract(text: string): DemoExtraction {
  const all = detectTags(text);
  const matches: TagMatch[] = [];
  const negated: TagMatch[] = [];
  for (const m of all) (NEGATION.test(sentenceAround(text, m.index)) ? negated : matches).push(m);

  const items: ExtractedMemory[] = [];
  const places = matches.filter((m) => m.def.category === 'place');
  const others = matches.filter((m) => m.def.category !== 'place');

  for (const m of others) {
    const sentence = sentenceAround(text, m.index).slice(0, 160);
    const placeTags = places.filter((p) => sentenceAround(text, p.index) === sentenceAround(text, m.index)).map((p) => p.def.tag);
    const title = m.def.category === 'family' ? `가족 이야기 — ${m.def.tag}` : m.def.tag;
    items.push({ category: m.def.category, title, detail: sentence, tags: [m.def.tag, ...placeTags], certainty: 'stated' });
  }
  // 다른 기억에 붙지 않은 지역은 별도의 '지역 및 생활 경험'으로
  for (const p of places) {
    const sentence = sentenceAround(text, p.index);
    const attached = others.some((m) => sentenceAround(text, m.index) === sentence);
    if (!attached) items.push({ category: 'place', title: `${p.def.tag}에서의 생활`, detail: sentence.slice(0, 160), tags: [p.def.tag], certainty: 'stated' });
  }
  if (others.some((m) => m.def.category === 'family') && /보고 ?싶|그립|멀리 (살|있)/.test(text)) {
    items.push({ category: 'family', title: '가족과 떨어져 지내심', detail: '가족이 보고 싶다고 하신 말씀에서 단디가 짐작한 내용이에요.', tags: [], certainty: 'inferred' });
  }
  // 사전에 없는 '최근 일상 이야기' ("손녀가 다음 달에 결혼한대") — 다음 날 후속 질문의 소재가 됩니다.
  if (items.length === 0 && negated.length === 0) {
    const daily = demoDaily(text);
    if (daily) items.push(daily);
  }
  return { items: items.slice(0, 5), matches, negated };
}

const RECENT = /(오늘|어제|요즘|요새|이번 ?주|지난 ?주|다음 ?주|내일|다음 ?달|이번 ?달|아까)/;
// 날씨·기분·건강·인사 같은 그날의 이야기와 민감한 정보는 기억 후보로 만들지 않습니다.
const NOT_DAILY = /(날씨|더워|덥다|추워|춥다|비가|눈이|아프|아파서|아파요|아팠|편찮|병원|약을|약 |어지럽|기분|외롭|심심|쓸쓸|고마|고맙|안녕|반가|돈을|돈이|빚|교회|성당|절에|정치|선거)/;
const LEADING_TIME = /^(오늘|어제|요즘|요새|아까|내일|(이번|다음|지난) ?(주말|주|달))(은|는|에|에는)?\s*/;

/** 낱말 중간에서 자르지 않도록 20자 안에서 띄어쓰기 단위로 줄입니다. */
function shortTitle(s: string, max = 20): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${sp > 6 ? cut.slice(0, sp) : cut}…`;
}

function demoDaily(text: string): ExtractedMemory | null {
  const sentence = text.split(/(?<=[.!?。…~\n])\s*/).find((s) => RECENT.test(s));
  if (!sentence || NOT_DAILY.test(sentence)) return null;
  const core = sentence.replace(/[.!?。…~\s]+$/g, '').trim();
  if (core.replace(/\s/g, '').length < 8) return null;
  const title = shortTitle(core.replace(LEADING_TIME, '') || core);
  return { category: 'daily', title, detail: core.slice(0, 160), tags: [], certainty: 'stated' };
}

// ── (3) 공통 저장 파이프라인 ─────────────────────

export interface ProcessResult {
  created: Memory[];      // 새로 만든 '확인 대기' 기억
  alreadyKnown: Memory[]; // 이미 있던 기억과 겹쳐서 저장하지 않은 것
}

/**
 * 추출 결과를 정규화 → 중복 검사 → '확인 대기(pending)' 상태로 저장합니다.
 * 이용자가 [기억할게요]를 눌러야 'confirmed' 가 되고, 그때부터 대화·추천에 사용됩니다.
 * AI의 짐작(inferred)은 source='inferred' 로 구분해 표시합니다.
 */
export function processExtraction(
  db: DB, userId: number, items: ExtractedMemory[],
  origin: { conversationId: number; conversationTitle: string; messageId: number },
): ProcessResult {
  const existing = listMemories(db, userId);
  const created: Memory[] = [];
  const alreadyKnown: Memory[] = [];
  for (const it of items) {
    const tags = normalizeTags(it.tags, `${it.title} ${it.detail}`);
    const dup = findDuplicate([...existing, ...created], { category: it.category, title: it.title, tags });
    if (dup) {
      if (!alreadyKnown.some((m) => m.id === dup.id) && !created.some((m) => m.id === dup.id)) alreadyKnown.push(dup);
      continue;
    }
    created.push(createMemory(db, userId, {
      category: it.category, title: it.title, detail: it.detail, tags,
      source: it.certainty === 'inferred' ? 'inferred' : 'stated',
      status: 'pending',
      conversationId: origin.conversationId, conversationTitle: origin.conversationTitle, messageId: origin.messageId,
    }));
  }
  return { created, alreadyKnown };
}
