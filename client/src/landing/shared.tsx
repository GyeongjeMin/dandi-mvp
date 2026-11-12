import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

// ── 단디 제품 이미지 ─────────────────────────────────────────────
// 원본(public/landing/dandi-original.jpg)은 그대로 두고, 배경만 지운 PNG를 사용합니다.
// width/height 를 함께 지정해 비율이 깨지지 않게 합니다(CSS 에서는 h-auto 로 비율 유지).
const VIEWS = {
  front: { src: '/landing/dandi-front.png', w: 197, h: 297, alt: '조개를 품에 안은 수달 모양의 단디 돌봄인형 정면' },
  back: { src: '/landing/dandi-back.png', w: 187, h: 309, alt: '단디 돌봄인형 뒷모습, 크림색 꼬리 끝' },
  right: { src: '/landing/dandi-side-right.png', w: 307, h: 293, alt: '오른쪽을 바라보는 단디 돌봄인형 옆모습' },
  left: { src: '/landing/dandi-side-left.png', w: 308, h: 293, alt: '왼쪽을 바라보는 단디 돌봄인형 옆모습' },
} as const;
export type DandiView = keyof typeof VIEWS;

export function DandiImg({ view = 'front', className = '', alt, eager = false, decorative = false }: {
  view?: DandiView; className?: string; alt?: string; eager?: boolean; decorative?: boolean;
}) {
  const v = VIEWS[view];
  return (
    <img
      src={v.src}
      width={v.w}
      height={v.h}
      alt={decorative ? '' : alt ?? v.alt}
      aria-hidden={decorative || undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={`h-auto select-none object-contain ${className}`}
    />
  );
}

// ── 스크롤에 맞춰 부드럽게 나타나기 ─────────────────────────────
export function useInView<T extends Element>(threshold = 0.18) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); io.disconnect(); }
    }, { threshold, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

export function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }: {
  children: ReactNode; className?: string; delay?: number; as?: ElementType;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <Tag ref={ref} className={`reveal ${inView ? 'is-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

// ── 개발 상태 표시: 구현된 것과 아닌 것을 분명히 구분 ─────────────
export type Status = 'mvp' | 'demo' | 'planned';
const STATUS: Record<Status, { label: string; cls: string; dot: string }> = {
  mvp: { label: 'MVP 구현', cls: 'border-sage-200 bg-sage-50 text-sage-700', dot: 'bg-sage-500' },
  demo: { label: '체험용 데모', cls: 'border-coral-100 bg-coral-50 text-coral-700', dot: 'bg-coral-400' },
  planned: { label: '개발 예정', cls: 'border-otter-300 bg-otter-100 text-ink-soft', dot: 'bg-otter-500' },
};
export function StatusTag({ status, children }: { status: Status; children?: ReactNode }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-0.5 text-sm font-bold ${s.cls}`}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${s.dot}`} />
      {children ?? s.label}
    </span>
  );
}

export function SectionHeading({ eyebrow, title, desc, center = false, id }: {
  eyebrow: string; title: ReactNode; desc?: ReactNode; center?: boolean; id?: string;
}) {
  return (
    <Reveal className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="text-base font-bold tracking-wide text-coral-600">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-[2rem] font-extrabold leading-[1.25] tracking-tight md:text-5xl md:leading-[1.2]">{title}</h2>
      {desc && <p className="mt-5 text-lg leading-relaxed text-ink-soft md:text-xl">{desc}</p>}
    </Reveal>
  );
}

// ── 대화 말풍선 ─────────────────────────────────────────────────
export function Bubble({ who, children, note, className = '' }: {
  who: 'dandi' | 'elder'; children: ReactNode; note?: ReactNode; className?: string;
}) {
  const dandi = who === 'dandi';
  return (
    <div className={`flex items-end gap-2 sm:gap-2.5 ${dandi ? '' : 'flex-row-reverse'} ${className}`}>
      {dandi ? (
        <span className="flex h-9 w-9 shrink-0 items-end justify-center overflow-hidden rounded-full bg-otter-100 sm:h-11 sm:w-11" aria-hidden>
          <DandiImg view="front" decorative className="w-7 translate-y-1 sm:w-9" />
        </span>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sm font-bold text-sage-700 sm:h-11 sm:w-11" aria-hidden>나</span>
      )}
      <div className={`max-w-[88%] sm:max-w-[82%] ${dandi ? '' : 'text-right'}`}>
        <span className="sr-only">{dandi ? '단디:' : '어르신:'}</span>
        <div className={`inline-block rounded-3xl px-4 py-2.5 text-left text-[1.05rem] sm:px-5 sm:py-3 sm:text-lg leading-relaxed ${dandi ? 'rounded-bl-md bg-white text-ink shadow-soft' : 'rounded-br-md bg-sage-700 text-white'}`}>
          {children}
        </div>
        {note && <div className="mt-1.5">{note}</div>}
      </div>
    </div>
  );
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  // 키보드·화면낭독기 사용자를 위해 초점도 해당 구역으로 옮깁니다.
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}
