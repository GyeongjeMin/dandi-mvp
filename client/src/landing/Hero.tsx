import { navigate } from '../lib/router';
import { DandiImg, Reveal, scrollToId } from './shared';

export default function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-8 md:px-8 md:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pb-28">
        {/* 문구 */}
        <div className="order-2 text-center lg:order-1 lg:text-left">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-base font-bold text-otter-500 shadow-soft">
              <span aria-hidden className="h-2 w-2 rounded-full bg-coral-400" />
              어르신을 위한 AI 돌봄 동반자
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 id="hero-title" className="mt-6 text-[2.35rem] font-extrabold leading-[1.22] tracking-tight sm:text-5xl md:text-[3.6rem] md:leading-[1.18]">
              당신의 이야기를<br />
              <span className="text-coral-600">기억하는</span>, 다정한<br /> AI 동반자
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-xl text-xl leading-relaxed text-ink-soft lg:mx-0 md:text-[1.35rem]">
              오늘의 안부부터 오래된 추억까지,<br className="hidden sm:block" /> 단디가 일상을 함께합니다.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
            <button onClick={() => navigate('/chat')} className="inline-flex min-h-16 items-center justify-center gap-2 rounded-full bg-coral-600 px-8 text-xl font-bold text-white shadow-soft transition-colors hover:bg-coral-700">
              단디와 대화하기 <span aria-hidden>→</span>
            </button>
            <button onClick={() => scrollToId('meet')} className="inline-flex min-h-16 items-center justify-center rounded-full border-2 border-ink/15 bg-white/70 px-8 text-xl font-bold text-ink transition-colors hover:border-ink/40 hover:bg-white">
              서비스 알아보기
            </button>
          </Reveal>
          <Reveal delay={320}>
            <p className="mt-6 text-base text-ink-faint">
              지금은 <b className="font-bold text-ink-soft">웹 MVP 단계</b>예요. 음성 대화·생애기억·가족 연결·이웃 추천을 웹에서 먼저 체험해 보세요.
            </p>
          </Reveal>
        </div>

        {/* 제품 이미지 */}
        <div className="relative order-1 mx-auto w-full max-w-[30rem] lg:order-2">
          <div aria-hidden className="absolute inset-x-[6%] bottom-[4%] top-[10%] rounded-full bg-gradient-to-b from-coral-100/80 to-cream-200" />
          <div aria-hidden className="absolute bottom-[6%] left-1/2 h-6 w-[46%] -translate-x-1/2 rounded-[50%] bg-otter-500/20 blur-md" />
          <Reveal className="relative flex justify-center pt-6">
            <DandiImg view="front" eager className="product-shadow dandi-float w-[58%] max-w-[270px]"
              alt="단디 돌봄인형 콘셉트 — 크림색 배와 갈색 털을 가진 수달이 분홍빛 조개를 두 손으로 안고 있어요" />
          </Reveal>

          {/* 떠 있는 작은 카드: 무엇을 하는 서비스인지 첫 화면에서 보여 주기 */}
          <Reveal delay={450} className="absolute left-0 top-0 hidden max-w-[11.5rem] sm:block sm:top-[2%] sm:max-w-[13rem] lg:-left-14">
            <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 text-left text-[0.95rem] leading-snug shadow-soft sm:text-base">
              <span className="block text-xs font-bold text-coral-600">단디</span>
              지난번에 심으신 국화, 오늘은 피었어요?
            </div>
          </Reveal>
          <Reveal delay={650} className="absolute bottom-[4%] right-0 hidden max-w-[12.5rem] sm:block sm:max-w-[14rem] lg:-right-10">
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-soft">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-100 text-lg">📒</span>
              <span className="text-base leading-snug">
                <span className="block text-xs font-bold text-sage-700">기억했어요</span>
                진주에서 보낸 학창 시절
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
