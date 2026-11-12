import { useEffect, useRef, useState } from 'react';
import { navigate } from '../lib/router';
import { useApp } from '../lib/store';
import { Bubble, Reveal, SectionHeading, StatusTag, useInView } from './shared';

// 미리 써 둔 샘플 대화입니다. 실제 AI 응답이 아니며, 화면에도 그렇게 표시합니다.
type Step =
  | { kind: 'day'; label: string }
  | { kind: 'msg'; who: 'dandi' | 'elder'; text: string; recall?: string }
  | { kind: 'memory'; items: string[] };

const SCRIPT: Step[] = [
  { kind: 'day', label: '첫 번째 대화 · 11월 3일 월요일' },
  { kind: 'msg', who: 'elder', text: '나는 젊었을 때 진주에서 학교를 다녔어.' },
  { kind: 'msg', who: 'dandi', text: '진주에서 학교를 다니셨군요. 그때 가장 기억에 남는 일이 있으세요?' },
  { kind: 'msg', who: 'elder', text: '남강 다리 건너서 학교 다녔지. 친구들이랑 유등 구경도 가고.' },
  { kind: 'msg', who: 'dandi', text: '강을 건너 등교하던 길이라니, 풍경이 그려지네요. 이 이야기를 기억해 둬도 될까요?' },
  { kind: 'msg', who: 'elder', text: '그래, 기억해 둬.' },
  { kind: 'memory', items: ['지역 · 젊은 시절 진주에서 학교를 다녔어요', '생애경험 · 친구들과 남강 유등 구경을 다녔어요'] },
  { kind: 'day', label: '나흘 뒤 · 11월 7일 금요일' },
  { kind: 'msg', who: 'dandi', recall: '진주에서 학교를 다녔어요', text: '봄날님, 지난번에 남강 다리를 건너 학교 다니셨다고 하셨지요. 그 시절 친구분들과는 요즘도 연락하세요?' },
  { kind: 'msg', who: 'elder', text: '몇 명은 아직 연락하지. 올가을에 같이 유등 보러 가자고 했어.' },
  { kind: 'msg', who: 'dandi', text: '오랜 친구분들과 다시 남강에 가신다니 참 좋네요. 다녀오시면 어떠셨는지 꼭 들려주세요.' },
];

