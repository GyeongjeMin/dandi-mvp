/**
 * 단디 대화 엔진
 * 흐름: 이용자 메시지 → (예/아니요 대기 중이면 바로 처리) → 관련 기억 검색 → 응답 생성(AI 스트리밍 또는 데모 규칙)
 *       → 기억 추출·검증·중복처리 → '확인 대기'로 저장 → 이용자가 화면 버튼이나 "응"으로 확인하면 확정
 *       → 다음 대화·추천에 사용
 */
import type { DB } from '../db/database.js';
import type { LLMProvider } from '../llm/providers.js';
import {
  extractionSystemPrompt, extractionUserPrompt, plannedOpeningPrompt, recallQuestionPrompt, replySystemPrompt, type ReplyContext,
} from '../llm/prompts.js';
import type { UserRow } from './users.js';
import {
  bumpEngagement, deleteMemory, getMemory, listMemories, markRecalled, pickMemoryForRecall, retrieveRelevant, updateMemory, type Memory,
} from './memories.js';
import { demoExtract, processExtraction, validateExtraction, type ExtractedMemory, type ProcessResult } from './extraction.js';
import { DEMO_FALLBACK, DEMO_SMALLTALK, demoAcknowledge, templateRecallQuestion } from './recall.js';
import {
  createConversation, getConversationRow, getMessage, insertMessage, lastAssistantMeta, recentDandiQuestions, recentTurns,
  renameFromFirstMessage, setConversationPost, type Channel, type MessageMeta, type MessageMode,
} from './conversations.js';
import { getTagDef } from './tags.js';
import { eun, joinKo } from './josa.js';
import { getPrefs } from './prefs.js';
import { commitOpening, openingText, planOpening, showPostText, spokenTitle, type PendingAction } from './opening.js';
import { getPost, markPost } from './family.js';
import { checkReminder, dueReminders } from './reminders.js';
import { classifyEmotion, type Emotion } from './emotion.js';

export interface Engine { provider: LLMProvider | null }

function cleanAiText(s: string): string {
  return s.replace(/^["“]|["”]$/g, '').replace(/\*\*/g, '').trim().slice(0, 600);
}

// ── 짧은 대답 이해 (예 / 아니요 / 대화 끝) ─────────────

const NO = /^(아니|아냐|아뇨|싫어|싫다|안 ?돼|안 ?할래|하지 ?마|됐어|됐다|나중에|다음에|안 ?볼래|그만)/;
const YES = /^(응|으응|어+[,.!\s]|어+$|예|네|넹|그래|그럼|좋아|좋지|좋다|맞아|맞다|보여 ?줘|볼래|봐야지|보자|기억해|기억 ?해 ?줘|그렇게 해|해 ?줘|오냐|그러자|그러렴|당연하지)/;

export function classifyYesNo(text: string): 'yes' | 'no' | null {
  const t = text.trim().replace(/^(음+|어+|아+)[,.\s]+/, '');
  if (t.length > 20) return null;
  if (NO.test(t)) return 'no';
  if (YES.test(t)) return 'yes';
  return null;
}

const END = /(이제 그만|그만 (할게|하자|얘기|이야기)|이만 (할게|하자|끊)|끝내자|끝낼게|이제 잘게|자러 갈게|다음에 (또 )?(하자|이야기하자|얘기하자)|안녕히 (가|계)|오늘은 여기까지)/;
const ATE = /(약|밥|식사|진지).{0,6}(먹었|드셨|챙겼|먹을게|먹었어|했어)/;

// ── 대화 시작 ──────────────────────────────────

