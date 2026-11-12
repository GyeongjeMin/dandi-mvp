import { navigate } from '../lib/router';
import { DandiImg, Reveal, scrollToId } from './shared';
import { SECTIONS } from './LandingHeader';

export default function Closing() {
  return (
      <section aria-labelledby="closing-title" className="relative overflow-hidden py-28 md:py-36">
        <div className="mx-auto max-w-5xl px-5 text-center md:px-8">
          {/* 서로 마주 보는 두 단디: '마음을 잇는다'는 메시지 */}
          <Reveal className="flex items-end justify-center gap-2 sm:gap-6">
            <DandiImg view="right" className="product-shadow w-[38%] max-w-[230px]" alt="서로 마주 보는 두 단디 인형 중 왼쪽" />
            <span aria-hidden className="self-center text-2xl text-coral-400 sm:text-3xl">♥</span>
            <DandiImg view="left" className="product-shadow w-[38%] max-w-[230px]" alt="서로 마주 보는 두 단디 인형 중 오른쪽" />
          </Reveal>
          <Reveal delay={120}>
            <h2 id="closing-title" className="mt-12 text-[2.1rem] font-extrabold leading-[1.3] tracking-tight md:text-[3.25rem]">
              기억을 나누고, 마음을 잇는 일상.<br />
              <span className="text-coral-600">단디가 함께합니다.</span>
            </h2>
          </Reveal>
          <Reveal delay={220} className="mt-10 flex flex-col items-center gap-4">
            <button onClick={() => navigate('/')} className="inline-flex min-h-16 items-center justify-center gap-2 rounded-full bg-coral-600 px-10 text-xl font-bold text-white shadow-soft transition-colors hover:bg-coral-700">
              단디 체험하기 <span aria-hidden>→</span>
            </button>
            <p className="text-base text-ink-faint">처음이시면 별명과 동의 항목만 정하고 바로 시작할 수 있어요.</p>
          </Reveal>
        </div>
      </section>
  );
}

export function Footer() {
  return (
      <footer className="border-t border-cream-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between md:px-8">
          <div>
            <p className="text-2xl font-black">단디 <span className="text-base font-bold tracking-[0.2em] text-otter-500">DANDI</span></p>
            <p className="mt-2 max-w-md text-base leading-relaxed text-ink-soft">어르신의 이야기를 기억하는 AI 돌봄 동반자.<br />2026 모두의 창업 프로젝트 출품 프로토타입이에요.</p>
          </div>
          <nav aria-label="바닥글 메뉴" className="grid grid-cols-2 gap-x-8 gap-y-1">
            {SECTIONS.map((s) => (
              <button key={s.id} onClick={() => scrollToId(s.id)} className="min-h-11 text-left text-base font-semibold text-ink-soft hover:text-ink">{s.label}</button>
            ))}
            <a href="#/chat" className="flex min-h-11 items-center text-base font-semibold text-coral-700 hover:text-coral-600">MVP 체험하기 →</a>
          </nav>
        </div>
        <div className="border-t border-cream-200">
          <p className="mx-auto max-w-6xl px-5 py-5 text-sm leading-relaxed text-ink-faint md:px-8">
            이 페이지의 대화와 화면은 서비스 이해를 돕기 위한 예시예요. ‘개발 예정’ 표시가 붙은 기능은 아직 제공되지 않아요.
            제품 이미지는 단디 돌봄인형 콘셉트 이미지입니다.
          </p>
        </div>
      </footer>
  );
}