export default function ChatDemo() {
  const { health } = useApp();
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { ref: viewRef, inView } = useInView<HTMLDivElement>(0.35);
  const done = shown >= SCRIPT.length;

  // 화면에 보이면 한 번 자동으로 재생
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setShown(SCRIPT.length);
    else setPlaying(true);
  }, [inView]);

  useEffect(() => {
    if (!playing) return;
    if (done) { setPlaying(false); return; }
    const next = SCRIPT[shown];
    const isDandi = next.kind === 'msg' && next.who === 'dandi';
    if (isDandi) setTyping(true);
    const t = window.setTimeout(() => { setTyping(false); setShown((n) => n + 1); }, next.kind === 'day' ? 900 : isDandi ? 1500 : 1100);
    return () => { clearTimeout(t); setTyping(false); };
  }, [playing, shown, done]);

  // 새 말풍선이 생기면 대화창 안에서만 아래로 스크롤 (페이지 전체는 움직이지 않음)
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [shown, typing]);

  const step = () => { setPlaying(false); setShown((n) => Math.min(SCRIPT.length, n + 1)); };
  const restart = () => { setShown(0); setPlaying(true); };

  return (
    <section id="demo" aria-labelledby="demo-title" className="scroll-mt-20 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:px-8 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading
            id="demo-title"
            eyebrow="대화 체험"
            title={<>나흘 뒤에도,<br />단디는 기억해요</>}
            desc="첫 대화에서 들려주신 이야기가 기억으로 저장되고, 며칠 뒤 대화의 첫마디가 되는 과정을 보여 드려요."
          />
          <Reveal delay={120} className="mt-8 rounded-3xl border-2 border-dashed border-coral-100 bg-coral-50/60 p-5">
            <div className="flex flex-wrap items-center gap-2"><StatusTag status="demo" /></div>
            <p className="mt-3 text-lg leading-relaxed">
              이 화면의 대화는 <b>미리 써 둔 샘플</b>이에요. 실제 AI가 지금 대답하는 것이 아니에요.
            </p>
            <p className="mt-2 text-base leading-relaxed text-ink-soft">
              실제 MVP 화면에서는 직접 말을 걸 수 있어요.{' '}
              {health && (health.mode === 'demo'
                ? <>지금 서버는 <b className="text-coral-700">데모 모드</b>(미리 준비된 규칙과 문장)로 켜져 있어요. 기억 저장·회상·추천 계산은 실제 데이터로 동작해요.</>
                : <>지금 서버는 <b className="text-sage-700">AI 모드</b>로 켜져 있어요.</>)}
            </p>
          </Reveal>
          <Reveal delay={200} className="mt-6">
            <button onClick={() => navigate('/chat')} className="inline-flex min-h-16 w-full items-center justify-center gap-2 rounded-full bg-coral-600 px-6 text-lg font-bold text-white shadow-soft transition-colors hover:bg-coral-700 sm:w-auto sm:px-8 sm:text-xl">
              실제 MVP 화면에서 대화하기 <span aria-hidden>→</span>
            </button>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <div ref={viewRef} className="overflow-hidden rounded-[2.25rem] border border-cream-200 bg-cream-100 shadow-soft">
            <div className="flex items-center justify-between gap-3 border-b border-cream-200 bg-white px-5 py-3.5">
              <p className="text-lg font-extrabold">단디와 이야기</p>
              <StatusTag status="demo">샘플 대화</StatusTag>
            </div>

            <div ref={scroller} className="h-[30rem] space-y-4 overflow-y-auto px-3 py-5 sm:px-6" aria-live="polite" aria-label="샘플 대화 내용">
              {shown === 0 && !playing && (
                <p className="pt-40 text-center text-lg text-ink-faint">아래 ‘재생’을 누르면 대화가 시작돼요.</p>
              )}
              {SCRIPT.slice(0, shown).map((s, i) => {
                if (s.kind === 'day') return (
                  <p key={i} className="dandi-fade flex items-center gap-3 py-1 text-sm font-bold text-ink-faint">
                    <span className="h-px flex-1 bg-cream-300" />{s.label}<span className="h-px flex-1 bg-cream-300" />
                  </p>
                );
                if (s.kind === 'memory') return (
                  <div key={i} className="dandi-fade mx-auto max-w-sm rounded-2xl border border-sage-200 bg-sage-50 p-4">
                    <p className="text-sm font-bold text-sage-700">✓ 나의 추억에 저장했어요</p>
                    <ul className="mt-2 space-y-1">{s.items.map((m) => <li key={m} className="text-base font-semibold">{m}</li>)}</ul>
                  </div>
                );
                return (
                  <Bubble key={i} who={s.who} className="dandi-fade"
                    note={s.recall && <span className="inline-flex rounded-full bg-coral-50 px-3 py-0.5 text-sm font-bold text-coral-700">💭 떠올린 추억 · {s.recall}</span>}>
                    {s.text}
                  </Bubble>
                );
              })}
              {typing && (
                <div className="flex items-center gap-2 pl-11 sm:pl-[3.4rem]" role="status" aria-label="단디가 대답을 쓰고 있어요">
                  {[0, 1, 2].map((d) => <span key={d} className="dandi-dot h-2.5 w-2.5 rounded-full bg-otter-300" style={{ animationDelay: `${d * 0.15}s` }} />)}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-cream-200 bg-white px-4 py-3">
              {done ? (
                <button onClick={restart} className="min-h-12 rounded-full bg-ink px-5 text-base font-bold text-white">↺ 처음부터 다시</button>
              ) : (
                <button onClick={() => setPlaying((p) => !p)} className="min-h-12 rounded-full bg-ink px-5 text-base font-bold text-white" aria-pressed={playing}>
                  {playing ? '❚❚ 잠시 멈춤' : '▶ 재생'}
                </button>
              )}
              <button onClick={step} disabled={done} className="min-h-12 rounded-full border border-cream-300 px-5 text-base font-bold text-ink-soft disabled:opacity-40">
                한 마디씩 보기
              </button>
              <span className="ml-auto text-sm text-ink-faint" aria-hidden>{Math.min(shown, SCRIPT.length)} / {SCRIPT.length}</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