export async function startConversation(
  db: DB, engine: Engine, user: UserRow,
  opts: { memoryId?: number; question?: string; postId?: number; channel?: Channel } = {},
) {
  const channel: Channel = opts.channel === 'voice' ? 'voice' : 'text';
  const conv = createConversation(db, user.id, channel);
  const prefs = getPrefs(db, user.id);
  const plan = planOpening(db, user, prefs, opts);

  let content = openingText(plan);
  let mode: MessageMode = engine.provider ? (plan.polishable ? 'ai' : 'template') : 'demo';
  let notice: string | undefined;

  if (engine.provider && plan.polishable) {
    try {
      const p = plannedOpeningPrompt(
        { nickname: user.nickname, ageBand: user.age_band },
        { greeting: plan.greeting, template: [plan.note, plan.question].filter(Boolean).join(' '), topicNote: plan.topicNote },
        { channel, replyLength: prefs.replyLength, avoidTopics: prefs.avoidTopics },
      );
      const text = cleanAiText(await engine.provider.complete({ system: p.system, messages: [{ role: 'user', content: p.instruction }], maxTokens: 300 }));
      if (text.length >= 5) content = text;
      else { mode = 'fallback'; }
    } catch (e) {
      console.warn('[단디] AI 인사 생성 실패 → 준비된 문장 사용:', (e as Error).message);
      mode = 'fallback';
      notice = 'AI 연결에 문제가 있어 미리 준비된 문장으로 대신했어요.';
    }
  }

  if (plan.showPostId) setConversationPost(db, user.id, conv.id, plan.showPostId);
  commitOpening(db, user, plan, (id) => markRecalled(db, user.id, id));
  insertMessage(db, user.id, conv.id, 'assistant', content, mode, {
    usedMemoryIds: plan.usedMemoryIds, notice, pendingAction: plan.pendingAction, showPostId: plan.showPostId,
    reminderIds: plan.dueReminders.map((r) => r.id), openingKind: plan.kind,
    emotion: 'happy', // 반가운 인사
  });
  return conv.id;
}

// ── 회상 질문 만들기 (나의 추억 화면) ─────────────

export async function makeRecallQuestion(db: DB, engine: Engine, user: UserRow, memory: Memory) {
  let question = templateRecallQuestion(memory);
  let mode: MessageMode = 'demo';
  if (engine.provider) {
    try {
      const p = recallQuestionPrompt(memory);
      const q = cleanAiText(await engine.provider.complete({ system: p.system, messages: [{ role: 'user', content: p.instruction }], maxTokens: 200 }));
      if (q.length >= 5 && q.length <= 200) { question = q; mode = 'ai'; } else mode = 'fallback';
    } catch (e) {
      console.warn('[단디] AI 회상 질문 실패 → 템플릿 사용:', (e as Error).message);
      mode = 'fallback';
    }
  }
  markRecalled(db, user.id, memory.id);
  return { question, mode, memoryId: memory.id };
}

// ── 메시지 처리 ───────────────────────────────

export interface HandleOptions {
  channel?: Channel;
  /** 답을 만드는 대로 조금씩 받기 (음성 대화에서 첫 문장을 빨리 읽기 위해) */
  onDelta?: (text: string) => void;
  /** 답을 만들기 전에 정해지는 정보 (캐릭터 표정) — 첫 조각보다 먼저 보냄 */
  onMeta?: (m: { emotion: Emotion }) => void;
}

