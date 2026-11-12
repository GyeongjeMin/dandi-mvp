import type { ComponentType } from 'react';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Character from './components/Character';
import { useApp } from './lib/store';
import { useRoute } from './lib/router';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Memories from './pages/Memories';
import Friends from './pages/Friends';
import Connections from './pages/Connections';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';
import LandingPage from './landing/LandingPage';
import ElderHome from './pages/ElderHome';
import FamilyNews from './pages/FamilyNews';
import More from './pages/More';
import CareSettings from './pages/CareSettings';
import FamilyApp from './family/FamilyApp';
import Dandi3DLab from './pages/Dandi3DLab';

export default function App() {
  const { ready, user, healthError } = useApp();
  const route = useRoute();

  // 소개(랜딩) 페이지는 서버·로그인 없이도 볼 수 있어요.
  if (route.path === '/intro') return <LandingPage />;
  if (route.path === '/dandi-3d') return <Dandi3DLab />;
  // 가족·보호자용 화면은 어르신 계정과 별개 (가족 전용 연결)
  if (route.path.startsWith('/family')) return <FamilyApp />;

  if (!ready) return <div className="pt-24"><Spinner label="단디를 깨우고 있어요…" /></div>;

  if (healthError && !user) {
    return (
      <div className="mx-auto max-w-lg px-6 pt-20 text-center">
        <Character size={120} mood="think" className="mx-auto" />
        <h1 className="mt-4 text-2xl font-black">단디 서버에 연결하지 못했어요</h1>
        <p className="mt-2 text-lg text-ink-soft">백엔드가 켜져 있는지 확인해 주세요. 프로젝트 폴더에서 <code className="rounded bg-white px-2">npm run dev</code> 로 실행하면 함께 켜져요.</p>
        <button className="mt-6 min-h-14 rounded-2xl bg-leaf-600 px-6 text-lg font-bold text-white" onClick={() => location.reload()}>다시 시도</button>
      </div>
    );
  }

  if (!user) return <Onboarding />;

  const pages: Record<string, ComponentType> = {
    '/': ElderHome,
    '/overview': Home,
    '/news': FamilyNews,
    '/more': More,
    '/care': CareSettings,
    '/chat': Chat,
    '/memories': Memories,
    '/friends': Friends,
    '/connections': Connections,
    '/settings': Settings,
  };
  const Page = pages[route.path] ?? ElderHome;
  return (
    <Layout path={route.path}>
      <Page key={route.path} />
    </Layout>
  );
}
