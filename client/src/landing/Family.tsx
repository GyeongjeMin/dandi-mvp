import { DandiImg, Reveal, SectionHeading, StatusTag } from './shared';

const POINTS = [
  { icon: '📖', title: '공유된 기억 보기', desc: '어머니가 들려주신 이야기 중, 가족에게 보내도 좋다고 하신 기억만 모아 볼 수 있어요.' },
  { icon: '☀️', title: '일상과 안부 확인', desc: '오늘 단디와 이야기를 나누셨는지 정도의 간단한 안부를 확인해요. 대화 내용은 보이지 않아요.' },
  { icon: '💌', title: '사진과 메시지 나누기', desc: '가족이 보낸 사진과 메시지를 단디가 어르신께 읽어 드리고, 그 사진으로 이야기를 이어가요.' },
];

const PRINCIPLES = [
  '어르신이 기억마다 직접 허락한 것만 공유해요.',
  '대화 원문과 목소리 녹음은 가족에게 보내지 않아요.',
  '공유는 어르신이 언제든 거둘 수 있어요.',
];

function PhoneMock() {
  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2.75rem] border-[10px] border-ink bg-ivory p-4 shadow-[0_40px_60px_-30px_rgba(60,40,30,0.45)]">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-ink/15" aria-hidden />
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-end justify-center overflow-hidden rounded-full bg-otter-100" aria-hidden>
          <DandiImg view="front" decorative className="w-10 translate-y-1" />
        </span>
        <div>
          <p className="text-sm text-ink-faint">가족용 화면 · 예시</p>
          <p className="text-lg font-extrabold leading-tight">어머니(봄날님)의 단디</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4">
        <p className="text-sm font-bold text-sage-700">☀️ 오늘의 안부</p>
        <p className="mt-1 text-base font-semibold">오전 9시 12분, 단디와 이야기를 나누셨어요.</p>
        <p className="text-sm text-ink-faint">대화 내용은 공유되지 않아요</p>
      </div>

      <div className="mt-3 rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-coral-700">📖 공유된 기억</p>
          <span className="text-xs font-bold text-ink-faint">🔒 어머니가 허락함</span>
        </div>
        <ul className="mt-2 space-y-2">
          <li className="rounded-xl bg-cream-100 p-3">
            <p className="text-base font-semibold leading-snug">“노랗게 핀 국화를 보니 우리 어머니 생각이 나.”</p>
            <p className="mt-0.5 text-xs text-ink-faint">11월 5일 · 취미</p>
          </li>
          <li className="rounded-xl bg-cream-100 p-3">
            <p className="text-base font-semibold leading-snug">진주 남강 다리를 건너 학교 다니던 시절</p>
            <p className="mt-0.5 text-xs text-ink-faint">11월 3일 · 생애경험</p>
          </li>
        </ul>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2" aria-hidden>
        <span className="flex min-h-12 items-center justify-center rounded-xl bg-ink text-sm font-bold text-white">📷 사진 보내기</span>
        <span className="flex min-h-12 items-center justify-center rounded-xl bg-white text-sm font-bold">💬 메시지 남기기</span>
      </div>
    </div>
  );
}

export default function Family() {
  return (
    <section id="family" aria-labelledby="family-title" className="scroll-mt-20 bg-sage-50 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 md:px-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <SectionHeading
            id="family-title"
            eyebrow="가족과 함께하는 단디"
            title={<>멀리 있어도,<br />어머니의 이야기 곁에</>}
            desc="가족은 어르신이 허락한 이야기를 함께 나누고, 단디를 통해 안부와 마음을 전해요."
          />
          <Reveal delay={80} className="mt-6"><StatusTag status="mvp">가족용 화면: MVP 구현 (초대 숫자로 연결)</StatusTag> <a href="#/family" className="ml-2 font-bold text-coral-700 underline underline-offset-4">가족용 화면 열기 →</a></Reveal>

          <ul className="mt-10 space-y-6">
            {POINTS.map((p, i) => (
              <Reveal as="li" key={p.title} delay={120 + i * 100} className="flex gap-4">
                <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-soft">{p.icon}</span>
                <div>
                  <h3 className="text-xl font-extrabold">{p.title}</h3>
                  <p className="mt-1 text-lg leading-relaxed text-ink-soft">{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={200} className="mt-10 rounded-3xl bg-white p-6">
            <h3 className="flex items-center gap-2 text-lg font-extrabold"><span aria-hidden>🔒</span> 어르신의 동의가 먼저예요</h3>
            <ul className="mt-3 space-y-2">
              {PRINCIPLES.map((t) => (
                <li key={t} className="flex gap-3 text-lg leading-relaxed">
                  <span aria-hidden className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-sage-500" />{t}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-base text-ink-faint">지금 MVP에서도 기억 저장과 친구 추천은 각각 따로 동의를 받고, 언제든 끄거나 모든 정보를 지울 수 있어요.</p>
          </Reveal>
        </div>

        <Reveal delay={150} className="relative">
          <PhoneMock />
          <DandiImg view="left" className="product-shadow absolute -bottom-8 right-0 hidden w-40 sm:block xl:-right-12 xl:w-48" />
        </Reveal>
      </div>
    </section>
  );
}
