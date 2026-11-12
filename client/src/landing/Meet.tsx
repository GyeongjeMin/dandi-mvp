import { useState } from 'react';
import { DandiImg, Reveal, SectionHeading, StatusTag, type DandiView, type Status } from './shared';

const VIEW_TABS: { view: DandiView; label: string; caption: string }[] = [
  { view: 'front', label: '앞모습', caption: '두 손으로 조개를 꼭 안은 모습. 소중한 이야기를 품는다는 뜻을 담았어요.' },
  { view: 'right', label: '옆모습', caption: '동그란 머리와 길게 뻗은 꼬리. 곁에서 귀 기울여 듣는 다정한 옆모습이에요.' },
  { view: 'back', label: '뒷모습', caption: '부드러운 갈색 털과 크림색 꼬리 끝. 어디에 두어도 편안한 인테리어 소품처럼.' },
];

const VALUES = [
  { n: '01', title: '기억하는 AI 동반자', desc: '취미, 지나온 경험, 가족 이야기를 기억해 두었다가 다음 대화에서 먼저 꺼내요. 질문에만 답하는 AI가 아니에요.', tone: 'bg-coral-50', status: 'mvp' as Status },
  { n: '02', title: '가족과 이어지는 기억', desc: '대화 속 삶의 이야기를 차곡차곡 정리하고, 어르신이 허락한 기억만 가족과 나눠요.', tone: 'bg-sage-50', status: 'mvp' as Status, statusText: '기억 정리 · 가족 공유: MVP' },
  { n: '03', title: '새로운 사회적 연결', desc: '관심사와 경험이 비슷한 동네 이웃을 찾아, 왜 잘 맞는지와 함께 소개해 드려요.', tone: 'bg-cream-200/70', status: 'mvp' as Status },
];

const ROADMAP = [
  { step: '지금', title: '웹 MVP', desc: '음성 대화 · 생애기억 · 가족 연결 · 이웃 추천', status: 'mvp' as Status },
  { step: '다음', title: '휴대폰·태블릿 앱', desc: '푸시 알림, 더 자연스러운 목소리, 같은 계정·기억 그대로', status: 'planned' as Status },
  { step: '목표', title: 'AI 돌봄인형', desc: '말을 걸면 대답하는 수달 인형으로 집 안에', status: 'planned' as Status },
];

export default function Meet() {
  const [view, setView] = useState<DandiView>('front');
  const current = VIEW_TABS.find((t) => t.view === view)!;

  return (
    <section id="meet" aria-labelledby="meet-title" className="scroll-mt-20 bg-white py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              id="meet-title"
              eyebrow="단디를 소개합니다"
              title={<>곁에 두고 싶은,<br />이야기를 품은 수달</>}
              desc={<>‘단디’는 경상도 말로 ‘단단히, 잘 챙겨서’라는 뜻이에요. 어르신의 하루와 기억을 단디 챙기는 친구가 되고 싶어요. 지금은 웹에서 먼저 만나고, 앞으로 이 모습 그대로의 <b className="font-bold text-ink">AI 돌봄인형</b>으로 찾아갈 예정이에요.</>}
            />
            <Reveal delay={120} className="mt-8 flex flex-wrap gap-2">
              <StatusTag status="planned">돌봄인형 하드웨어: 개발 예정</StatusTag>
              <StatusTag status="mvp">대화 소프트웨어: 웹 MVP</StatusTag>
            </Reveal>
          </div>

          <Reveal delay={100} className="rounded-[2.5rem] bg-ivory p-6 md:p-10">
            <div className="flex aspect-[5/4] items-center justify-center" aria-live="polite">
              <DandiImg key={view} view={view} className={`dandi-fade product-shadow max-h-full ${view === 'right' ? 'w-[78%]' : 'w-[52%]'}`} />
            </div>
            <p className="mt-4 min-h-[3.5rem] text-center text-lg text-ink-soft">{current.caption}</p>
            <div className="mt-5 flex justify-center gap-2" role="group" aria-label="단디 모습 바꿔 보기">
              {VIEW_TABS.map((t) => (
                <button key={t.view} onClick={() => setView(t.view)} aria-pressed={view === t.view}
                  className={`min-h-12 rounded-full px-5 text-base font-bold transition-colors ${view === t.view ? 'bg-ink text-white' : 'bg-white text-ink-soft hover:bg-cream-200'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-center">
              <a href="#/dandi-3d" className="inline-flex min-h-12 items-center rounded-full border-2 border-ink/15 bg-white px-5 text-base font-bold text-ink hover:border-ink/40">
                🧸 3D 단디 돌려 보기 →
              </a>
            </p>
          </Reveal>
        </div>

        {/* 세 가지 핵심 가치 */}
        <ul className="mt-24 grid gap-5 md:grid-cols-3">
          {VALUES.map((v, i) => (
            <Reveal as="li" key={v.n} delay={i * 120} className={`flex flex-col rounded-[2rem] p-7 md:p-8 ${v.tone}`}>
              <span className="text-base font-black tracking-widest text-otter-500">{v.n}</span>
              <h3 className="mt-3 text-2xl font-extrabold tracking-tight">{v.title}</h3>
              <p className="mt-3 flex-1 text-lg leading-relaxed text-ink-soft">{v.desc}</p>
              <div className="mt-6"><StatusTag status={v.status}>{v.statusText}</StatusTag></div>
            </Reveal>
          ))}
        </ul>

        {/* 단계별 계획 */}
        <Reveal className="mt-16">
          <h3 className="text-center text-lg font-bold text-ink-soft">단디가 걸어갈 길</h3>
          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {ROADMAP.map((r, i) => (
              <li key={r.step} className="relative flex items-start gap-4 rounded-3xl border border-cream-200 bg-ivory p-5">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-black ${i === 0 ? 'bg-coral-600 text-white' : 'bg-white text-otter-500'}`}>{r.step}</span>
                <div>
                  <p className="text-xl font-extrabold">{r.title}</p>
                  <p className="mt-1 text-base text-ink-soft">{r.desc}</p>
                  <div className="mt-2"><StatusTag status={r.status} /></div>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
