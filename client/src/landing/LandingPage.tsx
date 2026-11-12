import { useEffect } from 'react';
import LandingHeader from './LandingHeader';
import Hero from './Hero';
import Meet from './Meet';
import DayTimeline from './DayTimeline';
import Features from './Features';
import ChatDemo from './ChatDemo';
import Family from './Family';
import Closing, { Footer } from './Closing';
import { scrollToId } from './shared';

// 단디 소개(랜딩) 페이지 — 주소: #/intro
// 위에서 아래로 스크롤하며 ‘단디와 함께하는 일상’을 따라가는 이야기 구성입니다.
export default function LandingPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = '단디(DANDI) · 당신의 이야기를 기억하는 AI 동반자';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="min-h-dvh bg-ivory text-ink">
      <a href="#main" onClick={(e) => { e.preventDefault(); scrollToId('top'); }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:font-bold">
        본문으로 건너뛰기
      </a>
      <LandingHeader />
      <main id="main">
        <Hero />
        <Meet />
        <DayTimeline />
        <Features />
        <ChatDemo />
        <Family />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