export async function handleUserMessage(db: DB, engine: Engine, user: UserRow, conversationId: number, text: string, opts: HandleOptions = {}) {
  const conv = getConversationRow(db, user.id, conversationId);
  if (!conv) throw Object.assign(new Error('대화를 찾을 수 없어요.'), { status: 404 });
  const channel: Channel = opts.channel ?? conv.channel ?? 'text';
  const emit = opts.onDelta ?? (() => {});
  const prefs = getPrefs(db, user.id);

  const history = recentTurns(db, conversationId, 12);
  const lastAssistant = [...history].reverse().find((t) => t.role === 'assistant')?.content ?? null;
  const prevMeta = lastAssistantMeta(db, conversationId);
  const userMsgId = insertMessage(db, user.id, conversationId, 'user', text, engine.provider ? 'ai' : 'demo');
  const convTitle = renameFromFirstMessage(db, conv, text);
  const templateMode: MessageMode = engine.provider ? 'template' : 'demo';
  // 캐릭터 표정: 어르신 말에 분명한 표현이 있을 때만 기쁨·공감, 아니면 중립
  let emotion: Emotion = classifyEmotion(text);

  const finish = (content: string, mode: MessageMode, meta: MessageMeta) => {
    const assistantId = insertMessage(db, user.id, conversationId, 'assistant', content, mode, meta);
    return {
      userMessage: getMessage(db, user.id, userMsgId)!,
      assistantMessage: getMessage(db, user.id, assistantId)!,
      conversationTitle: convTitle,
    };
  };

  // 0) 지난 질문에 기억을 꺼냈고, 어르신이 길게 이야기해 주셨다면 '좋아하는 주제'로 기록
  if (prevMeta.usedMemoryIds?.length && text.replace(/\s/g, '').length >= 15) bumpEngagement(db, user.id, prevMeta.usedMemoryIds);

  // 1) 예/아니요를 기다리던 질문에 대한 대답이면 바로 처리 (AI 호출 없이 빠르게)
  const answer = prevMeta.pendingAction ? classifyYesNo(text) : null;
  if (prevMeta.pendingAction && answer) {
    const r = resolvePending(db, user, conversationId, prevMeta.pendingAction, answer);
    emotion = answer === 'yes' ? 'happy' : 'neutral'; // 사진 보기·기억 저장에 "응" → 반가운 표정
    opts.onMeta?.({ emotion });
    emit(r.text);
    return finish(r.text, templateMode, { ...r.meta, emotion });
  }

  // 2) 음성 대화를 마치자는 말
  if (channel === 'voice' && END.test(text)) {
    const bye = '네, 오늘도 이야기 나눠 주셔서 고마워요. 편안히 쉬세요. 또 이야기하고 싶으실 때 불러 주세요.';
    opts.onMeta?.({ emotion: 'happy' });
    emit(bye);
    return finish(bye, templateMode, { endSession: true, emotion: 'happy' });
  }

  // 3) "약 먹었어" → 지금 안내 중인 알림 확인
  let prefix = '';
  const reminderIds: number[] = [];
  if (ATE.test(text)) {
    for (const r of dueReminders(db, user.id)) { checkReminder(db, user.id, r.id); reminderIds.push(r.id); }
    if (reminderIds.length) prefix = '잘하셨어요, 알림에 확인해 둘게요.';
  }
  opts.onMeta?.({ emotion });
  if (prefix) emit(`${prefix} `);

  const relevant = retrieveRelevant(db, user.id, text, 8);
  const consent = !!user.consent_memory;
  const demo = demoExtract(text);
  const warnings: string[] = [];
  const post = conv.family_post_id ? getPost(db, user.id, conv.family_post_id) : undefined;
  const ctx: ReplyContext = {
    channel, replyLength: prefs.replyLength, avoidTopics: prefs.avoidTopics,
    familyNote: post ? `${post.from} 님이 보낸 소식: “${post.message || '(글 없음)'}” (사진 ${post.photoUrl ? '있음 — 어르신이 지금 보고 계심' : '없음'})` : null,
    recentQuestions: recentDandiQuestions(db, user.id, 8),
  };

  // 4) 응답 생성과 기억 추출 (AI 모드에서는 두 요청을 동시에)
  let replyText: string | null = null;
  let mode: MessageMode = engine.provider ? 'ai' : 'demo';
  let extracted: ExtractedMemory[] = demo.items;

  if (engine.provider) {
    const provider = engine.provider;
    const known = listMemories(db, user.id);
    const confirmed = known.filter((m) => m.status === 'confirmed');
    const replyReq = {
      system: replySystemPrompt({ nickname: user.nickname, ageBand: user.age_band }, confirmed.slice(0, 20), relevant.filter((r) => r.relevance > 0).map((r) => r.memory.id), ctx),
      messages: [...history, { role: 'user' as const, content: text }],
      maxTokens: channel === 'voice' ? 250 : 400,
    };
    let streamed = '';
    const replyPromise = opts.onDelta
      ? provider.stream(replyReq, (d) => { const c = d.replace(/\*\*/g, ''); streamed += c; emit(c); })
      : provider.complete(replyReq);
    const [replyRes, extractRes] = await Promise.allSettled([
      replyPromise,
      consent
        ? provider.complete({
          system: extractionSystemPrompt(known.slice(0, 30)),
          messages: [{ role: 'user', content: extractionUserPrompt(lastAssistant, text) }],
          maxTokens: 600, temperature: 0,
        })
        : Promise.resolve('{"memories":[]}'),
    ]);
    if (replyRes.status === 'fulfilled') replyText = cleanAiText(replyRes.value);
    else if (streamed.trim()) {
      // 스트림 도중 끊김: 이미 들려드린 부분까지만 답으로 남김
      replyText = cleanAiText(streamed);
      warnings.push('AI 연결이 중간에 끊겨 답이 짧게 끝났어요.');
    } else {
      console.warn('[단디] AI 응답 실패 → 데모 응답 사용:', replyRes.reason?.message);
      warnings.push('AI 연결에 문제가 있어 이번 답은 미리 준비된 문장으로 대신했어요.');
      mode = 'fallback';
    }
    if (extractRes.status === 'fulfilled') {
      const v = validateExtraction(extractRes.value);
      if (v.errors.length) console.warn('[단디] 기억 추출 형식 오류(해당 항목 제외):', v.errors.join(' / '));
      extracted = v.items;
      if (v.items.length === 0 && v.errors.length && !/memories/.test(extractRes.value)) extracted = demo.items;
    } else {
      console.warn('[단디] AI 기억 추출 실패 → 규칙 기반 추출 사용:', extractRes.reason?.message);
      extracted = demo.items;
    }
  }

  // 5) 기억 저장 (동의한 경우에만, '확인 대기' 상태로)
  let result: ProcessResult = { created: [], alreadyKnown: [] };
  if (consent && extracted.length) {
    result = processExtraction(db, user.id, extracted, { conversationId, conversationTitle: convTitle, messageId: userMsgId });
  }

  // 6) 데모(또는 대체) 응답
  const used: number[] = relevant.filter((r) => r.relevance > 0).map((r) => r.memory.id);
  let deferred: string | null = null;
  const voiceConfirm = channel === 'voice' ? result.created.filter((m) => m.source !== 'inferred') : [];
  if (replyText === null) {
    const r = demoReply(db, user, text, demo, consent ? result : null, extracted, relevant.filter((x) => x.relevance > 0).map((x) => x.memory), history.length, prefs.avoidTopics);
    // 음성 대화에서 기억 후보가 생기면: 공감 → "기억해 둬도 될까요?" (꼬리 질문은 대답 뒤로 미룸)
    if (voiceConfirm.length && r.parts) { replyText = r.parts.ack; deferred = r.parts.follow; } else replyText = r.text;
    if (r.usedMemoryId && !used.includes(r.usedMemoryId)) used.push(r.usedMemoryId);
    emit(replyText);
  }
  replyText = [prefix, replyText].filter(Boolean).join(' ');

  // 7) 음성 대화: 화면을 보지 않아도 되도록 말로 기억 저장 여부를 여쭤봄
  let pendingAction: PendingAction | undefined;
  if (voiceConfirm.length) {
    const titles = joinKo(voiceConfirm.slice(0, 2).map((m) => `‘${spokenTitle(m)}’`));
    const ask = `${deferred === null ? '그리고 ' : ''}방금 말씀하신 ${titles} 이야기, 단디가 기억해 둬도 될까요?`;
    emit(` ${ask}`);
    replyText = `${replyText} ${ask}`;
    pendingAction = { type: 'memory_confirm', memoryIds: voiceConfirm.map((m) => m.id), deferred };
  }

  const meta: MessageMeta = {
    candidateIds: result.created.map((m) => m.id),
    alreadyKnownIds: result.alreadyKnown.map((m) => m.id),
    usedMemoryIds: used.slice(0, 4),
    notice: warnings[0],
    pendingAction,
    reminderIds: reminderIds.length ? reminderIds : undefined,
    emotion,
  };
  if (!consent && demo.items.length) meta.notice = '기억 저장이 꺼져 있어 이 이야기는 저장하지 않았어요. (설정에서 켤 수 있어요)';
  return finish(replyText, mode, meta);
}

