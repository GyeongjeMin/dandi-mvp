/**
 * 새 대화의 첫마디 계획 — "다시 이야기하고 싶어지는" 대화를 위한 규칙
 *
 * 우선순위
 *  1) (가족 소식 화면에서 고른 경우) 그 소식을 바로 보여 주며 이야기 시작
 *  2) (나의 추억에서 고른 경우) 그 기억으로 회상 질문
 *  3) 아직 보지 않은 가족 소식이 있으면 "같이 보실까요?" 하고 여쭤봄 (하루 한 번까지)
 *  4) 가족이 공유된 추억에 남긴 질문을 대신 여쭤봄
 *  5) 어제·그저께 나눈 이야기의 후속 질문 ("어제 말씀하신 텃밭은 오늘도 잘 돌보고 오셨어요?")
 *  6) 오래 꺼내지 않은(그리고 좋아하시는) 기억으로 회상 질문
 *  7) 편한 일상 질문
 * + 지금 시간에 맞는 복약·생활 알림이 있으면 짧게 덧붙임
 * + 인사말·일상 질문·후속 질문은 최근에 쓴 것을 피해서 고름 (dialogue_log)
 *
 * 알림을 반복해서 보내거나 이용을 재촉하는 기능은 없습니다. 단디는 어르신이 대화를 시작했을 때만 말을 겁니다.
 */
import type { DB } from '../db/database.js';
import { nowIso } from '../db/database.js';
import type { UserRow } from './users.js';
import { getMemory, isAvoided, listMemories, pickMemoryForRecall, type Memory } from './memories.js';
import { templateRecallQuestion } from './recall.js';
import { getPost, markPost, nextFamilyQuestion, postToOffer, touchOffered, markCommentUsed, type FamilyPost } from './family.js';
import { dueReminders, type Reminder } from './reminders.js';
import type { Prefs } from './prefs.js';
import { daysBetween, kstDate, kstMinutes, whenWord } from './time.js';
import { detectTags, getTagDef } from './tags.js';
import { joinKo } from './josa.js';

export type PendingAction =
  | { type: 'family_post'; postId: number }
  | { type: 'memory_confirm'; memoryIds: number[]; deferred?: string | null };

export type OpeningKind = 'family_post_show' | 'family_post_offer' | 'family_question' | 'followup' | 'recall' | 'free';

export interface OpeningPlan {
  kind: OpeningKind;
  greeting: string;
  note: string;                // 알림 안내 (없으면 '')
  question: string;            // 첫 질문 (템플릿)
  topicNote: string;           // AI 가 다듬을 때 참고할 소재 설명
  polishable: boolean;         // AI 로 다듬어도 되는지 (예/아니요를 기다리는 문장은 그대로 둠)
  usedMemoryIds: number[];
  pendingAction?: PendingAction;
  showPostId?: number;
  // 기록용
  logs: Array<{ kind: string; key: string }>;
  memoryToMark?: number;
  postOffered?: number;
  postShown?: number;
  commentUsed?: number;
  dueReminders: Reminder[];
}

// ── 사용 이력 ─────────────────────────────────

export function logDialogue(db: DB, userId: number, kind: string, key: string): void {
  db.prepare('INSERT INTO dialogue_log (user_id, kind, key, created_at) VALUES (?, ?, ?, ?)').run(userId, kind, key, nowIso());
}

function recentKeys(db: DB, userId: number, kind: string, limit: number, sinceMs?: number): string[] {
  const rows = sinceMs
    ? db.prepare('SELECT key FROM dialogue_log WHERE user_id = ? AND kind = ? AND created_at >= ? ORDER BY id DESC LIMIT ?').all(userId, kind, new Date(Date.now() - sinceMs).toISOString(), limit)
    : db.prepare('SELECT key FROM dialogue_log WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT ?').all(userId, kind, limit);
  return (rows as Array<{ key: string }>).map((r) => r.key);
}

function pickFresh<T>(items: Array<{ key: string; value: T }>, used: string[]): { key: string; value: T } {
  return items.find((i) => !used.includes(i.key)) ?? items[0];
}

