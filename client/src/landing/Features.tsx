import type { ReactNode } from 'react';
import { Bubble, DandiImg, Reveal, SectionHeading, StatusTag, type DandiView, type Status } from './shared';

interface Feature {
  n: string;
  title: string;
  lead: string;
  scenario: string[];
  status: { s: Status; text: string }[];
  view: DandiView;
  bg: string;
  mock: ReactNode;
}

const ChatMock = (
  <div className="space-y-3">
    <div className="ml-11 inline-flex sm:ml-[3.4rem] items-center gap-1.5 rounded-full bg-coral-50 px-3 py-1 text-sm font-bold text-coral-700">
      💭 단디가 떠올린 추억 · 진주에서 학교를 다님
    </div>
    <Bubble who="dandi">진주 남강 다리를 건너 학교 다니셨다고 하셨지요. 그 시절 친구분들과는 요즘도 연락하세요?</Bubble>
    <Bubble who="elder">몇 명은 아직 연락하지.</Bubble>
  </div>
);

const MemoryMock = (
  <div className="space-y-3">
    <div className="rounded-2xl border-2 border-dashed border-sage-200 bg-white p-4">
      <p className="text-sm font-bold text-sage-700">📒 기억해 둘까요?</p>
      <p className="mt-1 text-lg font-semibold">취미 · 화단에 국화를 가꾸세요</p>
      <p className="text-sm text-ink-faint">11월 5일 대화에서 · 직접 말씀하심</p>
      <div className="mt-3 flex flex-wrap gap-2" aria-hidden>
        <span className="rounded-xl bg-sage-700 px-4 py-2 text-base font-bold text-white">네, 기억해 줘요</span>
        <span className="rounded-xl bg-cream-100 px-4 py-2 text-base font-bold text-ink-soft">고쳐서 저장</span>
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 opacity-90">
      <div>
        <p className="text-base font-bold">따님에게 이 기억 보내기</p>
        <p className="text-sm text-ink-faint">어르신이 허락한 기억만 전해져요</p>
      </div>
      <StatusTag status="mvp" />
    </div>
  </div>
);

const FriendMock = (
  <div className="rounded-2xl bg-white p-4">
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-coral-50 text-2xl">🌿</span>
      <div className="flex-1">
        <p className="text-lg font-extrabold">들꽃님 <span className="text-base font-semibold text-ink-faint">· 70대 · 진주시</span></p>
        <p className="text-sm text-ink-faint">추천 점수 82점</p>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-1.5">
      {['#국화 가꾸기', '#진주 남강', '#교직 생활'].map((t) => (
        <span key={t} className="rounded-full bg-sage-50 px-3 py-0.5 text-sm font-bold text-sage-700">{t}</span>
      ))}
    </div>
    <p className="mt-3 rounded-xl bg-cream-100 p-3 text-base leading-snug">
      두 분 모두 꽃 가꾸기를 좋아하시고, 진주에서 젊은 시절을 보내셨어요.
    </p>
    <span aria-hidden className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-ink text-base font-bold text-white">이야기 나눠 보기 제안</span>
  </div>
);

