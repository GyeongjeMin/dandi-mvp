import { useState, type ReactNode } from 'react';
import Character from './Character';
import { Modal, Button } from './ui';
import { useApp } from '../lib/store';
import { navigate } from '../lib/router';

// 어르신용 메뉴는 네 개만: 처음 화면(단디와 이야기) · 나의 추억 · 가족 소식 · 더보기(나머지 모든 기능)
const NAV = [
  { path: '/', label: '단디', icon: '🦦' },
  { path: '/memories', label: '나의 추억', icon: '📒' },
  { path: '/news', label: '가족 소식', icon: '💌' },
  { path: '/more', label: '더보기', icon: '☰' },
];
const MORE_PATHS = ['/more', '/chat', '/friends', '/connections', '/settings', '/care', '/overview'];

export function ModeBadge() {
  const { health, healthError } = useApp();
  const [open, setOpen] = useState(false);
  if (healthError) return <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">서버 연결 안 됨</span>;
  if (!health) return null;
  const demo = health.mode === 'demo';
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-3 text-sm font-extrabold ${demo ? 'border-peach-200 bg-peach-50 text-peach-700' : 'border-leaf-200 bg-leaf-50 text-leaf-700'}`}
        aria-label={demo ? '지금은 데모 모드예요. 자세히 보기' : '지금은 AI 모드예요. 자세히 보기'}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${demo ? 'bg-peach-500' : 'bg-leaf-500'}`} />
        {demo ? '데모 모드' : 'AI 모드'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={demo ? '지금은 데모 모드예요' : '지금은 AI 모드예요'}
        footer={<Button onClick={() => setOpen(false)}>알겠어요</Button>}>
        {demo ? (
          <div className="space-y-3 text-lg">
            <p>AI 연결(API 키) 없이 실행 중이에요. <b>단디의 말은 미리 준비된 규칙과 문장</b>으로 만들어져요.</p>
            <p className="rounded-2xl bg-leaf-50 p-4 text-base text-leaf-700">
              그래도 <b>기억 추출·저장·수정·삭제</b>, <b>회상 질문</b>, <b>친구 추천 점수 계산</b>은 모두 실제 데이터로 동작해요.
            </p>
            <p className="text-base text-ink-soft">실제 AI로 바꾸려면 <code>server/.env</code> 에서 <code>LLM_PROVIDER</code> 와 API 키를 설정한 뒤 서버를 다시 켜 주세요.</p>
            {health.warning && <p className="rounded-2xl bg-peach-50 p-3 text-base text-peach-700">⚠️ {health.warning}</p>}
          </div>
        ) : (
          <div className="space-y-3 text-lg">
            <p>단디의 대답과 기억 추출을 <b>실제 AI</b>가 만들고 있어요.</p>
            <p className="text-base text-ink-soft">제공자: {health.provider} · 모델: {health.model}</p>
            <p className="text-base text-ink-soft">AI 연결에 문제가 생기면 그 답만 미리 준비된 문장으로 대신하고, 말풍선에 표시해 드려요.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function Layout({ path, children }: { path: string; children: ReactNode }) {
  const { user } = useApp();
  const active = (p: string) => (p === '/' ? path === '/' : p === '/more' ? MORE_PATHS.some((m) => path.startsWith(m)) : path.startsWith(p));
  return (
    <div className="min-h-dvh pb-28 md:pb-10">
      <header className="sticky top-0 z-40 border-b border-cream-200 bg-cream-100/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <button onClick={() => navigate('/')} className="flex items-center gap-2" aria-label="단디 홈으로">
            <Character size={42} />
            <span className="text-left leading-tight">
              <span className="block text-2xl font-black tracking-tight text-ink">단디</span>
              <span className="-mt-0.5 hidden text-xs font-bold text-ink-faint sm:block">이야기를 기억하는 말벗</span>
            </span>
          </button>
          <nav className="ml-6 hidden gap-1 md:flex" aria-label="주요 메뉴">
            {NAV.map((n) => (
              <a key={n.path} href={`#${n.path}`}
                className={`rounded-xl px-4 py-2 text-lg font-bold ${active(n.path) ? 'bg-leaf-100 text-leaf-700' : 'text-ink-soft hover:bg-cream-200'}`}
                aria-current={active(n.path) ? 'page' : undefined}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ModeBadge />
            {user && (
              <a href="#/settings" className={`flex min-h-10 items-center rounded-full px-3 text-base font-bold ${active('/settings') ? 'bg-leaf-100 text-leaf-700' : 'bg-white text-ink-soft border border-cream-300'}`} aria-label="내 정보와 동의 설정">
                ⚙️<span className="ml-1 hidden sm:inline">내 정보</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-5">
        {/* 잘못 눌렀을 때 바로 돌아갈 수 있도록 */}
        {path !== '/' && (
          <div className="mb-4 flex gap-2">
            <button onClick={() => (history.length > 1 ? history.back() : navigate('/'))} className="min-h-12 rounded-2xl border-2 border-cream-300 bg-white px-4 text-lg font-bold text-ink-soft">
              ← 뒤로
            </button>
            <button onClick={() => navigate('/')} className="min-h-12 rounded-2xl border-2 border-cream-300 bg-white px-4 text-lg font-bold text-ink-soft">
              🦦 처음 화면
            </button>
          </div>
        )}
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-200 bg-white/95 backdrop-blur md:hidden" aria-label="주요 메뉴">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map((n) => (
            <a key={n.path} href={`#${n.path}`}
              className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 text-sm font-bold ${active(n.path) ? 'text-leaf-700' : 'text-ink-faint'}`}
              aria-current={active(n.path) ? 'page' : undefined}>
              <span aria-hidden className={`text-2xl leading-none ${active(n.path) ? '' : 'grayscale opacity-70'}`}>{n.icon}</span>
              {n.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
