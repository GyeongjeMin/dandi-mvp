import { useEffect, useState } from 'react';
import { navigate } from '../lib/router';
import { DandiImg, scrollToId } from './shared';

export const SECTIONS = [
  { id: 'meet', label: '단디 소개' },
  { id: 'day', label: '함께하는 하루' },
  { id: 'features', label: '핵심 기능' },
  { id: 'demo', label: '대화 체험' },
  { id: 'family', label: '가족과 함께' },
];

export default function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (id: string) => { setOpen(false); scrollToId(id); };

  return (
    <header className={`sticky top-0 z-50 transition-colors duration-300 ${scrolled || open ? 'border-b border-cream-200 bg-ivory/90 backdrop-blur' : 'border-b border-transparent bg-transparent'}`}>
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3 md:px-8">
        <button onClick={() => go('top')} className="flex items-center gap-2.5" aria-label="단디 소개 페이지 맨 위로">
          <span className="flex h-11 w-11 items-end justify-center overflow-hidden rounded-full bg-otter-100" aria-hidden>
            <DandiImg view="front" decorative eager className="w-9 translate-y-1" />
          </span>
          <span className="text-left leading-none">
            <span className="block text-2xl font-black tracking-tight">단디</span>
            <span className="mt-0.5 block text-[0.7rem] font-bold tracking-[0.2em] text-otter-500">DANDI</span>
          </span>
        </button>

        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="소개 페이지 구역">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => go(s.id)} className="min-h-11 rounded-full px-4 text-base font-semibold text-ink-soft transition-colors hover:bg-cream-200 hover:text-ink">
              {s.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-3">
          <button onClick={() => navigate('/chat')} className="hidden min-h-12 items-center rounded-full bg-ink px-5 text-base font-bold text-white transition-colors hover:bg-coral-700 sm:inline-flex">
            단디와 대화하기
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex min-h-12 min-w-12 items-center justify-center rounded-full border border-cream-300 bg-white lg:hidden"
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
          >
            <span aria-hidden className="relative block h-4 w-5">
              <span className={`absolute left-0 h-0.5 w-5 rounded bg-ink transition-transform ${open ? 'top-[7px] rotate-45' : 'top-0'}`} />
              <span className={`absolute left-0 top-[7px] h-0.5 w-5 rounded bg-ink transition-opacity ${open ? 'opacity-0' : ''}`} />
              <span className={`absolute left-0 h-0.5 w-5 rounded bg-ink transition-transform ${open ? 'top-[7px] -rotate-45' : 'top-[14px]'}`} />
            </span>
          </button>
        </div>
      </div>

      {open && (
        <nav id="landing-menu" className="dandi-in border-t border-cream-200 px-5 pb-5 pt-2 lg:hidden" aria-label="소개 페이지 구역">
          <ul className="mx-auto max-w-6xl">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button onClick={() => go(s.id)} className="flex min-h-14 w-full items-center border-b border-cream-200 text-left text-xl font-bold">
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => navigate('/chat')} className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl bg-ink text-lg font-bold text-white">
            단디와 대화하기
          </button>
        </nav>
      )}
    </header>
  );
}
