import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Character from '../components/Character';
import { Button, Card, Spinner } from '../components/ui';
import { CATEGORY_META } from '../components/memory';
import {
  ApiError, familyApi, getFamilyToken, setFamilyToken, type FamilyPost, type MemoryCategory, type MemoryComment, type Reminder,
} from '../lib/api';
import { formatDate } from '../lib/format';

/**
 * 가족·보호자용 화면 (#/family)
 * - 어르신 계정과 별개: 어르신이 만든 6자리 초대 숫자로 연결 → 이 브라우저에 가족 전용 열쇠(토큰) 저장
 * - 볼 수 있는 것은 어르신이 '공유'를 켠 정보뿐. 대화 원문은 볼 수 없음.
 */

interface Dashboard {
  elder: { nickname: string; ageBand: string };
  me: { id: number; name: string; relation: string; label: string };
  sharing: { activity: boolean; topics: boolean; memories: number };
  activity: { shared: false } | {
    shared: true; lastUsedAt: string | null; conversations7d: number; voiceConversations7d: number; minutes7d: number;
    days: Array<{ date: string; conversations: number }>; enoughData: boolean;
  };
  topics: { shared: false } | { shared: true; list: Array<{ tag: string; count: number }>; enoughData: boolean };
  memories: Array<{ id: number; category: MemoryCategory; categoryLabel: string; title: string; detail: string; createdAt: string; comments: MemoryComment[] }>;
  posts: FamilyPost[];
  exchange: { sent: number; seen: number; talked: number };
  reminders: Reminder[];
}

type Tab = 'status' | 'send' | 'memories' | 'reminders';
const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'status', label: '돌봄 현황', icon: '📊' },
  { key: 'send', label: '소식 보내기', icon: '💌' },
  { key: 'memories', label: '공유된 추억', icon: '📖' },
  { key: 'reminders', label: '알림 관리', icon: '💊' },
];

