import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import Character from './Character';
import { api, isDeleted, type Conversation, type FamilyPost, type Memory, type Message, type SendResult } from '../lib/api';
import { VoiceSession, voiceSupport, type VoiceErrorKind, type VoiceState } from '../lib/voice';
import { avatarReducer, initialAvatarState, type AvatarEvent } from '../lib/avatar/machine';

// 3D 엔진(three.js)은 대화 화면을 열 때만 불러옵니다.
const Dandi3D = lazy(() => import('./Dandi3D'));

/** 3D 를 쓸 수 없을 때(또는 불러오는 동안) 보여 줄 사진 캐릭터 */
function StageFallback({ state }: { state: VoiceState }) {
  return (
    <div className="flex h-[min(44vh,380px)] items-center justify-center">
      <div className={state === 'speaking' ? 'dandi-talk' : state === 'thinking' ? 'dandi-tilt' : state === 'listening' ? 'dandi-bob' : ''}>
        <Character size={190} mood={state === 'thinking' ? 'think' : 'happy'} />
      </div>
    </div>
  );
}

import { navigate } from '../lib/router';
import { useApp } from '../lib/store';

/**
 * 어르신용 음성 대화 화면 — 버튼 한 번으로 시작, 대화 중에는 버튼을 다시 누를 필요 없음.
 * 화면 전체를 덮어 다른 메뉴에 방해받지 않게 하고, '대화 끝내기'는 항상 같은 자리에 크게 둡니다.
 */

const STATE_UI: Record<VoiceState, { label: string; tone: string }> = {
  idle: { label: '대화를 마쳤어요', tone: 'bg-cream-200 text-ink-soft' },
  preparing: { label: '준비하고 있어요', tone: 'bg-cream-200 text-ink-soft' },
  listening: { label: '듣고 있어요 · 편하게 말씀하세요', tone: 'bg-leaf-600 text-white' },
  thinking: { label: '생각하고 있어요', tone: 'bg-otter-500 text-white' },
  speaking: { label: '단디가 말하고 있어요', tone: 'bg-peach-600 text-white' },
  paused: { label: '잠시 쉬고 있어요', tone: 'bg-cream-300 text-ink' },
  error: { label: '도움이 필요해요', tone: 'bg-red-700 text-white' },
};

const HELP: Record<VoiceErrorKind, { title: string; steps: string[] }> = {
  permission: {
    title: '마이크 사용을 허용해 주세요',
    steps: [
      '컴퓨터(크롬·엣지): 주소창 왼쪽의 자물쇠(또는 ⓘ) 모양을 누르고 → ‘마이크’를 ‘허용’으로 바꿔 주세요.',
      '휴대폰: 브라우저 메뉴(⋮) → 설정 → 사이트 설정 → 마이크 → 이 사이트를 ‘허용’으로 바꿔 주세요.',
      '바꾼 뒤 아래 [다시 시도]를 눌러 주세요.',
    ],
  },
  'no-mic': {
    title: '마이크를 찾을 수 없어요',
    steps: ['마이크(또는 이어폰 마이크)가 꽂혀 있는지 확인해 주세요.', '다른 프로그램(화상통화 등)이 마이크를 쓰고 있다면 꺼 주세요.', '그다음 [다시 시도]를 눌러 주세요.'],
  },
  unsupported: {
    title: '이 브라우저는 음성 대화를 지원하지 않아요',
    steps: ['크롬, 엣지(컴퓨터·안드로이드) 또는 사파리(아이폰·아이패드)로 열어 주세요.', '그동안은 [글자로 이야기하기]로 단디와 이야기할 수 있어요.'],
  },
  insecure: {
    title: '이 주소에서는 마이크를 쓸 수 없어요',
    steps: ['브라우저는 보안 연결(https) 주소에서만 마이크를 허용해요.', '이 컴퓨터에서 실행 중이라면 주소창에 localhost:5173 으로 열어 주세요.', '그동안은 [글자로 이야기하기]를 쓸 수 있어요.'],
  },
  network: {
    title: '인터넷 연결이 불안정해요',
    steps: ['와이파이나 데이터 연결을 확인해 주세요. (크롬의 음성 인식은 인터넷이 필요해요)', '연결되면 [다시 시도]를 눌러 주세요.'],
  },
  server: {
    title: '단디가 잠깐 대답을 못 했어요',
    steps: ['잠시 뒤 [다시 시도]를 눌러 다시 말씀해 주세요.', '계속 안 되면 [대화 끝내기] 후 다시 시작해 주세요.'],
  },
};

