import { useEffect, useState } from 'react';

// 아주 단순한 해시 라우터 (#/chat?c=3). 별도 패키지가 필요 없고 새로고침해도 화면이 유지됩니다.
function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs), key: raw };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = `#${to}`;
  if (opts.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else window.location.hash = to;
}