/** 예/아니요를 기다리던 질문 처리 */
function resolvePending(db: DB, user: UserRow, conversationId: number, action: PendingAction, answer: 'yes' | 'no'): { text: string; meta: MessageMeta } {
  if (action.type === 'family_post') {
    const post = getPost(db, user.id, action.postId);
    if (!post) return { text: '그 소식은 이제 찾을 수가 없네요. 대신 오늘은 어떤 이야기를 나눠 볼까요?', meta: {} };
    if (answer === 'yes') {
      markPost(db, user.id, post.id, 'talked_at');
      setConversationPost(db, user.id, conversationId, post.id);
      return { text: showPostText(post), meta: { showPostId: post.id } };
    }
    return { text: '알겠어요. 가족 소식은 나중에 ‘가족 소식’에서 언제든 보실 수 있어요. 그럼 오늘은 어떤 이야기를 나눠 볼까요?', meta: {} };
  }
  // 기억 확인
  const pending = action.memoryIds.map((id) => getMemory(db, user.id, id)).filter((m): m is Memory => !!m && m.status === 'pending');
  if (answer === 'yes') {
    for (const m of pending) updateMemory(db, user.id, m.id, { status: 'confirmed' });
    const tail = action.deferred ?? '아까 하시던 이야기도 더 들려주세요.';
    return {
      text: `고마워요, 잘 기억해 둘게요. 언제든 ‘나의 추억’에서 고치거나 지울 수 있어요. ${tail}`,
      meta: { confirmedIds: pending.map((m) => m.id), usedMemoryIds: pending.map((m) => m.id) },
    };
  }
  for (const m of pending) deleteMemory(db, user.id, m.id);
  const tail = action.deferred ?? '편하게 다른 이야기도 들려주세요.';
  return { text: `알겠어요, 그 이야기는 기억하지 않을게요. ${tail}`, meta: { rejectedIds: pending.map((m) => m.id) } };
}

