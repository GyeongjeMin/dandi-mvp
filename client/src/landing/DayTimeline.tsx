import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bubble, DandiImg, Reveal, SectionHeading, StatusTag, type DandiView, type Status } from './shared';

interface Slot {
  key: string;
  tab: string;
  time: string;
  icon: string;
  title: string;
  desc: string;
  bg: string;
  view: DandiView;
  status: { s: Status; text?: string }[];
  talk: { who: 'dandi' | 'elder'; text: string }[];
  memory?: string;
}

const SLOTS: Slot[] = [
  {
    key: 'morning', tab: '아침', time: '오전 8:30', icon: '🌅',
    title: '따뜻한 안부로 여는 하루',
    desc: '밤사이 잘 주무셨는지, 오늘은 어떤 하루가 될지. 단디가 먼저 다정하게 말을 건네요. 가족이 등록한 복약·생활 알림도 함께 챙겨 드려요.',
    bg: 'bg-coral-50', view: 'front',
    status: [{ s: 'mvp', text: '기억으로 건네는 첫인사: MVP' }, { s: 'mvp', text: '복약·생활 알림: MVP (화면이 열려 있을 때)' }],
    talk: [
      { who: 'dandi', text: '봄날님, 좋은 아침이에요. 어젯밤엔 푹 주무셨어요?' },
      { who: 'elder', text: '응, 잘 잤어. 오늘 병원 가는 날이야.' },
      { who: 'dandi', text: '오후 2시 정형외과 가시는 날이죠. 바람이 차니 따뜻하게 입고 나가세요.' },
    ],
  },
  {
    key: 'afternoon', tab: '오후', time: '오후 3:00', icon: '🌼',
    title: '취미와 추억으로 이어지는 대화',
    desc: '지난번에 들려주신 취미와 경험을 기억했다가 이야깃거리로 꺼내요. “요즘 어떠세요?” 대신, 어르신만의 이야기로 대화를 시작해요.',
    bg: 'bg-cream-200/70', view: 'right',
    status: [{ s: 'mvp', text: '기억 기반 회상 대화: MVP' }],
    talk: [
      { who: 'dandi', text: '지난번에 화단에 국화를 심으셨다고 하셨잖아요. 요즘 꽃이 피었어요?' },
      { who: 'elder', text: '노랗게 피었지. 우리 어머니도 국화를 참 좋아하셨어.' },
      { who: 'dandi', text: '어머님도 국화를 좋아하셨군요. 어머님과의 기억을 조금 더 들려주실래요?' },
    ],
  },
  {
    key: 'evening', tab: '저녁', time: '오후 8:00', icon: '🌙',
    title: '하루를 돌아보며, 새로운 기억을 차곡차곡',
    desc: '오늘 있었던 일을 나누다 소중한 이야기가 나오면, 단디는 꼭 먼저 여쭤봐요. “기억해 둬도 될까요?” 허락하신 것만 저장하고, 언제든 고치거나 지울 수 있어요.',
    bg: 'bg-sage-50', view: 'left',
    status: [{ s: 'mvp', text: '기억 추출 · 확인 · 저장: MVP' }],
    talk: [
      { who: 'dandi', text: '오늘 하루는 어떠셨어요?' },
      { who: 'elder', text: '손녀가 전화했어. 다음 달에 결혼한대.' },
      { who: 'dandi', text: '정말 기쁜 소식이네요! 이 이야기를 기억해 둬도 될까요?' },
    ],
    memory: '가족 · 손녀가 다음 달에 결혼해요',
  },
  {
    key: 'family', tab: '가족과 연결', time: '언제든', icon: '💌',
    title: '허락한 이야기만, 가족에게',
    desc: '멀리 사는 가족도 어르신의 이야기를 함께 나눌 수 있도록. 어르신이 “이건 보내 줘” 하신 기억만 가족 화면에 보이고, 가족이 보낸 사진과 질문은 단디가 대화 속에서 전해 드려요.',
    bg: 'bg-otter-100/60', view: 'back',
    status: [{ s: 'mvp', text: '가족 공유: MVP (어르신이 고른 것만)' }],
    talk: [
      { who: 'dandi', text: '오늘 들려주신 국화 이야기, 따님께도 전해 드릴까요?' },
      { who: 'elder', text: '그래, 그건 보내 줘.' },
      { who: 'dandi', text: '네, 이 이야기만 따님께 보낼게요. 다른 대화 내용은 보내지 않아요.' },
    ],
  },
];