const FEATURES: Feature[] = [
  {
    n: '01', title: '개인화된 AI 대화',
    lead: '어르신의 이야기를 기억하는 대화. 처음 만난 사람처럼 같은 질문을 반복하지 않아요.',
    scenario: [
      '새 대화를 열면, 저장된 기억 중 하나로 단디가 먼저 말을 걸어요.',
      '어떤 기억을 참고했는지 화면에 함께 보여 드려서 믿고 대화할 수 있어요.',
      '버튼 한 번으로 음성 대화를 시작해요. 단디는 답을 만드는 대로 바로 읽어 드리고, 대화 중에는 버튼을 다시 누르지 않아도 돼요(브라우저 지원 시).',
    ],
    status: [{ s: 'mvp', text: '기억 참고 대화 · 음성 대화: MVP' }],
    view: 'front', bg: 'bg-coral-50', mock: ChatMock,
  },
  {
    n: '02', title: '생애기억 저장과 가족 공유',
    lead: '대화 속에 흩어진 삶의 이야기를 직업 · 취미 · 지역 · 가족 · 생애경험으로 정리해요.',
    scenario: [
      '대화에서 기억할 만한 이야기를 찾으면 “기억해도 될까요?” 하고 먼저 여쭤봐요.',
      '‘나의 추억’에서 모든 기억을 보고, 고치고, 지울 수 있어요.',
      '어르신이 [가족과 공유]를 누른 기억만 가족 화면에 보이고, 가족이 남긴 질문은 단디가 다음 대화에서 대신 여쭤봐요.',
    ],
    status: [{ s: 'mvp', text: '기억 추출 · 확인 · 관리: MVP' }, { s: 'mvp', text: '가족 공유 · 가족 질문: MVP' }],
    view: 'right', bg: 'bg-sage-50', mock: MemoryMock,
  },
  {
    n: '03', title: '관심사 기반 이웃 연결',
    lead: '비슷한 취미와 경험을 가진 동네 이웃을, 왜 잘 맞는지 이유와 함께 소개해요.',
    scenario: [
      '확인된 기억의 관심사와 공개에 동의한 지역으로 잘 맞는 분을 찾아요.',
      '공통점과 추천 이유, 점수가 어떻게 나왔는지까지 투명하게 보여 드려요.',
      '교류는 양쪽이 모두 동의해야만 이어져요. 친구 추천도 동의하신 분만 받아요.',
    ],
    status: [{ s: 'mvp', text: '추천 · 교류 제안: MVP' }, { s: 'demo', text: '상대방 응답: 시연용' }],
    view: 'left', bg: 'bg-cream-200/70', mock: FriendMock,
  },
];

export default function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 bg-white py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <SectionHeading
          id="features-title"
          eyebrow="단디의 핵심 기능"
          title={<>대화가 기억이 되고,<br />기억이 사람을 잇습니다</>}
          desc="세 가지 기능은 따로 놀지 않아요. 대화에서 모인 기억이 다음 대화를 만들고, 이웃을 찾는 실마리가 돼요."
        />

        <div className="mt-20 space-y-24 md:space-y-32">
          {FEATURES.map((f, i) => {
            const flip = i % 2 === 1;
            return (
              <article key={f.n} aria-labelledby={`feature-${f.n}`} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                {/* 이미지 + 예시 화면 */}
                <Reveal className={`relative ${flip ? 'lg:order-2' : ''}`}>
                  <div className={`relative overflow-hidden rounded-[2.5rem] ${f.bg} px-3 pb-3 pt-10 sm:px-10 sm:pb-6`}>
                    <div className="flex justify-center">
                      <DandiImg view={f.view} className={`product-shadow ${f.view === 'front' ? 'w-[38%] max-w-[180px]' : 'w-[58%] max-w-[280px]'}`} />
                    </div>
                    <div className="relative -mt-6 rounded-[1.75rem] bg-ivory/95 p-3 shadow-soft backdrop-blur sm:p-5">
                      <p className="mb-3 text-sm font-bold text-ink-faint">예시 화면</p>
                      {f.mock}
                    </div>
                  </div>
                </Reveal>

                {/* 설명 */}
                <Reveal delay={120} className={flip ? 'lg:order-1' : ''}>
                  <span className="text-base font-black tracking-widest text-coral-600">{f.n}</span>
                  <h3 id={`feature-${f.n}`} className="mt-2 text-[1.9rem] font-extrabold leading-snug tracking-tight md:text-[2.5rem]">{f.title}</h3>
                  <p className="mt-4 text-xl leading-relaxed text-ink-soft">{f.lead}</p>
                  <ol className="mt-8 space-y-4">
                    {f.scenario.map((s, k) => (
                      <li key={k} className="flex gap-4">
                        <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream-200 text-base font-bold text-otter-500">{k + 1}</span>
                        <span className="text-lg leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-8 flex flex-wrap gap-2">
                    {f.status.map((st) => <StatusTag key={st.text} status={st.s}>{st.text}</StatusTag>)}
                  </div>
                </Reveal>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