export interface VoiceSummary { turns: number; confirmed: string[]; conversationId: number | null }

export default function VoiceTalk({ postId, rate, reduceMotion = false, onClose }: { postId?: number; rate: number; reduceMotion?: boolean; onClose: (s: VoiceSummary) => void }) {
  const { health, toast } = useApp();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [state, setState] = useState<VoiceState>('preparing');
  // 캐릭터 상태 머신 — 아래 VoiceSession 의 실제 이벤트로만 바뀜
  const [avatar, dispatchAvatar] = useReducer(avatarReducer, initialAvatarState);
  const sendAvatar = (e: AvatarEvent) => {
    // 시연·검증용 기록: 실제로 어떤 대화 이벤트가 캐릭터를 바꿨는지 (개발자 도구에서 window.__dandiAvatarLog)
    if (!(e.type === 'SPEECH' && e.kind === 'word') && e.type !== 'HEARD') {
      const w = window as unknown as { __dandiAvatarLog?: string[] };
      (w.__dandiAvatarLog ??= []).push(`${e.type}:${'phase' in e ? e.phase : 'emotion' in e ? e.emotion : 'kind' in e ? e.kind : ''}`);
    }
    dispatchAvatar(e);
  };
  useEffect(() => {
    const w = window as unknown as { __dandiAvatarLog?: string[] };
    (w.__dandiAvatarLog ??= []).push(`  ⇒ 캐릭터 ${avatar.mode}/${avatar.emotion}`);
  }, [avatar.mode, avatar.emotion]);
  const [caption, setCaption] = useState('');
  const [interim, setInterim] = useState('');
  const [lastUser, setLastUser] = useState('');
  const [error, setError] = useState<{ kind: VoiceErrorKind; message: string } | null>(null);
  const [pauseReason, setPauseReason] = useState<'silence' | 'error' | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [post, setPost] = useState<FamilyPost | null>(null);
  const [typed, setTyped] = useState('');
  const [showType, setShowType] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const confirmed = useRef<string[]>([]);
  const turnCount = useRef(0);
  const sess = useRef<VoiceSession | null>(null);
  const creating = useRef<Promise<{ conversation: Conversation }> | null>(null);
  const finished = useRef(false);

  const last = [...messages].reverse().find((m) => m.role === 'assistant') ?? null;
  const turns = messages.filter((m) => m.role === 'user').length;

  // 1) 대화 만들기 (개발 모드에서 두 번 실행돼도 한 번만 만들도록)
  useEffect(() => {
    let active = true;
    if (!creating.current) creating.current = api<{ conversation: Conversation }>('/conversations', { method: 'POST', body: { channel: 'voice', ...(postId ? { postId } : {}) } });
    creating.current.then((r) => {
      if (!active) return;
      setConv(r.conversation);
      setMessages(r.conversation.messages);
      const first = r.conversation.messages[0];
      if (first?.showPost) setPost(first.showPost);
    }).catch((e) => { if (active) { setError({ kind: 'server', message: (e as Error).message }); setState('error'); } });
    return () => { active = false; };
  }, [postId]);

  // 2) 음성 진행자 시작
  useEffect(() => {
    if (!conv) return;
    const s = new VoiceSession(conv.id, {
      onState: (st) => { setState(st); sendAvatar({ type: 'PHASE', phase: st }); if (st === 'listening' || st === 'thinking') { setError(null); setPauseReason(null); } },
      onInterim: (t) => { setInterim(t); if (t) sendAvatar({ type: 'HEARD', at: performance.now() }); },
      onMeta: (emotion) => sendAvatar({ type: 'EMOTION', emotion }),
      onSpeech: (kind) => sendAvatar({ type: 'SPEECH', kind, at: performance.now() }),
      onUserFinal: (t) => setLastUser(t),
      onDandiText: setCaption,
      onResult: (r: SendResult) => {
        turnCount.current++;
        setMessages((ms) => [...ms, r.userMessage, r.assistantMessage]);
        if (r.assistantMessage.showPost) setPost(r.assistantMessage.showPost);
        if (r.assistantMessage.confirmed.length) {
          confirmed.current.push(...r.assistantMessage.confirmed.map((c) => c.title));
          toast('나의 추억에 담았어요');
        }
      },
      onError: (kind, message) => setError({ kind, message }),
      onPaused: (reason) => setPauseReason(reason),
      onEnded: () => finish(conv.id),
    }, rate);
    sess.current = s;
    sendAvatar({ type: 'EMOTION', emotion: conv.messages[0]?.emotion ?? 'happy' }); // 첫 인사의 표정
    s.begin(conv.messages[0]?.content ?? '안녕하세요, 단디예요.');
    return () => { s.dispose(); if (sess.current === s) sess.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.id]);

  const finish = (id: number | null) => {
    if (finished.current) return;
    finished.current = true;
    if (id) api(`/conversations/${id}/end`, { method: 'POST' }).catch(() => {});
    onClose({ turns: turnCount.current, confirmed: confirmed.current, conversationId: id });
  };

  const end = () => {
    if (sess.current && sess.current.state !== 'idle') sess.current.end();
    else finish(conv?.id ?? null);
  };

  // 대화 화면이 열려 있는 동안 뒤쪽 화면이 스크롤되지 않게
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Esc 로도 끝내기 (키보드 사용자)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') end(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const say = (text: string) => { if (sess.current) sess.current.send(text); };
  const retry = () => {
    setError(null);
    if (!sess.current) return;
    if (state === 'error' && !messages.some((m) => m.role === 'user') && error?.kind !== 'server') sess.current.begin(last?.content ?? '');
    else sess.current.resume();
  };
  const goText = () => {
    sess.current?.dispose();
    finished.current = true;
    if (conv) api(`/conversations/${conv.id}/end`, { method: 'POST' }).catch(() => {});
    navigate(conv ? `/chat?c=${conv.id}` : '/chat');
  };

  const ui = STATE_UI[state];
  const sup = voiceSupport();
  const pending = last?.pendingAction;
  const demo = health?.mode === 'demo';

  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-cream-100" role="dialog" aria-modal="true" aria-label="단디와 음성 대화">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        {/* 상단: 상태 + 끝내기 */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-bold text-ink-soft">단디와 이야기 중{turns ? ` · ${turns}번째` : ''}</p>
          <button onClick={end} className="min-h-14 rounded-2xl border-2 border-red-200 bg-white px-5 text-lg font-extrabold text-red-700 hover:bg-red-50">
            대화 끝내기
          </button>
        </div>

        {/* 단디 캐릭터와 상태 */}
        <div className="mt-2 flex flex-col items-center">
          {/* 3D 단디 — 실제 대화 이벤트(상태 머신)로 움직임. 3D 를 못 쓰면 사진 캐릭터 */}
          <div className="relative w-full max-w-md">
            <div aria-hidden className={`absolute inset-x-[12%] bottom-[6%] top-[8%] rounded-full bg-gradient-to-b from-peach-50 to-cream-200 transition-shadow duration-700 ${state === 'listening' ? 'shadow-[0_0_0_8px_rgba(125,154,117,0.35)]' : state === 'speaking' ? 'shadow-[0_0_0_8px_rgba(246,195,177,0.6)]' : ''}`} />
            <Suspense fallback={<StageFallback state={state} />}>
              <Dandi3D state={avatar} reduceMotion={reduceMotion} interactive className="h-[min(44vh,380px)] w-full" fallback={<StageFallback state={state} />} />
            </Suspense>
          </div>
          <p className={`mt-1 inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-xl font-extrabold ${ui.tone}`} role="status" aria-live="polite">
            {state === 'listening' && <span aria-hidden className="h-3 w-3 animate-pulse rounded-full bg-white" />}
            {state === 'thinking' && <span aria-hidden className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="dandi-dot h-2 w-2 rounded-full bg-white" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>}
            {state === 'paused' && pauseReason === 'silence' ? '말씀이 없으셔서 잠시 쉬고 있어요' : ui.label}
          </p>
        </div>

        {/* 오류 안내 */}
        {error && (
          <section className="mt-4 rounded-3xl border-2 border-red-200 bg-white p-5" role="alert">
            <p className="text-xl font-extrabold text-red-700">{HELP[error.kind].title}</p>
            {error.kind === 'server' && <p className="mt-1 text-base text-ink-soft">{error.message}</p>}
            <ol className="mt-3 list-decimal space-y-2 pl-6 text-lg">
              {HELP[error.kind].steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              {error.kind !== 'unsupported' && error.kind !== 'insecure' && (
                <button onClick={retry} className="min-h-14 rounded-2xl bg-leaf-600 px-5 text-lg font-bold text-white">다시 시도</button>
              )}
              <button onClick={goText} className="min-h-14 rounded-2xl border-2 border-cream-300 bg-white px-5 text-lg font-bold">글자로 이야기하기</button>
            </div>
          </section>
        )}

        {/* 자막: 단디의 말 */}
        <section className="mt-5 rounded-3xl bg-white p-5 shadow-soft" aria-label="단디가 한 말">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-bold text-peach-700">단디</p>
            {last && last.mode !== 'ai' && (
              <span className="rounded-md bg-peach-50 px-2 py-0.5 text-xs font-bold text-peach-700">
                {last.mode === 'fallback' ? '대체 응답' : demo ? '데모 응답 · 미리 준비된 문장' : '준비된 안내'}
              </span>
            )}
          </div>
          <p className="mt-1 min-h-[3.5rem] text-2xl font-semibold leading-relaxed" aria-live="polite">
            {caption || last?.content || (state === 'preparing' ? '단디가 인사를 준비하고 있어요…' : '')}
          </p>
          {last?.usedMemories && last.usedMemories.length > 0 && (
            <p className="mt-2 text-base text-ink-soft">📒 떠올린 추억: {last.usedMemories.map((u) => `‘${u.title}’`).join(', ')}</p>
          )}
        </section>

        {/* 가족이 보낸 사진 */}
        {post && (
          <figure className="dandi-in mt-4 overflow-hidden rounded-3xl bg-white shadow-soft">
            {post.photoUrl && <img src={post.photoUrl} alt={`${post.from} 님이 보낸 사진`} className="max-h-[60vh] w-full bg-cream-200 object-contain" />}
            <figcaption className="p-4 text-lg"><b>{post.from}</b> 님 · {post.message || '사진을 보냈어요'}</figcaption>
          </figure>
        )}

        {/* 예/아니요로 대답할 질문 — 말로 해도 되고 눌러도 됨 */}
        {pending && (state === 'listening' || state === 'speaking' || state === 'paused') && (
          <div className="mt-4 rounded-3xl border-2 border-leaf-200 bg-leaf-50 p-4">
            <p className="text-lg font-bold text-leaf-700">{pending === 'memory_confirm' ? '📝 이 이야기를 기억해 둘까요?' : '💌 가족 소식을 지금 볼까요?'}</p>
            {pending === 'memory_confirm' && last?.candidates && (
              <p className="mt-1 text-lg">{last.candidates.filter((c): c is Memory => !isDeleted(c) && c.status === 'pending').map((c) => `‘${c.title}’`).join(', ')}</p>
            )}
            <p className="text-base text-ink-soft">“응” 또는 “아니”라고 말씀하시거나 버튼을 눌러 주세요.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => say(pending === 'memory_confirm' ? '응, 기억해 줘' : '응, 보여줘')} className="min-h-14 rounded-2xl bg-leaf-600 text-lg font-bold text-white">
                {pending === 'memory_confirm' ? '네, 기억해요' : '네, 볼래요'}
              </button>
              <button onClick={() => say(pending === 'memory_confirm' ? '아니, 기억하지 마' : '나중에 볼게')} className="min-h-14 rounded-2xl border-2 border-cream-300 bg-white text-lg font-bold">
                {pending === 'memory_confirm' ? '아니요' : '나중에'}
              </button>
            </div>
          </div>
        )}

        {/* 내가 한 말 */}
        {(interim || lastUser) && (
          <section className="mt-4 rounded-3xl bg-leaf-50 p-4" aria-label="내가 한 말">
            <p className="text-base font-bold text-leaf-700">{interim ? '듣고 있는 말' : '내가 한 말'}</p>
            <p className="mt-1 text-xl leading-relaxed">{interim || lastUser}</p>
          </section>
        )}

        {/* 조작 버튼 */}
        <div className="mt-5 grid gap-3">
          {state === 'speaking' && (
            <button onClick={() => sess.current?.interrupt()} className="min-h-16 rounded-2xl bg-ink text-xl font-bold text-white">
              ✋ 말 끊고 제가 말할게요
            </button>
          )}
          {state === 'paused' && !error && (
            <button onClick={retry} className="min-h-16 rounded-2xl bg-leaf-600 text-xl font-bold text-white">🎙️ 다시 듣기</button>
          )}
          {state === 'listening' && (
            <p className="text-center text-base text-ink-soft">말씀을 마치고 잠깐 기다리시면 단디가 대답해요.</p>
          )}
        </div>

        {/* 보조: 글자로 말하기 · 대화 내용 보기 */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => setShowType((v) => !v)} className="min-h-12 rounded-full border border-cream-300 bg-white px-4 text-base font-bold text-ink-soft" aria-expanded={showType}>
            ⌨️ 글자로 말하기
          </button>
          <button onClick={() => setShowLog((v) => !v)} className="min-h-12 rounded-full border border-cream-300 bg-white px-4 text-base font-bold text-ink-soft" aria-expanded={showLog}>
            📜 지금까지 나눈 이야기
          </button>
        </div>
        {showType && (
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { say(typed.trim()); setTyped(''); } }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={500} aria-label="단디에게 할 말"
              className="min-h-14 min-w-0 flex-1 rounded-2xl border-2 border-cream-300 bg-white px-4 text-lg" placeholder="여기에 적어도 돼요" />
            <button type="submit" disabled={!typed.trim() || state === 'thinking'} className="min-h-14 rounded-2xl bg-leaf-600 px-5 text-lg font-bold text-white disabled:opacity-50">보내기</button>
          </form>
        )}
        {showLog && (
          <ol className="mt-3 space-y-2">
            {messages.map((m) => (
              <li key={m.id} className={`rounded-2xl px-4 py-3 text-lg ${m.role === 'assistant' ? 'bg-white' : 'bg-leaf-50 text-right'}`}>
                <span className="sr-only">{m.role === 'assistant' ? '단디:' : '나:'}</span>{m.content}
              </li>
            ))}
          </ol>
        )}

        <p className="mt-auto pt-8 text-center text-sm text-ink-faint">
          {sup.stt ? '음성 인식·읽어 주기는 이 브라우저의 기능을 사용해요. ' : ''}
          대화 내용은 ‘지난 대화’에 저장되고, 단디는 허락하신 이야기만 기억해요.
        </p>
      </div>
    </div>
  );
}