export default function DayTimeline() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const slot = SLOTS[active];

  // 바뀔 때마다 말풍선을 하나씩 보여 주기
  const [shown, setShown] = useState(slot.talk.length);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(SLOTS[active].talk.length); return; }
    setShown(1);
    const timers = SLOTS[active].talk.slice(1).map((_, i) => window.setTimeout(() => setShown(i + 2), 700 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    let next = active;
    if (dir) next = (active + dir + SLOTS.length) % SLOTS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = SLOTS.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section id="day" aria-labelledby="day-title" className="scroll-mt-20 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <SectionHeading
          id="day-title"
          center
          eyebrow="단디와 함께하는 하루"
          title={<>아침부터 저녁까지,<br className="sm:hidden" /> 곁에 있는 말벗</>}
          desc="시간대를 눌러 보세요. 단디가 어르신의 하루에 어떻게 함께하는지 보여 드릴게요."
        />

        <Reveal delay={100} className="mt-12">
          <div role="tablist" aria-label="하루 시간대" onKeyDown={onKey}
            className="mx-auto grid max-w-3xl grid-cols-2 gap-2 rounded-[1.75rem] bg-white p-2 shadow-soft sm:grid-cols-4">
            {SLOTS.map((s, i) => (
              <button
                key={s.key}
                ref={(el) => { tabs.current[i] = el; }}
                role="tab"
                id={`day-tab-${s.key}`}
                aria-selected={i === active}
                aria-controls="day-panel"
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                className={`flex min-h-16 flex-col items-center justify-center rounded-[1.25rem] px-3 py-2 transition-colors ${i === active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-cream-100'}`}
              >
                <span className="text-lg font-bold leading-tight"><span aria-hidden>{s.icon} </span>{s.tab}</span>
                <span className={`text-sm ${i === active ? 'text-white/75' : 'text-ink-faint'}`}>{s.time}</span>
              </button>
            ))}
          </div>
        </Reveal>

        <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${slot.key}`}
          className={`mt-8 overflow-hidden rounded-[2.5rem] transition-colors duration-500 ${slot.bg}`}>
          <div key={slot.key} className="grid items-center gap-8 p-4 pt-8 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:gap-12 lg:p-14">
            <div className="dandi-fade">
              <p className="text-base font-bold text-otter-500">{slot.time}</p>
              <h3 className="mt-2 text-[1.75rem] font-extrabold leading-snug tracking-tight md:text-4xl">{slot.title}</h3>
              <p className="mt-4 text-lg leading-relaxed text-ink-soft md:text-xl">{slot.desc}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {slot.status.map((st) => <StatusTag key={st.text} status={st.s}>{st.text}</StatusTag>)}
              </div>
              <div className="mt-8 hidden justify-start lg:flex">
                <DandiImg view={slot.view} className={`product-shadow ${slot.view === 'right' || slot.view === 'left' ? 'w-56' : 'w-36'}`} />
              </div>
            </div>

            <div className="rounded-[2rem] bg-white/60 p-3 sm:p-6">
              <p className="mb-4 text-center text-sm font-bold text-ink-faint">예시 대화</p>
              <div className="space-y-4" aria-live="polite">
                {slot.talk.slice(0, shown).map((t, i) => (
                  <Bubble key={i} who={t.who} className="dandi-fade">{t.text}</Bubble>
                ))}
                {slot.memory && shown >= slot.talk.length && (
                  <div className="dandi-fade ml-11 sm:ml-[3.4rem] rounded-2xl border-2 border-dashed border-sage-200 bg-white p-4">
                    <p className="text-sm font-bold text-sage-700">📒 기억해 둘까요?</p>
                    <p className="mt-1 text-lg font-semibold">{slot.memory}</p>
                    <div className="mt-3 flex gap-2" aria-hidden>
                      <span className="rounded-xl bg-sage-700 px-4 py-2 text-base font-bold text-white">네, 기억해 줘요</span>
                      <span className="rounded-xl bg-cream-100 px-4 py-2 text-base font-bold text-ink-soft">아니요</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
