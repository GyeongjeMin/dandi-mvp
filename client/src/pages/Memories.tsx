import { useCallback, useEffect, useMemo, useState } from 'react';
import Character from '../components/Character';
import { Button, Card, PageTitle, Spinner } from '../components/ui';
import { CATEGORY_META, CATEGORY_ORDER, ConfirmModal, MemoryCard, MemoryEditor, type MemoryDraft } from '../components/memory';
import { api, type Memory, type MemoryCategory, type MemoryComment } from '../lib/api';
import { navigate, useRoute } from '../lib/router';
import { useApp } from '../lib/store';

type Tab = 'all' | 'pending' | MemoryCategory;

export default function Memories() {
  const { toast, user } = useApp();
  const route = useRoute();
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [comments, setComments] = useState<Record<number, MemoryComment[]>>({});
  const [tab, setTab] = useState<Tab>((route.query.get('tab') as Tab) || 'all');
  const [editing, setEditing] = useState<Memory | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Memory | null>(null);
  const [questions, setQuestions] = useState<Record<number, { text: string; loading: boolean; mode?: string }>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api<{ memories: Memory[]; comments: Record<number, MemoryComment[]> }>('/memories')
    .then((r) => { setMemories(r.memories); setComments(r.comments ?? {}); }).catch((e) => toast(e.message, 'error')), [toast]);

  const toggleShare = async (m: Memory) => {
    try {
      await api(`/memories/${m.id}`, { method: 'PATCH', body: { shareFamily: !m.shareFamily } });
      toast(m.shareFamily ? '가족 공유를 껐어요' : '가족과 이 추억을 나눠요. 가족 화면에서 볼 수 있어요.');
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  useEffect(() => { load(); }, [load]);

  const confirmed = useMemo(() => (memories ?? []).filter((m) => m.status === 'confirmed'), [memories]);
  const pending = useMemo(() => (memories ?? []).filter((m) => m.status === 'pending'), [memories]);
  const shown = tab === 'pending' ? pending : tab === 'all' ? confirmed : confirmed.filter((m) => m.category === tab);

  const makeQuestion = async (m: Memory) => {
    setQuestions((q) => ({ ...q, [m.id]: { text: q[m.id]?.text ?? '', loading: true } }));
    try {
      const r = await api<{ question: string; mode: string }>(`/memories/${m.id}/recall-question`, { method: 'POST' });
      setQuestions((q) => ({ ...q, [m.id]: { text: r.question, loading: false, mode: r.mode } }));
    } catch (e) {
      setQuestions((q) => ({ ...q, [m.id]: { text: '', loading: false } }));
      toast((e as Error).message, 'error');
    }
  };

  const save = async (d: MemoryDraft & { tagsTouched: boolean }) => {
    setSaving(true);
    const { tagsTouched, tags, ...rest } = d;
    try {
      if (editing === 'new') {
        await api('/memories', { method: 'POST', body: { ...rest, tags } });
        toast('새 추억을 담았어요');
      } else if (editing) {
        await api(`/memories/${editing.id}`, { method: 'PATCH', body: { ...rest, ...(tagsTouched ? { tags } : {}) } });
        toast('추억을 고쳤어요. 대화와 친구 추천에도 바로 반영돼요.');
        setQuestions((q) => { const n = { ...q }; delete n[editing.id]; return n; });
      }
      setEditing(null);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmPending = async (m: Memory) => {
    try { await api(`/memories/${m.id}/confirm`, { method: 'POST', body: {} }); toast('나의 추억에 담았어요'); load(); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api(`/memories/${deleting.id}`, { method: 'DELETE' });
      toast('추억을 지웠어요. 이제 대화와 추천에 쓰이지 않아요.');
      setDeleting(null);
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  if (!memories) return <Spinner />;

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'all', label: '전체', count: confirmed.length },
    ...CATEGORY_ORDER.map((c) => ({ key: c as Tab, label: `${CATEGORY_META[c].icon} ${CATEGORY_META[c].label}`, count: confirmed.filter((m) => m.category === c).length })),
    { key: 'pending', label: '📝 확인 대기', count: pending.length },
  ];

  return (
    <div>
      <PageTitle title="나의 추억" subtitle={`${user?.nickname}님이 들려주신 이야기를 단디가 이렇게 기억하고 있어요.`}
        action={<Button variant="secondary" onClick={() => setEditing('new')}>＋ 직접 추가</Button>} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CATEGORY_ORDER.map((c) => {
          const n = confirmed.filter((m) => m.category === c).length;
          return (
            <button key={c} onClick={() => setTab(c)} className={`rounded-2xl p-3 text-left ${CATEGORY_META[c].bg} ${tab === c ? 'ring-3 ring-leaf-500' : ''}`}>
              <span className="text-2xl" aria-hidden>{CATEGORY_META[c].icon}</span>
              <span className={`block text-sm font-bold ${CATEGORY_META[c].text}`}>{CATEGORY_META[c].label}</span>
              <span className="block text-2xl font-black">{n}<span className="text-base font-bold">개</span></span>
            </button>
          );
        })}
      </div>

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-base font-bold ${tab === t.key ? 'border-leaf-600 bg-leaf-600 text-white' : 'border-cream-300 bg-white text-ink-soft'} ${t.key === 'pending' && t.count ? 'border-peach-200' : ''}`}>
            {t.label} {t.count}
          </button>
        ))}
      </div>

      {tab === 'pending' && pending.length > 0 && (
        <p className="mb-4 rounded-2xl bg-peach-50 p-4 text-lg text-peach-700">
          아직 확인하지 않은 이야기예요. <b>확인한 것만</b> 다음 대화와 친구 추천에 쓰여요. ‘단디의 짐작’은 사실인지 꼭 확인해 주세요.
        </p>
      )}

      {shown.length === 0 ? (
        <Card className="flex flex-col items-center py-10 text-center">
          <Character size={90} mood="think" />
          <p className="mt-3 text-xl font-bold">{tab === 'pending' ? '확인을 기다리는 이야기가 없어요' : '아직 여기에 담긴 추억이 없어요'}</p>
          <p className="mt-1 text-lg text-ink-soft">단디와 이야기를 나누면 소중한 추억이 하나씩 쌓여요.</p>
          <Button className="mt-4" onClick={() => navigate('/chat')}>단디와 이야기하기</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((m) => {
            const q = questions[m.id];
            return (
              <MemoryCard key={m.id} m={m}
                actions={m.status === 'pending' ? (
                  <>
                    <Button size="sm" onClick={() => confirmPending(m)}>{m.source === 'inferred' ? '맞아요, 기억해요' : '기억할게요'}</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>고치기</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(m)}>지우기</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="peach" onClick={() => makeQuestion(m)} disabled={q?.loading}>
                      {q?.loading ? '질문 만드는 중…' : q?.text ? '🔄 다른 질문' : '💡 회상 질문 만들기'}
                    </Button>
                    <Button size="sm" variant={m.shareFamily ? 'primary' : 'secondary'} onClick={() => toggleShare(m)} aria-pressed={m.shareFamily}>
                      {m.shareFamily ? '👪 가족과 공유 중' : '👪 가족과 공유'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>고치기</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(m)}>지우기</Button>
                  </>
                )}
                footer={<>{comments[m.id]?.length ? (
                  <ul className="mt-4 space-y-2 rounded-2xl bg-leaf-50 p-4" aria-label="가족이 남긴 말">
                    {comments[m.id].map((c) => (
                      <li key={c.id} className="text-base">
                        <b>{c.from}</b> {c.kind === 'question' ? '님의 질문' : '님'}: {c.content}
                        {c.kind === 'question' && <span className="ml-1 text-sm text-ink-faint">{c.usedAt ? '(단디가 여쭤봤어요)' : '(다음 대화에서 단디가 여쭤볼게요)'}</span>}
                      </li>
                    ))}
                  </ul>
                ) : null}{q?.text ? (
                  <div className="dandi-in mt-4 rounded-2xl bg-peach-50 p-4">
                    <p className="text-sm font-bold text-peach-700">단디의 회상 질문{q.mode === 'ai' ? ' · AI 생성' : q.mode === 'fallback' ? ' · 대체 질문' : ''}</p>
                    <p className="mt-1 text-xl font-bold">“{q.text}”</p>
                    <Button size="sm" className="mt-3" onClick={() => navigate(`/chat?memory=${m.id}&q=${encodeURIComponent(q.text)}`)}>이 질문으로 이야기 나누기</Button>
                  </div>
                ) : null}</>}
              />
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-base text-ink-faint">🔒 추억은 {user?.nickname}님만 볼 수 있어요. [가족과 공유]를 누른 추억만 연결된 가족이 볼 수 있고, 친구 추천에는 가족 이야기를 쓰지 않아요.</p>

      <MemoryEditor
        open={editing !== null}
        heading={editing === 'new' ? '추억 직접 추가하기' : '추억 고치기'}
        initial={editing === 'new'
          ? { category: 'hobby', title: '', detail: '', tags: [], useForMatching: true }
          : editing ? { category: editing.category, title: editing.title, detail: editing.detail, tags: editing.tags, useForMatching: editing.useForMatching } : null}
        onClose={() => setEditing(null)}
        onSave={save}
        saving={saving}
      />
      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} danger
        title="이 추억을 지울까요?" confirmLabel="지우기"
        body={<p>‘<b>{deleting?.title}</b>’을(를) 지우면 단디가 더 이상 기억하지 않고, 대화와 친구 추천에도 쓰지 않아요. 지운 뒤에는 되돌릴 수 없어요.</p>} />
    </div>
  );
}
