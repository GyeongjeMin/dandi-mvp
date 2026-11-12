import { useEffect, useState } from 'react';
import Character from '../components/Character';
import { Button, Card, Spinner } from '../components/ui';
import { CATEGORY_META, CATEGORY_ORDER, MemoryCard } from '../components/memory';
import { api, type HomeData } from '../lib/api';
import { formatDate, greetingWord, todayLabel } from '../lib/format';
import { navigate } from '../lib/router';
import { useApp } from '../lib/store';

export default function Home() {
  const { toast } = useApp();
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    api<HomeData>('/home').then(setData).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  if (!data) return <Spinner />;
  const u = data.user;
  const topic = data.recentMemories[0];

  return (
    <div className="space-y-6">
      {/* 인사 */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-leaf-100 via-cream-50 to-peach-50 p-6 md:p-8">
        <div className="flex flex-col items-center gap-5 text-center md:flex-row md:text-left">
          <Character size={128} bob />
          <div className="flex-1">
            <p className="text-lg font-bold text-leaf-700">{todayLabel()}</p>
            <h1 className="mt-1 text-[1.9rem] font-black leading-snug md:text-4xl">{greetingWord()}, {u.nickname}님!</h1>
            <p className="mt-2 text-xl text-ink-soft">
              {data.confirmedCount > 0
                ? <>단디가 {u.nickname}님의 추억 <b className="text-ink">{data.confirmedCount}가지</b>를 소중히 기억하고 있어요.</>
                : '오늘은 어떤 이야기를 들려주실래요? 단디가 귀 기울여 들을게요.'}
            </p>
          </div>
        </div>
        {topic && (
          <div className="mt-6 rounded-3xl bg-white/80 p-5 shadow-soft">
            <p className="text-base font-bold text-peach-700">☕ 오늘의 이야깃거리</p>
            <p className="mt-1 text-xl font-bold">“{topic.title}” 이야기를 더 나눠 볼까요?</p>
            <Button variant="peach" className="mt-3 w-full sm:w-auto" onClick={() => navigate(`/chat?memory=${topic.id}`)}>이 추억으로 이야기 시작하기</Button>
          </div>
        )}
      </section>

      {data.pendingCount > 0 && (
        <button onClick={() => navigate('/memories?tab=pending')}
          className="flex w-full items-center gap-4 rounded-3xl border-2 border-peach-200 bg-peach-50 p-5 text-left">
          <span className="text-3xl" aria-hidden>📝</span>
          <span className="flex-1">
            <span className="block text-xl font-extrabold text-peach-700">기억해도 될지 여쭤볼 이야기가 {data.pendingCount}개 있어요</span>
            <span className="block text-lg text-ink-soft">눌러서 확인해 주세요. 확인한 것만 단디가 기억해요.</span>
          </span>
          <span className="text-2xl text-peach-700" aria-hidden>›</span>
        </button>
      )}

      {/* 큰 버튼 3개 */}
      <section className="grid gap-4 md:grid-cols-3" aria-label="무엇을 할까요">
        {[
          { to: '/chat', icon: '💬', title: '단디와 이야기하기', desc: '옛날이야기, 요즘 이야기 무엇이든', tone: 'bg-leaf-600 text-white hover:bg-leaf-700', sub: 'text-leaf-100' },
          { to: '/memories', icon: '📒', title: '나의 추억 보기', desc: '단디가 기억하는 이야기 모음', tone: 'bg-white hover:bg-cream-50 border-2 border-cream-200', sub: 'text-ink-soft' },
          { to: '/friends', icon: '🤝', title: '동네 친구 찾기', desc: '취미와 경험이 비슷한 분 소개', tone: 'bg-peach-500 text-white hover:bg-peach-600', sub: 'text-peach-50' },
        ].map((b) => (
          <button key={b.to} onClick={() => navigate(b.to)} className={`flex min-h-32 items-center gap-4 rounded-3xl p-5 text-left shadow-soft transition-colors md:flex-col md:items-start ${b.tone}`}>
            <span className="text-4xl" aria-hidden>{b.icon}</span>
            <span>
              <span className="block text-2xl font-black">{b.title}</span>
              <span className={`block text-lg ${b.sub}`}>{b.desc}</span>
            </span>
          </button>
        ))}
      </section>

      {/* 사용 방법 */}
      <Card>
        <h2 className="text-xl font-extrabold">단디는 이렇게 도와드려요</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {['단디와 편하게 이야기해요', '단디가 “기억해도 될까요?” 여쭤봐요', '기억한 이야기로 추억을 나누고, 비슷한 친구를 소개해요'].map((t, i) => (
            <li key={t} className="flex items-start gap-3 rounded-2xl bg-cream-100 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-600 text-lg font-black text-white">{i + 1}</span>
              <span className="text-lg font-semibold">{t}</span>
            </li>
          ))}
        </ol>
      </Card>

      {/* 추억 현황 */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-2xl font-black">최근에 기억한 추억</h2>
          <a href="#/memories" className="text-lg font-bold text-leaf-700">전체 보기 ›</a>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {CATEGORY_ORDER.map((c) => (
            <span key={c} className={`rounded-full px-3 py-1 text-base font-bold ${CATEGORY_META[c].bg} ${CATEGORY_META[c].text}`}>
              {CATEGORY_META[c].icon} {CATEGORY_META[c].label} {data.counts[c] ?? 0}
            </span>
          ))}
        </div>
        {data.recentMemories.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.recentMemories.slice(0, 4).map((m) => <MemoryCard key={m.id} m={m} />)}
          </div>
        ) : (
          <Card className="text-center">
            <p className="text-lg text-ink-soft">아직 기억한 이야기가 없어요. 단디에게 젊은 시절 이야기를 들려주세요.</p>
            <Button className="mt-3" onClick={() => navigate('/chat')}>이야기 시작하기</Button>
          </Card>
        )}
      </section>

      {data.recentConversations.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl font-black">최근에 나눈 대화</h2>
          <div className="space-y-3">
            {data.recentConversations.map((c) => (
              <a key={c.id} href={`#/chat?c=${c.id}`} className="flex items-center gap-4 rounded-3xl border border-cream-200 bg-white p-4 shadow-soft hover:border-leaf-200">
                <span className="text-2xl" aria-hidden>💬</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-bold">{c.title}</span>
                  <span className="block truncate text-base text-ink-soft">{c.lastMessage}</span>
                </span>
                <span className="shrink-0 text-sm text-ink-faint">{formatDate(c.lastMessageAt)}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {data.pendingConnections > 0 && (
        <a href="#/connections" className="block rounded-3xl border-2 border-leaf-200 bg-leaf-50 p-5 text-lg font-bold text-leaf-700">
          🤝 답을 기다리는 교류 제안이 {data.pendingConnections}건 있어요 ›
        </a>
      )}
    </div>
  );
}
