import { PageTitle } from '../components/ui';

/** '더보기' — 어르신 첫 화면에서 뺀 세부 기능을 모두 이곳에 모았어요. */
const GROUPS: Array<{ title: string; items: Array<{ href: string; icon: string; label: string; desc: string }> }> = [
  {
    title: '이야기',
    items: [
      { href: '#/chat', icon: '⌨️', label: '글자로 이야기하기', desc: '음성 대신 글자로 단디와 대화해요' },
      { href: '#/chat?history=1', icon: '📜', label: '지난 대화 보기', desc: '나눈 이야기를 다시 읽어요' },
      { href: '#/overview', icon: '🗂️', label: '이야기 한눈에 보기', desc: '최근 추억·대화·오늘의 이야깃거리' },
    ],
  },
  {
    title: '사람들과 이어지기',
    items: [
      { href: '#/care', icon: '👪', label: '가족 연결과 알림', desc: '가족 초대 코드, 공유 범위, 복약·생활 알림' },
      { href: '#/friends', icon: '🤝', label: '동네 친구', desc: '취미와 경험이 비슷한 이웃 소개' },
      { href: '#/connections', icon: '💬', label: '교류', desc: '친구 제안과 응답 확인' },
    ],
  },
  {
    title: '설정과 안내',
    items: [
      { href: '#/settings', icon: '⚙️', label: '내 정보 · 대화 방식', desc: '말 빠르기, 말 길이, 동의 설정' },
      { href: '#/intro', icon: '🦦', label: '단디 소개', desc: '단디가 어떤 서비스인지' },
      { href: '#/dandi-3d', icon: '🧸', label: '3D 단디 살펴보기', desc: '단디를 돌려 보고 표정을 확인해요' },
      { href: '#/family', icon: '🏠', label: '가족용 화면 열기', desc: '가족·보호자가 쓰는 화면이에요' },
    ],
  },
];

export default function More() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="더보기" />
      <div className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-lg font-bold text-ink-soft">{g.title}</h2>
            <ul className="overflow-hidden rounded-3xl bg-white shadow-soft">
              {g.items.map((it, i) => (
                <li key={it.href} className={i ? 'border-t border-cream-200' : ''}>
                  <a href={it.href} className="flex min-h-20 items-center gap-4 px-5 py-3 hover:bg-cream-50">
                    <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream-100 text-2xl">{it.icon}</span>
                    <span className="flex-1">
                      <span className="block text-xl font-bold">{it.label}</span>
                      <span className="block text-base text-ink-soft">{it.desc}</span>
                    </span>
                    <span aria-hidden className="text-2xl text-ink-faint">›</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