const PRIORITY: Memory['category'][] = ['work', 'life_event', 'hobby', 'place', 'daily', 'family'];

function demoReply(
  db: DB, user: UserRow, text: string, demo: ReturnType<typeof demoExtract>, result: ProcessResult | null,
  extracted: ExtractedMemory[], relevantMemories: Memory[], turnCount: number, avoid: string[],
): { text: string; usedMemoryId?: number; parts?: { ack: string; follow: string } } {
  // (가) 새로 알게 된 이야기: 공감 + 꼬리 질문
  const fresh = (result ? result.created.map((m) => ({ category: m.category, title: m.title, tags: m.tags, source: m.source }))
    : extracted.map((e) => ({ category: e.category, title: e.title, tags: e.tags, source: e.certainty })))
    .filter((f) => f.source !== 'inferred');
  if (fresh.length) {
    fresh.sort((a, b) => PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category));
    const main = fresh[0];
    const mainTag = main.category === 'place'
      ? main.tags[0]
      : main.tags.find((t) => getTagDef(t)?.category === main.category) ?? main.tags[0] ?? main.title;
    const place = main.tags.find((t) => getTagDef(t)?.category === 'place') ?? null;
    const [ack, follow] = demoAcknowledge(mainTag, main.category, place);
    const others = fresh.slice(1).filter((f) => f.category !== 'place' || !main.tags.includes(f.tags[0])).map((f) => f.title.replace(/^가족 이야기 — /, ''));
    const extra = others.length ? ` ${eun(joinKo(others))} 다음에 더 들려주세요.` : '';
    return { text: `${ack}${extra} ${follow}`, parts: { ack: `${ack}${extra}`, follow } };
  }
  // (나) 이미 알고 있는 이야기: 저장된 기억으로 회상 질문
  const known = result?.alreadyKnown ?? [];
  const knownConfirmed = known.find((m) => m.status === 'confirmed');
  if (knownConfirmed) {
    markRecalled(db, user.id, knownConfirmed.id);
    return { text: `${knownConfirmed.title} 이야기는 단디가 잘 기억하고 있어요. ${templateRecallQuestion(knownConfirmed)}`, usedMemoryId: knownConfirmed.id };
  }
  if (known.length) return { text: '그 이야기는 지금 기억해도 될지 여쭤보는 중이에요. 화면에서 [기억할게요]를 눌러 주시면 다음에도 이어서 이야기할 수 있어요. 조금 더 들려주시겠어요?' };
  // (다) 부정 표현
  if (demo.negated.length) {
    return { text: `아, ${eun(demo.negated[0].def.tag)} 별로 안 좋아하시는군요. 알려 주셔서 고마워요. 그럼 요즘은 어떤 걸 하실 때 즐거우세요?` };
  }
  // (라) 감정·인사 등 일상 대화
  const small = DEMO_SMALLTALK.find((s) => s.test.test(text));
  if (small) return { text: small.reply };
  // (마) 저장된 기억과 관련된 말
  if (relevantMemories[0]) {
    const m = relevantMemories[0];
    markRecalled(db, user.id, m.id);
    return { text: `전에 말씀해 주신 ${m.title} 이야기가 떠오르네요. ${templateRecallQuestion(m)}`, usedMemoryId: m.id };
  }
  // (바) 가끔은 저장된 기억으로 회상 질문
  const recall = turnCount % 4 === 3 ? pickMemoryForRecall(db, user.id, { avoid }) : undefined;
  if (recall) {
    markRecalled(db, user.id, recall.id);
    return { text: `그러셨군요. 참, ${templateRecallQuestion(recall)}`, usedMemoryId: recall.id };
  }
  return { text: DEMO_FALLBACK[Math.floor(turnCount / 2) % DEMO_FALLBACK.length] };
}
