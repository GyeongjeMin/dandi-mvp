import { useCallback, useEffect, useRef, useState } from 'react';
import Character from '../components/Character';
import { Button, Modal, Spinner } from '../components/ui';
import { CATEGORY_META, ConfirmModal, MemoryEditor, SourceBadge, type MemoryDraft } from '../components/memory';
import {
  api, isDeleted, type Conversation, type ConversationSummary, type Memory, type MemoryRef, type Message,
} from '../lib/api';
import { formatDate } from '../lib/format';
import { navigate, useRoute } from '../lib/router';
import { canListen, canSpeak, listen, speak } from '../lib/speech';
import { useApp } from '../lib/store';

const EXAMPLES = [
  '젊었을 때 진주에서 작은 식당을 운영했었지.',
  '요즘은 텃밭 가꾸기를 좋아해.',
  '예전에 주말마다 등산을 다녔어.',
  '손주들이 너무 보고 싶어.',
];

export default function Chat() {
  const { user, health, toast } = useApp();
  const route = useRoute();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<{ msgId: number; memory: Memory } | null>(null);
  const handled = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stopListen = useRef<(() => void) | null>(null);

  // 화면 진입: ?c=대화번호 / ?memory=기억번호(회상 대화 시작) / ?new=1 / 없으면 최근 대화 이어가기
  useEffect(() => {
    if (handled.current === route.key) return;
    handled.current = route.key;
    const q = route.query;
    const run = async () => {
      try {
        if (q.get('memory') || q.get('new')) {
          const body = q.get('memory') ? { memoryId: Number(q.get('memory')), ...(q.get('q') ? { question: q.get('q') } : {}) } : {};
          setConv(null);
          const r = await api<{ conversation: Conversation }>('/conversations', { method: 'POST', body });
          setConv(r.conversation);
          navigate(`/chat?c=${r.conversation.id}`, { replace: true });
          return;
        }
        if (q.get('c')) {
          if (conv?.id === Number(q.get('c'))) return;
          const r = await api<{ conversation: Conversation }>(`/conversations/${q.get('c')}`);
          setConv(r.conversation);
          return;
        }
        const list = await api<{ conversations: ConversationSummary[] }>('/conversations');
        if (q.get('history')) { setHistory(list.conversations); setHistoryOpen(true); }
        if (list.conversations[0]) navigate(`/chat?c=${list.conversations[0].id}`, { replace: true });
        else navigate('/chat?new=1', { replace: true });
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    };
    run();
  }, [route.key, route.query, conv?.id, toast]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conv?.messages.length, sending]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || !conv || sending) return;
    stopListen.current?.();
    const temp: Message = {
      id: -Date.now(), role: 'user', content, mode: 'demo', createdAt: new Date().toISOString(),
      candidates: [], alreadyKnown: [], usedMemories: [], notice: null,
      pendingAction: null, showPost: null, confirmed: [], endSession: false, emotion: 'neutral',
    };
    setConv({ ...conv, messages: [...conv.messages, temp] });
    setInput('');
    setSending(true);
    try {
      const r = await api<{ userMessage: Message; assistantMessage: Message; conversationTitle: string }>(
        `/conversations/${conv.id}/messages`, { method: 'POST', body: { content } });
      setConv((c) => c && {
        ...c, title: r.conversationTitle,
        messages: [...c.messages.filter((m) => m.id !== temp.id), r.userMessage, r.assistantMessage],
      });
    } catch (e) {
      setConv((c) => c && { ...c, messages: c.messages.filter((m) => m.id !== temp.id) });
      setInput(content);
      toast((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const replaceCandidate = useCallback((msgId: number, next: MemoryRef) => {
    setConv((c) => c && {
      ...c,
      messages: c.messages.map((m) => (m.id === msgId ? { ...m, candidates: m.candidates.map((x) => (x.id === next.id ? next : x)) } : m)),
    });
  }, []);

  const confirm = async (msgId: number, m: Memory, patch?: Record<string, unknown>) => {
    try {
      const r = await api<{ memory: Memory }>(`/memories/${m.id}/confirm`, { method: 'POST', body: patch ?? {} });
      replaceCandidate(msgId, r.memory);
      toast('나의 추억에 담았어요');
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const reject = async (msgId: number, m: Memory) => {
    try {
      await api(`/memories/${m.id}`, { method: 'DELETE' });
      replaceCandidate(msgId, { id: m.id, deleted: true });
      toast('기억하지 않기로 했어요');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    try { setHistory((await api<{ conversations: ConversationSummary[] }>('/conversations')).conversations); } catch { /* 무시 */ }
  };

  const removeConversation = async () => {
    if (!conv) return;
    try {
      await api(`/conversations/${conv.id}`, { method: 'DELETE' });
      setDeleteOpen(false);
      toast('대화 기록을 지웠어요. 확인한 추억은 그대로 남아 있어요.');
      handled.current = null;
      setConv(null);
      navigate('/chat', { replace: true });
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const toggleMic = () => {
    if (listening) { stopListen.current?.(); return; }
    setListening(true);
    stopListen.current = listen((t) => setInput(t), () => { setListening(false); stopListen.current = null; });
  };

  if (!conv) return <Spinner label="단디가 대화를 준비하고 있어요…" />;
  const demo = health?.mode === 'demo';

  return (
    <div className="flex flex-col">
      {/* 상단 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black">{conv.title}</h1>
          <p className="text-base text-ink-soft">{formatDate(conv.createdAt, true)} 시작</p>
        </div>
        <Button size="sm" variant="secondary" onClick={openHistory}>지난 대화</Button>
        <Button size="sm" onClick={() => navigate('/chat?new=1')}>＋ 새 이야기</Button>
      </div>

      {!user?.consentMemory && (
        <div className="mb-3 rounded-2xl border-2 border-cream-300 bg-white p-4 text-base">
          🔒 지금은 <b>추억 기억하기가 꺼져 있어요.</b> 단디는 이번 대화만 보고 대답하고, 새로 기억하지 않아요.{' '}
          <a className="font-bold text-leaf-700 underline" href="#/settings">설정에서 켜기</a>
        </div>
      )}

      {/* 메시지 */}
      <div className="space-y-5 pb-4" aria-live="polite">
        {conv.messages.map((m) => (
          <MessageBubble key={m.id} m={m} demo={demo}
            onConfirm={(mem) => confirm(m.id, mem)}
            onReject={(mem) => reject(m.id, mem)}
            onEdit={(mem) => setEditing({ msgId: m.id, memory: mem })}
            onAnswer={m.id === conv.messages[conv.messages.length - 1]?.id && m.pendingAction === 'family_post' && !sending ? send : undefined} />
        ))}
        {sending && (
          <div className="flex items-end gap-3">
            <Character size={48} mood="think" />
            <div className="rounded-3xl rounded-bl-md bg-white px-5 py-4 shadow-soft">
              <span className="flex gap-1.5" aria-label="단디가 생각하는 중">
                {[0, 1, 2].map((i) => <span key={i} className="dandi-dot h-2.5 w-2.5 rounded-full bg-leaf-500" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력 */}
      <div className="sticky bottom-[4.6rem] z-30 -mx-4 border-t border-cream-200 bg-cream-100/95 px-4 pb-3 pt-3 backdrop-blur md:bottom-0">
        <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-sm font-bold text-peach-700">🎬 시연용 예시</span>
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => setInput(e)} className="shrink-0 rounded-full border border-peach-200 bg-white px-3 py-1.5 text-base text-ink-soft hover:bg-peach-50">
              {e}
            </button>
          ))}
        </div>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          {canListen() && (
            <button type="button" onClick={toggleMic} aria-label={listening ? '말하기 멈추기' : '말로 입력하기'}
              className={`flex h-14 w-12 shrink-0 items-center sm:w-14 justify-center rounded-2xl text-2xl ${listening ? 'animate-pulse bg-peach-500 text-white' : 'border-2 border-cream-300 bg-white'}`}>
              🎤
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
            rows={1}
            maxLength={500}
            placeholder={listening ? '듣고 있어요…' : '이야기를 들려주세요'}
            aria-label="메시지 입력"
            className="max-h-40 min-h-14 min-w-0 flex-1 resize-none rounded-2xl border-2 border-cream-300 bg-white px-3 py-3.5 text-base sm:px-4 sm:py-3 sm:text-lg focus:border-leaf-500 focus:outline-none"
          />
          <Button type="submit" disabled={!input.trim() || sending} className="h-14 shrink-0 !px-4 sm:!px-5">보내기</Button>
        </form>
        <p className="mt-1.5 hidden text-center text-sm text-ink-faint sm:block">
          {demo ? '데모 모드: 단디의 말은 미리 준비된 규칙으로 만들어져요 · 기억 저장과 추천 계산은 실제로 동작해요' : 'AI가 만든 답은 틀릴 수 있어요 · 단디는 [기억할게요]를 누른 이야기만 기억해요'}
        </p>
      </div>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="지난 대화"
        footer={<Button variant="danger" onClick={() => { setHistoryOpen(false); setDeleteOpen(true); }}>지금 대화 기록 지우기</Button>}>
        <div className="space-y-2">
          {history.map((h) => (
            <a key={h.id} href={`#/chat?c=${h.id}`} onClick={() => setHistoryOpen(false)}
              className={`block rounded-2xl border-2 p-3 ${h.id === conv.id ? 'border-leaf-500 bg-leaf-50' : 'border-cream-200 bg-white'}`}>
              <span className="block text-lg font-bold">{h.title}</span>
              <span className="block text-sm text-ink-soft">{formatDate(h.lastMessageAt, true)} · 메시지 {h.messageCount}개</span>
            </a>
          ))}
          {!history.length && <p className="text-ink-soft">불러오는 중…</p>}
        </div>
      </Modal>

      <ConfirmModal open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={removeConversation} danger
        title="이 대화 기록을 지울까요?" confirmLabel="대화 기록 지우기"
        body={<p>주고받은 말이 모두 지워져요. 이미 <b>[기억할게요]</b>로 확인한 추억은 ‘나의 추억’에 그대로 남아요.</p>} />

      <MemoryEditor
        open={!!editing}
        heading="고쳐서 기억하기"
        initial={editing ? { category: editing.memory.category, title: editing.memory.title, detail: editing.memory.detail, tags: editing.memory.tags, useForMatching: editing.memory.useForMatching } : null}
        onClose={() => setEditing(null)}
        onSave={async (d: MemoryDraft & { tagsTouched: boolean }) => {
          if (!editing) return;
          const { tagsTouched, tags, ...rest } = d;
          await confirm(editing.msgId, editing.memory, { ...rest, ...(tagsTouched ? { tags } : {}) });
          setEditing(null);
        }}
      />
    </div>
  );
}

function MessageBubble({ m, demo, onConfirm, onReject, onEdit, onAnswer }: {
  m: Message; demo: boolean; onConfirm: (m: Memory) => void; onReject: (m: Memory) => void; onEdit: (m: Memory) => void; onAnswer?: (t: string) => void;
}) {
  if (m.role === 'user') {
    return (
      <div className="dandi-in flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-md bg-leaf-600 px-5 py-3 text-xl leading-relaxed text-white shadow-soft">{m.content}</div>
      </div>
    );
  }
  const modeLabel = m.mode === 'ai' ? null : m.mode === 'fallback' ? '대체 응답' : demo ? '데모 응답' : m.mode === 'template' ? '준비된 안내' : '준비된 질문';
  return (
    <div className="dandi-in flex items-start gap-3">
      <Character size={48} className="mt-1 shrink-0" />
      <div className="min-w-0 max-w-[88%] space-y-2">
        <div className="rounded-3xl rounded-tl-md bg-white px-5 py-3 shadow-soft">
          <p className="text-xl leading-relaxed">{m.content}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {modeLabel && <span className="rounded-md bg-peach-50 px-2 py-0.5 text-xs font-bold text-peach-700">{modeLabel}</span>}
            {canSpeak() && (
              <button onClick={() => speak(m.content)} className="rounded-lg px-2 py-1 text-sm font-bold text-leaf-700 hover:bg-leaf-50" aria-label="단디의 말 소리로 듣기">
                🔊 읽어 주기
              </button>
            )}
          </div>
        </div>
        {m.showPost && (
          <figure className="overflow-hidden rounded-3xl bg-white shadow-soft">
            {m.showPost.photoUrl && <img src={m.showPost.photoUrl} alt={`${m.showPost.from} 님이 보낸 사진`} className="max-h-96 w-full bg-cream-200 object-contain" />}
            <figcaption className="p-3 text-base"><b>{m.showPost.from}</b> 님 · {m.showPost.message || '사진'}</figcaption>
          </figure>
        )}
        {onAnswer && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onAnswer('응, 보여줘')}>네, 볼래요</Button>
            <Button size="sm" variant="secondary" onClick={() => onAnswer('나중에 볼게')}>나중에</Button>
          </div>
        )}
        {m.usedMemories.length > 0 && (
          <p className="text-sm text-ink-soft">📒 단디가 떠올린 추억: {m.usedMemories.map((u) => `‘${u.title}’`).join(', ')}</p>
        )}
        {m.alreadyKnown.filter((k) => !isDeleted(k)).length > 0 && (
          <p className="text-sm text-ink-soft">✔︎ 이미 기억하고 있는 이야기라 다시 저장하지 않았어요: {m.alreadyKnown.filter((k): k is Memory => !isDeleted(k)).map((k) => `‘${k.title}’`).join(', ')}</p>
        )}
        {m.notice && <p className="rounded-xl bg-peach-50 px-3 py-2 text-sm font-semibold text-peach-700">ℹ️ {m.notice}</p>}
        {m.candidates.length > 0 && <CandidateBox candidates={m.candidates} onConfirm={onConfirm} onReject={onReject} onEdit={onEdit} />}
      </div>
    </div>
  );
}

function CandidateBox({ candidates, onConfirm, onReject, onEdit }: {
  candidates: MemoryRef[]; onConfirm: (m: Memory) => void; onReject: (m: Memory) => void; onEdit: (m: Memory) => void;
}) {
  const pending = candidates.filter((c): c is Memory => !isDeleted(c) && c.status === 'pending');
  return (
    <div className="rounded-3xl border-2 border-leaf-200 bg-leaf-50 p-4">
      <p className="text-lg font-extrabold text-leaf-700">
        {pending.length ? '📝 단디가 이 이야기를 기억해도 될까요?' : '📝 기억하기 확인'}
      </p>
      {pending.length > 0 && <p className="text-sm text-ink-soft">기억한 이야기는 다음 대화와 친구 추천에 쓰여요. ‘나의 추억’에서 언제든 고치거나 지울 수 있어요.</p>}
      <ul className="mt-3 space-y-3">
        {candidates.map((c) => {
          if (isDeleted(c)) return <li key={c.id} className="rounded-2xl bg-white/70 px-4 py-3 text-base text-ink-faint">기억하지 않기로 한 이야기예요.</li>;
          const meta = CATEGORY_META[c.category];
          return (
            <li key={c.id} className="rounded-2xl bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${meta.bg} ${meta.text}`}>{meta.icon} {meta.label}</span>
                <SourceBadge m={c} />
              </div>
              <p className="mt-2 text-xl font-extrabold">{c.title}</p>
              {c.detail && <p className="text-base text-ink-soft">{c.detail}</p>}
              {c.status === 'confirmed' ? (
                <p className="mt-2 text-base font-bold text-leaf-700">✔︎ 나의 추억에 담았어요</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onConfirm(c)}>{c.source === 'inferred' ? '맞아요, 기억해요' : '기억할게요'}</Button>
                  <Button size="sm" variant="secondary" onClick={() => onEdit(c)}>고쳐서 기억</Button>
                  <Button size="sm" variant="ghost" onClick={() => onReject(c)}>{c.source === 'inferred' ? '아니에요' : '기억하지 마세요'}</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