// ── 인사말 (시간대별, 최근 2번과 겹치지 않게) ───────

const GREETINGS: Record<'morning' | 'day' | 'evening', Array<(n: string) => string>> = {
  morning: [
    (n) => `좋은 아침이에요, ${n}님! 단디예요.`,
    (n) => `${n}님, 상쾌한 아침이에요. 단디가 왔어요.`,
    (n) => `${n}님, 오늘 아침도 이렇게 만나서 반가워요.`,
  ],
  day: [
    (n) => `안녕하세요, ${n}님! 단디예요.`,
    (n) => `${n}님, 반가워요. 단디예요.`,
    (n) => `${n}님, 오후에 이렇게 또 만나니 기뻐요.`,
  ],
  evening: [
    (n) => `편안한 저녁이에요, ${n}님. 단디예요.`,
    (n) => `${n}님, 오늘 하루도 수고 많으셨어요.`,
    (n) => `${n}님, 저녁에 이렇게 이야기 나누니 참 좋네요.`,
  ],
};

export function pickGreeting(db: DB, user: Pick<UserRow, 'id' | 'nickname'>, now = new Date()): { key: string; text: string } {
  const h = Math.floor(kstMinutes(now) / 60);
  const slot = h < 11 ? 'morning' : h < 17 ? 'day' : 'evening';
  const used = recentKeys(db, user.id, 'greeting', 2);
  const g = pickFresh(GREETINGS[slot].map((f, i) => ({ key: `${slot}:${i}`, value: f })), used);
  return { key: g.key, text: g.value(user.nickname) };
}

// ── 편한 일상 질문 (기억이 없을 때) ──────────────

const FREE_QUESTIONS = [
  '오늘 하루는 어떻게 보내고 계세요? 옛날이야기든 요즘 이야기든 편하게 들려주세요.',
  '요즘 즐겨 하시는 일이 있으세요? 작은 것이라도 좋아요.',
  '젊으셨을 때 이야기를 하나 들려주실래요? 어디에서 자라셨어요?',
  '오늘은 무엇을 드셨어요? 좋아하시는 음식 이야기도 궁금해요.',
  '요즘 마음이 즐거웠던 일이 있으셨어요? 아주 작은 일이라도요.',
];

// ── 후속 질문 ("어제 말씀하신 ~") ──────────────

const FOLLOWUP: Record<string, (w: string) => string> = {
  '텃밭 가꾸기': (w) => `${w} 말씀하신 텃밭은 오늘도 잘 돌보고 오셨어요?`,
  '꽃 가꾸기': (w) => `${w} 꽃 이야기를 해 주셨잖아요. 요즘 꽃들은 잘 피었어요?`,
  '등산': (w) => `${w} 등산 이야기를 해 주셨잖아요. 요즘도 산에 다녀오셨어요?`,
  '산책': (w) => `${w} 산책 이야기를 해 주셨잖아요. 오늘도 걸으러 나가셨어요?`,
  '요리': (w) => `${w} 요리 이야기를 해 주셨잖아요. 오늘은 무슨 음식을 하셨어요?`,
  '노래': (w) => `${w} 노래 이야기를 해 주셨잖아요. 요즘 즐겨 부르시는 노래가 있어요?`,
  '낚시': (w) => `${w} 낚시 이야기를 해 주셨잖아요. 요즘도 낚시하러 가세요?`,
  '바둑': (w) => `${w} 바둑 이야기를 해 주셨잖아요. 요즘 바둑 두실 일이 있으셨어요?`,
  '체조': (w) => `${w} 운동 이야기를 해 주셨잖아요. 오늘도 몸을 움직이셨어요?`,
  '독서': (w) => `${w} 책 이야기를 해 주셨잖아요. 요즘 읽고 계신 게 있으세요?`,
};

interface FollowupCandidate { key: string; days: number; text: string; memoryId?: number; label: string }

function followupFor(tag: string, w: string): string {
  return FOLLOWUP[tag]?.(w) ?? `${w} ${tag} 이야기를 들려주셨잖아요. 그 뒤로 어떻게 지내셨어요?`;
}