export default function FamilyApp() {
  const [token, setToken] = useState(getFamilyToken());
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('status');
  const [toastMsg, setToastMsg] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const toast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    setToastMsg({ text, tone });
    window.setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const load = useCallback(async () => {
    if (!getFamilyToken()) return;
    try {
      setData(await familyApi<Dashboard>('/dashboard'));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setFamilyToken(null); setToken(null); setData(null); setError((e as Error).message); }
      else setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load, token]);

  useEffect(() => {
    const prev = document.title;
    document.title = '단디 가족 · 함께 돌보기';
    return () => { document.title = prev; };
  }, []);

  const disconnect = async () => {
    try { await familyApi('/me', { method: 'DELETE' }); } catch { /* 이미 끊김 */ }
    setFamilyToken(null); setToken(null); setData(null);
  };

  return (
    <div className="min-h-dvh bg-cream-100 pb-16">
      <header className="sticky top-0 z-40 border-b border-cream-200 bg-cream-100/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Character size={42} />
          <div className="leading-tight">
            <p className="text-xl font-black">단디 가족</p>
            <p className="text-sm font-bold text-ink-faint">{data ? `${data.elder.nickname}님과 함께 돌보기` : '가족·보호자용 화면'}</p>
          </div>
          <a href="#/intro" className="ml-auto min-h-11 rounded-full px-3 py-2 text-base font-bold text-ink-soft hover:bg-cream-200">단디 소개</a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-5">
        {!token ? (
          <Connect onConnected={(t) => { setFamilyToken(t); setToken(t); }} notice={error} />
        ) : !data ? (
          error ? <Card><p className="text-lg">{error}</p><Button className="mt-3" onClick={load}>다시 시도</Button></Card> : <Spinner />
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="가족 화면 메뉴">
              {TABS.map((t) => (
                <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                  className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl text-lg font-bold ${tab === t.key ? 'bg-ink text-white' : 'bg-white text-ink-soft shadow-soft'}`}>
                  <span aria-hidden>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
            {tab === 'status' && <Status d={data} go={setTab} />}
            {tab === 'send' && <Send d={data} reload={load} toast={toast} />}
            {tab === 'memories' && <SharedMemories d={data} reload={load} toast={toast} />}
            {tab === 'reminders' && <Reminders d={data} reload={load} toast={toast} />}

            <div className="mt-10 rounded-3xl bg-white p-5 text-base text-ink-soft">
              <p className="font-bold text-ink">🔒 가족 화면에서 볼 수 있는 것</p>
              <p className="mt-1">{data.elder.nickname}님이 공유하기로 정한 정보만 보여요. 단디와 나눈 대화 내용은 가족에게 보이지 않아요. 공유 범위는 어르신이 언제든 바꾸거나 연결을 끊을 수 있어요.</p>
              <p className="mt-2 text-sm">이 화면은 평가용 시연 프로토타입(MVP)이에요. 실제 서비스 전에는 휴대폰 본인인증 같은 로그인 보안이 더해져야 해요.</p>
              <button onClick={disconnect} className="mt-3 min-h-11 rounded-xl border border-cream-300 px-4 text-base font-bold">이 기기에서 연결 끊기 ({data.me.label})</button>
            </div>
          </>
        )}
      </main>

      {toastMsg && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" aria-live="polite">
          <div className={`dandi-in rounded-2xl px-5 py-3 text-lg font-bold text-white shadow-soft ${toastMsg.tone === 'ok' ? 'bg-leaf-700' : 'bg-red-700'}`}>{toastMsg.text}</div>
        </div>
      )}
    </div>
  );
}

// ── 연결하기 ─────────────────────────────────

const RELATIONS = ['딸', '아들', '며느리', '사위', '손녀', '손자', '배우자', '형제·자매', '보호자'];

function Connect({ onConnected, notice }: { onConnected: (token: string) => void; notice: string | null }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('딸');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(notice);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await familyApi<{ token: string }>('/connect', { method: 'POST', body: { code, name, relation } });
      onConnected(r.token);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-lg">
      <div className="flex flex-col items-center text-center">
        <Character size={120} />
        <h1 className="mt-3 text-3xl font-black">가족과 함께 돌봐요</h1>
        <p className="mt-2 text-lg text-ink-soft">어르신 화면의 <b>더보기 → 가족 연결과 알림</b>에서 6자리 초대 숫자를 받아 적어 주세요.</p>
      </div>
      <Card className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-lg font-bold">초대 숫자 6자리</span>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-2xl border-2 border-cream-300 px-4 py-3 text-center font-mono text-3xl tracking-[0.4em]" placeholder="000000" />
        </label>
        <label className="block">
          <span className="mb-1 block text-lg font-bold">내 이름</span>
          <input maxLength={12} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-2xl border-2 border-cream-300 px-4 py-3 text-lg" placeholder="예: 지영" />
        </label>
        <div>
          <span className="mb-1 block text-lg font-bold">어르신과의 관계</span>
          <div className="flex flex-wrap gap-2">
            {RELATIONS.map((r) => (
              <button key={r} type="button" onClick={() => setRelation(r)} aria-pressed={relation === r}
                className={`min-h-11 rounded-full border-2 px-4 text-base font-bold ${relation === r ? 'border-leaf-500 bg-leaf-50 text-leaf-700' : 'border-cream-300 bg-white text-ink-soft'}`}>{r}</button>
            ))}
          </div>
        </div>
        {err && <p className="rounded-2xl bg-red-50 p-3 text-base font-bold text-red-700" role="alert">{err}</p>}
        <Button className="w-full" disabled={busy || code.length !== 6 || !name.trim()} onClick={submit}>{busy ? '연결 중…' : '연결하기'}</Button>
      </Card>
      <Card className="mt-4 space-y-2 text-base text-ink-soft">
        <p className="text-lg font-bold text-ink">연결하면 할 수 있는 일</p>
        <p>📊 어르신이 단디와 이야기한 날짜·횟수 확인 (어르신이 공유를 켠 경우)</p>
        <p>💌 사진과 메시지 보내기 — 단디가 어르신께 “같이 보실까요?” 하고 전해 드려요</p>
        <p>📖 어르신이 공유한 추억 보기, 댓글·질문 남기기</p>
        <p>💊 복약·생활 알림 관리</p>
        <p className="pt-1">🔒 대화 내용은 볼 수 없어요.</p>
      </Card>
    </div>
  );
}

// ── 돌봄 현황 ────────────────────────────────

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-cream-100 p-4">
      <p className="text-base font-bold text-ink-soft">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      {hint && <p className="text-sm text-ink-faint">{hint}</p>}
    </div>
  );
}

function relative(iso: string | null): string {
  if (!iso) return '아직 없어요';
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60000);
  if (m < 60) return `${Math.max(1, m)}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

function Status({ d, go }: { d: Dashboard; go: (t: Tab) => void }) {
  const a = d.activity;
  const t = d.topics;
  const max = a.shared ? Math.max(1, ...a.days.map((x) => x.conversations)) : 1;
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-2xl font-extrabold">{d.elder.nickname}님의 단디 이용</h2>
        {!a.shared ? (
          <p className="mt-2 rounded-2xl bg-cream-100 p-4 text-lg text-ink-soft">어르신이 이용 현황 공유를 켜지 않으셨어요. 어르신 화면의 ‘가족 연결과 알림’에서 켤 수 있어요.</p>
        ) : (
          <>
            {!a.enoughData && (
              <p className="mt-2 rounded-2xl bg-peach-50 p-4 text-base text-peach-700">아직 대화 기록이 적어 흐름을 말하기 어려워요. 기록이 쌓이면 더 정확해져요. (아래 숫자는 실제 기록 그대로예요)</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="마지막 대화" value={relative(a.lastUsedAt)} hint={a.lastUsedAt ? formatDate(a.lastUsedAt, true) : undefined} />
              <Stat label="최근 7일 대화" value={`${a.conversations7d}번`} hint={`그중 음성 ${a.voiceConversations7d}번`} />
              <Stat label="최근 7일 대화 시간" value={`약 ${a.minutes7d}분`} hint="대화당 최대 60분으로 계산" />
              <Stat label="대화한 날" value={`${a.days.filter((x) => x.conversations > 0).length}일`} hint="최근 7일 중" />
            </div>
            <div className="mt-5" aria-label="최근 7일 날짜별 대화 수">
              <div className="flex h-28 items-end gap-2">
                {a.days.map((x) => (
                  <div key={x.date} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-sm font-bold text-ink-soft">{x.conversations || ''}</span>
                    <div className={`w-full rounded-t-lg ${x.conversations ? 'bg-leaf-500' : 'bg-cream-200'}`} style={{ height: `${Math.max(6, (x.conversations / max) * 80)}px` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-2">
                {a.days.map((x) => <span key={x.date} className="flex-1 text-center text-xs text-ink-faint">{Number(x.date.slice(8))}일</span>)}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="text-xl font-extrabold">주로 이야기한 관심사 <span className="text-base font-normal text-ink-soft">(최근 2주)</span></h2>
        {!t.shared ? (
          <p className="mt-2 text-lg text-ink-soft">어르신이 대화 주제 공유를 켜지 않으셨어요.</p>
        ) : !t.enoughData ? (
          <p className="mt-2 text-lg text-ink-soft">아직 관심사를 말하기엔 대화가 부족해요.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {t.list.map((x) => <span key={x.tag} className="rounded-full bg-leaf-50 px-4 py-1.5 text-lg font-bold text-leaf-700">#{x.tag} <span className="text-base font-normal">{x.count}번</span></span>)}
          </div>
        )}
        <p className="mt-3 text-sm text-ink-faint">관심사 이름만 보여요. 어떤 말을 했는지는 보이지 않아요. 감정·건강 상태를 분석하는 기능은 없어요.</p>
      </Card>

      <Card>
        <h2 className="text-xl font-extrabold">가족과의 교류 <span className="text-base font-normal text-ink-soft">(최근 30일)</span></h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="보낸 소식" value={d.exchange.sent} />
          <Stat label="어르신이 보심" value={d.exchange.seen} />
          <Stat label="단디와 이야기" value={d.exchange.talked} hint="그 소식으로 대화" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => go('send')}>💌 소식 보내기</Button>
          <Button size="sm" variant="secondary" onClick={() => go('memories')}>📖 공유된 추억 {d.memories.length}개</Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-extrabold">오늘의 알림</h2>
        {d.reminders.filter((r) => r.enabled).length === 0 ? <p className="mt-2 text-lg text-ink-soft">등록된 알림이 없어요.</p> : (
          <ul className="mt-3 space-y-2">
            {d.reminders.filter((r) => r.enabled).map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-cream-100 p-3 text-lg">
                <span aria-hidden>{r.kind === 'medication' ? '💊' : '⏰'}</span>
                <span className="flex-1 font-bold">{r.timeLabel} {r.label}</span>
                <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${r.checkedToday ? 'bg-leaf-100 text-leaf-700' : 'bg-white text-ink-faint'}`}>{r.checkedToday ? '오늘 확인함' : '아직 확인 전'}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-ink-faint">어르신이 단디 화면에서 [했어요]를 누르거나 “약 먹었어”라고 말씀하시면 ‘확인함’이 돼요. 화면이 닫혀 있을 때는 알림이 가지 않아요.</p>
      </Card>
    </div>
  );
}

// ── 소식 보내기 ───────────────────────────────

/** 사진을 긴 변 1280px 이하 JPEG 로 줄여서 보냅니다(데이터 절약, 서버 저장 용량 제한). */
async function resizePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('사진을 열 수 없어요. 다른 사진을 골라 주세요.'));
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const postStatus = (p: FamilyPost) =>
  p.talkedAt ? { label: '단디와 함께 이야기함', tone: 'bg-leaf-100 text-leaf-700' }
    : p.seenAt ? { label: '어르신이 보심', tone: 'bg-leaf-50 text-leaf-700' }
      : p.offeredAt ? { label: '단디가 소개함', tone: 'bg-peach-50 text-peach-700' }
        : { label: '전달 대기 · 다음 대화 때 소개해요', tone: 'bg-cream-200 text-ink-soft' };

function Send({ d, reload, toast }: { d: Dashboard; reload: () => void; toast: (t: string, tone?: 'ok' | 'error') => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { setPhoto(await resizePhoto(f)); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const send = async () => {
    setBusy(true);
    try {
      await familyApi('/posts', { method: 'POST', body: { message, photo } });
      toast('보냈어요. 단디가 다음 대화 때 어르신께 전해 드려요.');
      setPhoto(null); setMessage('');
      if (fileRef.current) fileRef.current.value = '';
      reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const remove = async (p: FamilyPost) => {
    try { await familyApi(`/posts/${p.id}`, { method: 'DELETE' }); toast('소식을 지웠어요'); reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <h2 className="text-2xl font-extrabold">{d.elder.nickname}님께 소식 보내기</h2>
        <p className="text-lg text-ink-soft">사진이나 메시지를 보내면, 어르신이 다음에 단디와 이야기할 때 단디가 “{d.me.label} 님이 사진을 보내왔어요. 같이 보실까요?” 하고 전해 드려요.</p>
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="family-photo" onChange={(e) => pick(e.target.files?.[0])} />
          <label htmlFor="family-photo" className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-cream-300 bg-white text-lg font-bold text-ink-soft hover:bg-cream-50">
            📷 {photo ? '다른 사진 고르기' : '사진 고르기 (선택)'}
          </label>
          {photo && (
            <div className="relative mt-3">
              <img src={photo} alt="보낼 사진 미리보기" className="max-h-80 w-full rounded-2xl bg-cream-200 object-contain" />
              <button onClick={() => { setPhoto(null); if (fileRef.current) fileRef.current.value = ''; }} className="absolute right-2 top-2 min-h-11 rounded-full bg-white px-4 text-base font-bold shadow-soft">사진 빼기</button>
            </div>
          )}
        </div>
        <label className="block">
          <span className="mb-1 block text-lg font-bold">메시지</span>
          <textarea rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-2xl border-2 border-cream-300 bg-white px-4 py-3 text-lg"
            placeholder="예: 엄마, 민준이 첫 운동회 사진이에요! 달리기에서 1등 했어요." />
          <span className="text-sm text-ink-faint">단디가 이 글을 읽어 드리고 이야기를 이어가요. 사진 속 내용은 단디가 알 수 없어서, 사진 설명을 함께 적어 주시면 더 좋아요.</span>
        </label>
        <Button className="w-full" disabled={busy || (!photo && !message.trim())} onClick={send}>{busy ? '보내는 중…' : '보내기'}</Button>
      </Card>

      <Card>
        <h2 className="text-xl font-extrabold">보낸 소식</h2>
        {d.posts.length === 0 ? <p className="mt-2 text-lg text-ink-soft">아직 보낸 소식이 없어요.</p> : (
          <ul className="mt-3 space-y-3">
            {d.posts.map((p) => {
              const st = postStatus(p);
              return (
                <li key={p.id} className="flex gap-3 rounded-2xl border border-cream-200 bg-white p-3">
                  {p.photoUrl ? <img src={p.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-cream-200 object-cover" /> : <span aria-hidden className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-cream-100 text-3xl">✉️</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-faint">{p.from} · {formatDate(p.createdAt, true)}</p>
                    <p className="truncate text-lg">{p.message || '(사진만 보냄)'}</p>
                    <span className={`mt-1 inline-block rounded-full px-3 py-0.5 text-sm font-bold ${st.tone}`}>{st.label}</span>
                  </div>
                  {p.mine && <button onClick={() => remove(p)} className="self-start rounded-lg px-2 py-1 text-sm font-bold text-ink-faint hover:bg-cream-100" aria-label="이 소식 지우기">지우기</button>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── 공유된 추억 ───────────────────────────────

function SharedMemories({ d, reload, toast }: { d: Dashboard; reload: () => void; toast: (t: string, tone?: 'ok' | 'error') => void }) {
  const [drafts, setDrafts] = useState<Record<number, { kind: 'comment' | 'question'; text: string }>>({});
  const send = async (id: number) => {
    const dr = drafts[id];
    if (!dr?.text.trim()) return;
    try {
      await familyApi(`/memories/${id}/comments`, { method: 'POST', body: { kind: dr.kind, content: dr.text } });
      toast(dr.kind === 'question' ? '질문을 남겼어요. 단디가 다음 대화에서 대신 여쭤봐요.' : '댓글을 남겼어요');
      setDrafts((x) => ({ ...x, [id]: { kind: dr.kind, text: '' } }));
      reload();
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const del = async (c: MemoryComment) => {
    try { await familyApi(`/comments/${c.id}`, { method: 'DELETE' }); reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  if (d.memories.length === 0) {
    return (
      <Card className="flex flex-col items-center py-10 text-center">
        <Character size={100} mood="think" />
        <p className="mt-3 text-xl font-bold">아직 공유된 추억이 없어요</p>
        <p className="mt-1 max-w-md text-lg text-ink-soft">어르신이 ‘나의 추억’에서 [가족과 공유]를 누른 추억만 여기에 보여요. 어떤 추억을 나눌지는 어르신이 정해요.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-white p-4 text-base text-ink-soft">💬 <b>질문</b>을 남기면 단디가 다음 대화에서 어르신께 대신 여쭤봐요. 어르신의 대답은 자동으로 전해지지 않아요(대화 내용 비공개).</p>
      {d.memories.map((m) => {
        const meta = CATEGORY_META[m.category];
        const dr = drafts[m.id] ?? { kind: 'question' as const, text: '' };
        return (
          <Card key={m.id}>
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-sm font-bold ${meta.bg} ${meta.text}`}><span aria-hidden>{meta.icon}</span>{meta.label}</span>
            <h3 className="mt-2 text-2xl font-extrabold">{m.title}</h3>
            {m.detail && <p className="mt-1 text-lg text-ink-soft">{m.detail}</p>}
            <p className="mt-1 text-sm text-ink-faint">{formatDate(m.createdAt)} 대화에서</p>
            {m.comments.length > 0 && (
              <ul className="mt-4 space-y-2">
                {m.comments.map((c) => (
                  <li key={c.id} className="rounded-2xl bg-cream-100 p-3 text-base">
                    <b>{c.from}</b>{c.kind === 'question' ? ' · 질문' : ''}: {c.content}
                    {c.kind === 'question' && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${c.usedAt ? 'bg-leaf-100 text-leaf-700' : 'bg-white text-ink-faint'}`}>{c.usedAt ? `단디가 여쭤봤어요 (${formatDate(c.usedAt)})` : '다음 대화에서 여쭤볼 예정'}</span>}
                    {c.mine && <button onClick={() => del(c)} className="ml-2 text-sm font-bold text-ink-faint underline">지우기</button>}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 space-y-2">
              <div className="flex gap-2" role="group" aria-label="남길 글 종류">
                {(['question', 'comment'] as const).map((k) => (
                  <button key={k} onClick={() => setDrafts((x) => ({ ...x, [m.id]: { ...dr, kind: k } }))} aria-pressed={dr.kind === k}
                    className={`min-h-11 rounded-full border-2 px-4 text-base font-bold ${dr.kind === k ? 'border-leaf-500 bg-leaf-50 text-leaf-700' : 'border-cream-300 bg-white text-ink-soft'}`}>
                    {k === 'question' ? '❓ 질문 (단디가 대신 여쭤봄)' : '💬 댓글'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={dr.text} maxLength={200} onChange={(e) => setDrafts((x) => ({ ...x, [m.id]: { ...dr, text: e.target.value } }))}
                  className="min-h-12 min-w-0 flex-1 rounded-2xl border-2 border-cream-300 bg-white px-4 text-lg"
                  placeholder={dr.kind === 'question' ? '예: 엄마, 그 식당 이름이 뭐였어요?' : '예: 이 이야기 처음 들어요!'} aria-label="댓글이나 질문" />
                <Button size="sm" disabled={!dr.text.trim()} onClick={() => send(m.id)}>남기기</Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── 알림 관리 ─────────────────────────────────

function Reminders({ d, reload, toast }: { d: Dashboard; reload: () => void; toast: (t: string, tone?: 'ok' | 'error') => void }) {
  const [form, setForm] = useState({ kind: 'medication' as Reminder['kind'], label: '', time: '08:00' });
  const add = async () => {
    try { await familyApi('/reminders', { method: 'POST', body: form }); toast('알림을 만들었어요'); setForm({ ...form, label: '' }); reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const patch = async (r: Reminder, body: Partial<Reminder>) => {
    try { await familyApi(`/reminders/${r.id}`, { method: 'PATCH', body }); reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const del = async (r: Reminder) => {
    try { await familyApi(`/reminders/${r.id}`, { method: 'DELETE' }); toast('알림을 지웠어요'); reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <h2 className="text-2xl font-extrabold">복약·생활 알림</h2>
        <p className="rounded-2xl bg-peach-50 p-4 text-base text-peach-700">
          어르신이 단디 화면을 열어 두셨을 때 첫 화면과 단디의 인사로 알려 드려요. <b>휴대폰 푸시 알림·문자·전화는 아직 지원하지 않아요.</b> 의학적 판단이나 복약 지도는 하지 않아요.
        </p>
        {d.reminders.length === 0 ? <p className="text-lg text-ink-soft">등록된 알림이 없어요.</p> : (
          <ul className="space-y-2">
            {d.reminders.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-2 rounded-2xl border border-cream-200 p-3 ${r.enabled ? 'bg-white' : 'bg-cream-100 opacity-70'}`}>
                <span aria-hidden className="text-2xl">{r.kind === 'medication' ? '💊' : '⏰'}</span>
                <input type="time" defaultValue={r.time} onBlur={(e) => e.target.value !== r.time && patch(r, { time: e.target.value })} aria-label={`${r.label} 시간`}
                  className="min-h-11 rounded-xl border-2 border-cream-300 bg-white px-2 text-lg" />
                <span className="min-w-0 flex-1 text-lg font-bold">{r.label}</span>
                <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${r.checkedToday ? 'bg-leaf-100 text-leaf-700' : 'bg-cream-100 text-ink-faint'}`}>{r.checkedToday ? '오늘 확인함' : '확인 전'}</span>
                <Button size="sm" variant="secondary" onClick={() => patch(r, { enabled: !r.enabled })}>{r.enabled ? '끄기' : '켜기'}</Button>
                <Button size="sm" variant="ghost" onClick={() => del(r)}>지우기</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="space-y-3">
        <h3 className="text-xl font-extrabold">새 알림</h3>
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Reminder['kind'] })} className="min-h-12 rounded-xl border-2 border-cream-300 bg-white px-2 text-lg" aria-label="알림 종류">
            <option value="medication">💊 약</option>
            <option value="life">⏰ 생활</option>
          </select>
          <input value={form.label} maxLength={30} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="예: 혈압약, 점심 식사, 산책" aria-label="알림 내용"
            className="min-h-12 rounded-xl border-2 border-cream-300 bg-white px-3 text-lg" />
          <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} aria-label="알림 시간" className="min-h-12 rounded-xl border-2 border-cream-300 bg-white px-2 text-lg" />
        </div>
        <Button disabled={!form.label.trim()} onClick={add}>알림 만들기</Button>
      </Card>
    </div>
  );
}
