import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DandiAvatar, webglAvailable, type AvatarInfo } from '../lib/avatar/DandiAvatar';
import type { AvatarState } from '../lib/avatar/machine';

/**
 * 3D 단디 (Three.js). 이 파일은 필요할 때만 불러옵니다(React.lazy) — 첫 화면을 무겁게 하지 않기 위해.
 * WebGL 을 못 쓰는 기기나 모델을 못 불러온 경우에는 fallback(사진 캐릭터)을 보여 줍니다.
 */
export default function Dandi3D({ state, reduceMotion = false, interactive = false, fallback, onInfo, spinKey, className = '' }: {
  state: AvatarState;
  reduceMotion?: boolean;
  interactive?: boolean;
  fallback: ReactNode;
  onInfo?: (i: AvatarInfo) => void;
  spinKey?: number;          // 값이 바뀔 때마다 한 바퀴 돌기
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const avatar = useRef<DandiAvatar | null>(null);
  const [failed, setFailed] = useState(() => typeof window !== 'undefined' && !webglAvailable());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (failed || !box.current) return;
    let a: DandiAvatar;
    try {
      a = new DandiAvatar(box.current, {
        reduceMotion, interactive,
        onReady: (i) => { setReady(true); onInfo?.(i); },
        onError: () => setFailed(true),
      });
    } catch {
      setFailed(true);
      return;
    }
    avatar.current = a;
    a.setState(state);
    return () => { a.dispose(); avatar.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, interactive]);

  useEffect(() => { avatar.current?.setState(state); }, [state]);
  useEffect(() => { avatar.current?.setReduceMotion(reduceMotion); }, [reduceMotion]);
  useEffect(() => { if (spinKey) avatar.current?.spin(); }, [spinKey]);

  if (failed) return <>{fallback}</>;
  return (
    <div className={`relative ${className}`}>
      <div ref={box} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 flex items-center justify-center">{fallback}</div>}
    </div>
  );
}
