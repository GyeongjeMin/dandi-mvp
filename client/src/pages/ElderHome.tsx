import { useCallback, useEffect, useState } from 'react';
import Character from '../components/Character';
import VoiceTalk, { type VoiceSummary } from '../components/VoiceTalk';
import { Spinner } from '../components/ui';
import { api, type HomeData, type Reminder } from '../lib/api';
import { greetingWord, todayLabel } from '../lib/format';
import { navigate, useRoute } from '../lib/router';
import { unlockSpeech, voiceSupport } from '../lib/voice';
import { useApp } from '../lib/store';

/**
 * 어르신용 첫 화면 — 기능을 많이 보여 주기보다 '단디와 이야기하기' 하나를 크고 분명하게.
 * 보조 기능은 나의 추억 · 가족 소식 두 가지만, 나머지는 '더보기'로.
 */
export default function ElderHome() {
  const { toast } = useApp();
  const route = useRoute();
  const [data, setData] = useState<HomeData | null>(null);
  const [talk, setTalk] = useState<{ postId?: number } | null>(null);
  const [lastSummary, setLastSummary] = useState<VoiceSummary | null>(null);

  const load = useCallback(() => api<HomeData>('/home').then(setData).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);

  // '가족 소식'에서 [이 소식으로 이야기하기]를 누르고 온 경우 (#/?talk=1&post=번호)
  useEffect(() => {
    if (route.query.get('talk') === '1' && !talk) {
      const post = Number(route.query.get('post')) || undefined;
      unlockSpeech();
      setTalk({ postId: post });
      navigate('/', { replace: true });
    }
  }, [route.key, route.query, talk]);

  const startTalk = () => {
    unlockSpeech(); // 아이폰 등: 버튼을 누른 순간에 음성 출력을 열어 둠
    setLastSummary(null);
    setTalk({});
  };

  const closeTalk = (s: VoiceSummary) => {
    setTalk(null);
    setLastSummary(s);
    load();
  };

  const checkReminder = async (r: Reminder) => {
    try {
      await api(`/reminders/${r.id}/check`, { method: 'POST' });
      toast(`${r.label} 확인했어요`);
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  if (!data) return <Spinner />;
  const u = data.user;
  const due = data.reminders.filter((r) => data.dueReminderIds.includes(r.id));
  const sup = voiceSupport();

  return (
    <div className="mx-auto max-w-2xl">
      {talk && <VoiceTalk postId={talk.postId} rate={data.prefs.speechRate} reduceMotion={data.prefs.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches} onClose={closeTalk} />}

      {/* 인사 */}
      <p className="text-center text-lg font-bold text-ink-soft">{todayLabel()}</p>
      <h1 className="mt-1 text-center text-[2rem] font-black leading-tight md:text-4xl">{greetingWord()}, {u.nickname}님</h1>

      {/* 단디 + 큰 버튼 */}
      <section className="mt-4 flex flex-col items-center" aria-label="단디와 이야기하기">
        <div className="relative flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
          <div aria-hidden className="absolute inset-3 rounded-full bg-gradient-to-b from-peach-50 to-cream-200" />
          <div className="relative"><Character size={200} bob /></div>
        </div>
        <p className="-mt-1 rounded-full bg-white px-4 py-1.5 text-lg font-bold text-ink-soft shadow-soft">단디가 기다리고 있어요</p>

        <button onClick={startTalk}
          className="mt-6 flex min-h-24 w-full items-center justify-center gap-3 rounded-[2rem] bg-peach-600 px-6 text-[1.7rem] font-black text-white shadow-soft transition-colors hover:bg-peach-700 active:scale-[0.99]">
          <span aria-hidden className="text-4xl">🎙️</span> 단디와 이야기하기
        </button>
        <p className="mt-3 text-center text-lg text-ink-soft">
          누르면 단디가 먼저 인사해요. 그다음엔 편하게 말씀만 하세요.
        </p>
        {(!sup.stt || !sup.secure) && (
          <p className="mt-2 rounded-2xl bg-peach-50 px-4 py-3 text-center text-base text-peach-700">
            {!sup.secure ? '이 주소에서는 마이크를 쓸 수 없어요.' : '이 브라우저는 음성 인식을 지원하지 않아요.'} 눌러 보시면 방법을 알려 드려요.
            <a href="#/chat" className="ml-1 font-bold underline">글자로 이야기하기</a>
          </p>
        )}
      </section>

      {/* 방금 마친 대화 */}
      {lastSummary && lastSummary.turns > 0 && (
        <div className="dandi-in mt-6 rounded-3xl bg-leaf-50 p-5 text-lg">
          <p className="font-extrabold text-leaf-700">오늘도 이야기 나눠 주셔서 고마워요.</p>
          <p className="mt-1">{lastSummary.turns}번 이야기를 주고받았어요.{lastSummary.confirmed.length ? ` ${lastSummary.confirmed.map((t) => `‘${t}’`).join(', ')} 이야기를 기억했어요.` : ''}</p>
          {lastSummary.conversationId && <a href={`#/chat?c=${lastSummary.conversationId}`} className="mt-2 inline-block font-bold text-leaf-700 underline">대화 내용 다시 보기</a>}
        </div>
      )}

      {/* 지금 챙길 알림 */}
      {due.length > 0 && (
        <section className="mt-6 space-y-2" aria-label="지금 챙길 일">
          {due.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-3xl border-2 border-peach-200 bg-white p-4">
              <span aria-hidden className="text-3xl">{r.kind === 'medication' ? '💊' : '⏰'}</span>
              <div className="flex-1">
                <p className="text-base font-bold text-peach-700">{r.timeLabel}</p>
                <p className="text-xl font-extrabold">{r.label}</p>
              </div>
              <button onClick={() => checkReminder(r)} className="min-h-14 rounded-2xl bg-leaf-600 px-5 text-lg font-bold text-white">했어요</button>
            </div>
          ))}
        </section>
      )}

      {/* 보조 기능 두 가지 */}
      <nav className="mt-6 grid grid-cols-2 gap-3" aria-label="보조 기능">
        <a href="#/memories" className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-3xl bg-white p-4 text-center shadow-soft hover:bg-cream-50">
          <span aria-hidden className="text-4xl">📒</span>
          <span className="text-xl font-extrabold">나의 추억</span>
          <span className="text-base text-ink-soft">{data.confirmedCount}개 기억하고 있어요</span>
        </a>
        <a href="#/news" className="relative flex min-h-32 flex-col items-center justify-center gap-1 rounded-3xl bg-white p-4 text-center shadow-soft hover:bg-cream-50">
          <span aria-hidden className="text-4xl">💌</span>
          <span className="text-xl font-extrabold">가족 소식</span>
          <span className="text-base text-ink-soft">{data.unseenFamilyPosts ? `새 소식 ${data.unseenFamilyPosts}개` : '사진과 메시지'}</span>
          {data.unseenFamilyPosts > 0 && (
            <span className="absolute right-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full bg-peach-600 px-2 text-base font-black text-white" aria-label={`새 소식 ${data.unseenFamilyPosts}개`}>
              {data.unseenFamilyPosts}
            </span>
          )}
        </a>
      </nav>

      {data.pendingCount > 0 && (
        <a href="#/memories?tab=pending" className="mt-3 flex min-h-14 items-center justify-between rounded-2xl bg-peach-50 px-4 text-lg font-bold text-peach-700">
          📝 기억해도 될지 여쭤볼 이야기 {data.pendingCount}개 <span aria-hidden>→</span>
        </a>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-lg">
        <a href="#/chat" className="font-bold text-ink-soft underline decoration-dotted underline-offset-4">⌨️ 글자로 이야기하기</a>
        <a href="#/more" className="font-bold text-ink-soft underline decoration-dotted underline-offset-4">☰ 더보기</a>
      </div>
    </div>
  );
}