/** 1~3일 전에 나눈 '요즘 이야기'를 찾아 후속 질문을 만듭니다. 기억 저장에 동의한 분만. */
export function findFollowup(db: DB, user: UserRow, avoid: string[], now = new Date()): FollowupCandidate | undefined {
  if (!user.consent_memory) return undefined;
  const today = kstDate(now);
  const used = recentKeys(db, user.id, 'followup', 20, 3 * 86_400_000);
  const cands: FollowupCandidate[] = [];

  for (const m of listMemories(db, user.id, 'confirmed')) {
    if (m.category !== 'daily' && m.category !== 'hobby') continue;
    const days = daysBetween(kstDate(new Date(m.createdAt)), today);
    if (days < 1 || days > 3 || isAvoided(m, avoid)) continue;
    const w = whenWord(days);
    const hobbyTag = m.tags.find((t) => getTagDef(t)?.category === 'hobby');
    const text = m.category === 'daily'
      ? `${w} ‘${m.title}’ 이야기를 해 주셨잖아요. 그 뒤로 어떻게 되셨어요?`
      : followupFor(hobbyTag ?? m.title, w);
    cands.push({ key: `memory:${m.id}`, days, text, memoryId: m.id, label: m.title });
  }

  const since = new Date(now.getTime() - 4 * 86_400_000).toISOString();
  const msgs = db.prepare(`SELECT content, created_at FROM messages WHERE user_id = ? AND role = 'user' AND created_at >= ? ORDER BY id DESC LIMIT 60`)
    .all(user.id, since) as Array<{ content: string; created_at: string }>;
  for (const msg of msgs) {
    const days = daysBetween(kstDate(new Date(msg.created_at)), today);
    if (days < 1 || days > 3) continue;
    for (const t of detectTags(msg.content)) {
      if (t.def.category !== 'hobby') continue;
      if (avoid.some((a) => t.def.tag.includes(a) || a.includes(t.def.tag))) continue;
      if (/(싫|안 좋아|별로|그만)/.test(msg.content)) continue;
      cands.push({ key: `tag:${t.def.tag}`, days, text: followupFor(t.def.tag, whenWord(days)), label: t.def.tag });
    }
  }
  return cands
    .filter((c) => !used.includes(c.key))
    .sort((a, b) => a.days - b.days || (a.memoryId ? -1 : 1))[0];
}

// ── 계획 세우기 ───────────────────────────────

const postIntro = (p: FamilyPost) => (p.photoUrl ? `${p.from} 님이 사진을 보내왔어요.` : `${p.from} 님이 소식을 보내왔어요.`);

export function showPostText(p: FamilyPost): string {
  const msg = p.message ? ` “${p.message}”라고 적어 보냈어요.` : '';
  return p.photoUrl
    ? `${p.from} 님이 보낸 사진이에요.${msg} 사진을 보시니 어떤 생각이 드세요?`
    : `${p.from} 님이 보낸 소식이에요.${msg} 들으시니 어떠세요?`;
}

export function planOpening(
  db: DB, user: UserRow, prefs: Prefs,
  opts: { memoryId?: number; question?: string; postId?: number } = {}, now = new Date(),
): OpeningPlan {
  const g = pickGreeting(db, user, now);
  const due = dueReminders(db, user.id, now);
  const note = due.length ? `참, ${joinKo(due.map((r) => `${r.timeLabel} ${r.label}`))} 시간이에요.` : '';
  const base = { greeting: g.text, note, dueReminders: due, logs: [{ kind: 'greeting', key: g.key }] };

  // 1) 가족 소식 화면에서 고른 소식
  if (opts.postId) {
    const p = getPost(db, user.id, opts.postId);
    if (p) {
      return { ...base, kind: 'family_post_show', question: showPostText(p), topicNote: '가족 소식', polishable: false, usedMemoryIds: [], showPostId: p.id, postShown: p.id };
    }
  }

  // 2) 나의 추억에서 고른 기억
  if (opts.memoryId) {
    const m = getMemory(db, user.id, opts.memoryId);
    if (m && m.status === 'confirmed') {
      return {
        ...base, kind: 'recall', question: opts.question ?? templateRecallQuestion(m), polishable: !opts.question,
        topicNote: `이용자가 고른 기억으로 회상 질문: ${m.title}${m.detail ? ` — ${m.detail}` : ''}`,
        usedMemoryIds: [m.id], memoryToMark: m.id,
      };
    }
  }

  // 3) 아직 보지 않은 가족 소식
  const post = postToOffer(db, user.id);
  if (post) {
    return {
      ...base, kind: 'family_post_offer', question: `${postIntro(post)} 지금 같이 보실까요?`, topicNote: '가족 소식 소개', polishable: false,
      usedMemoryIds: [], pendingAction: { type: 'family_post', postId: post.id }, postOffered: post.id,
    };
  }

  // 4) 가족이 남긴 질문
  const fq = nextFamilyQuestion(db, user.id);
  if (fq && !isAvoided(fq.memory, prefs.avoidTopics)) {
    return {
      ...base, kind: 'family_question',
      question: `${fq.comment.from} 님이 ‘${fq.memory.title}’ 추억을 보고 여쭤봐 달래요. “${fq.comment.content}” 기억나시는 대로 들려주시겠어요?`,
      topicNote: '가족이 남긴 질문 전달', polishable: false,
      usedMemoryIds: [fq.memory.id], memoryToMark: fq.memory.id, commentUsed: fq.comment.id,
    };
  }

  // 5) 어제·그저께 이야기의 후속 질문
  const fu = findFollowup(db, user, prefs.avoidTopics, now);
  if (fu) {
    return {
      ...base, kind: 'followup', question: fu.text, polishable: true,
      topicNote: `며칠 전 이용자가 직접 말한 이야기의 후속 안부: ${fu.label}`,
      usedMemoryIds: fu.memoryId ? [fu.memoryId] : [], memoryToMark: fu.memoryId,
      logs: [...base.logs, { kind: 'followup', key: fu.key }],
    };
  }

  // 6) 회상 질문
  const m = pickMemoryForRecall(db, user.id, { avoid: prefs.avoidTopics });
  if (m) {
    return {
      ...base, kind: 'recall', question: templateRecallQuestion(m), polishable: true,
      topicNote: `저장된 기억으로 회상 질문: ${m.title}${m.detail ? ` — ${m.detail}` : ''}`,
      usedMemoryIds: [m.id], memoryToMark: m.id,
    };
  }

  // 7) 편한 일상 질문
  const used = recentKeys(db, user.id, 'free', 3);
  const fq2 = pickFresh(FREE_QUESTIONS.map((q, i) => ({ key: `free:${i}`, value: q })), used);
  return {
    ...base, kind: 'free', question: fq2.value, polishable: true, topicNote: '아는 것이 없으니 편한 일상 질문',
    usedMemoryIds: [], logs: [...base.logs, { kind: 'free', key: fq2.key }],
  };
}

/** 계획대로 첫마디를 건넨 뒤의 기록 (이력·회상 횟수·소식 전달 상태) */
export function commitOpening(db: DB, user: UserRow, plan: OpeningPlan, markRecalled: (id: number) => void): void {
  for (const l of plan.logs) logDialogue(db, user.id, l.kind, l.key);
  if (plan.memoryToMark) markRecalled(plan.memoryToMark);
  if (plan.postOffered) touchOffered(db, user.id, plan.postOffered);
  if (plan.postShown) markPost(db, user.id, plan.postShown, 'talked_at');
  if (plan.commentUsed) markCommentUsed(db, user.id, plan.commentUsed);
}

export const openingText = (p: OpeningPlan) => [p.greeting, p.note, p.question].filter(Boolean).join(' ');

/** 기억 이름을 말로 부르기 좋게 ("가족 이야기 — 손주" → "손주") */
export const spokenTitle = (m: Pick<Memory, 'title'>) => m.title.replace(/^가족 이야기 — /, '');
