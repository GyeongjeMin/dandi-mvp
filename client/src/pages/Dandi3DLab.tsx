import { lazy, Suspense, useReducer, useState } from 'react';
import Character from '../components/Character';
import { avatarReducer, initialAvatarState, type ConversationPhase, type Emotion } from '../lib/avatar/machine';
import type { AvatarInfo } from '../lib/avatar/DandiAvatar';

const Dandi3D = lazy(() => import('../components/Dandi3D'));

/**
 * 3D 단디 살펴보기 (#/dandi-3d) — 로그인 없이 열리는 확인용 화면.
 * 시연·심사 때 모델을 돌려 보고, 상태(대기·듣기·생각·말하기)와 표정(기쁨·공감)을 하나씩 확인할 수 있습니다.
 * 여기의 버튼은 '확인용'이며, 실제 대화 화면에서는 음성 대화 이벤트가 상태를 바꿉니다.
 */
const PHASES: Array<{ phase: ConversationPhase; label: string }> = [
  { phase: 'idle', label: '대기' },
  { phase: 'listening', label: '듣기' },
  { phase: 'thinking', label: '생각' },
  { phase: 'speaking', label: '말하기' },
];
const EMOTIONS: Array<{ emotion: Emotion; label: string }> = [
  { emotion: 'neutral', label: '보통' },
  { emotion: 'happy', label: '기쁨' },
  { emotion: 'comforting', label: '공감·위로' },
];

export default function Dandi3DLab() {
  const [state, dispatch] = useReducer(avatarReducer, initialAvatarState);
  const [info, setInfo] = useState<AvatarInfo | null>(null);
  const [reduce, setReduce] = useState(false);
  const [spin, setSpin] = useState(0);
  const [talkTimer, setTalkTimer] = useState<number | null>(null);

  const setPhase = (phase: ConversationPhase) => {
    if (talkTimer) { clearInterval(talkTimer); setTalkTimer(null); }
    dispatch({ type: 'PHASE', phase });
    if (phase === 'speaking') {
      // 확인용: 음성 없이 '말하는 중' 신호를 흉내 냄 (실제 대화에서는 음성합성 이벤트가 이 역할)
      dispatch({ type: 'SPEECH', kind: 'start', at: performance.now() });
      setTalkTimer(window.setInterval(() => dispatch({ type: 'SPEECH', kind: 'word', at: performance.now() }), 380));
    }
    if (phase === 'listening') {
      setTalkTimer(window.setInterval(() => dispatch({ type: 'HEARD', at: performance.now() }), 1600));
    }
  };
  const setEmotion = (emotion: Emotion) => {
    if (state.mode !== 'speaking') setPhase('speaking');
    dispatch({ type: 'EMOTION', emotion });
  };

  return (
    <div className="min-h-dvh bg-cream-100 px-4 pb-12 pt-6">
      <div className="mx-auto max-w-3xl">
        <a href="#/intro" className="text-base font-bold text-ink-soft underline">← 단디 소개</a>
        <h1 className="mt-3 text-3xl font-black">3D 단디 살펴보기</h1>
        <p className="mt-1 text-lg text-ink-soft">제품 사진을 바탕으로 만든 3D 모델이에요. 손가락이나 마우스로 좌우로 끌면 돌려 볼 수 있어요.</p>

        <div className="mt-4 overflow-hidden rounded-[2rem] bg-gradient-to-b from-peach-50 to-cream-200">
          <Suspense fallback={<div className="flex h-[min(70vh,560px)] items-center justify-center"><Character size={220} /></div>}>
            <Dandi3D state={state} reduceMotion={reduce} interactive onInfo={setInfo} spinKey={spin}
              className="h-[min(70vh,560px)] w-full cursor-grab"
              fallback={<div className="flex h-full flex-col items-center justify-center gap-2"><Character size={220} /><p className="text-base text-ink-soft">이 기기에서는 3D를 표시할 수 없어 사진으로 보여 드려요.</p></div>} />
          </Suspense>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="대화 상태">
            <span className="w-16 text-base font-bold text-ink-soft">상태</span>
            {PHASES.map((p) => (
              <button key={p.phase} onClick={() => setPhase(p.phase)} aria-pressed={state.mode === (p.phase as string)}
                className={`min-h-12 rounded-full px-5 text-lg font-bold ${state.mode === (p.phase as string) ? 'bg-ink text-white' : 'bg-white text-ink-soft'}`}>{p.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="표정">
            <span className="w-16 text-base font-bold text-ink-soft">표정</span>
            {EMOTIONS.map((e) => (
              <button key={e.emotion} onClick={() => setEmotion(e.emotion)} aria-pressed={state.emotion === e.emotion}
                className={`min-h-12 rounded-full px-5 text-lg font-bold ${state.emotion === e.emotion ? 'bg-peach-600 text-white' : 'bg-white text-ink-soft'}`}>{e.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-base font-bold text-ink-soft">보기</span>
            <button onClick={() => setSpin((x) => x + 1)} className="min-h-12 rounded-full bg-white px-5 text-lg font-bold text-ink-soft">한 바퀴 돌기</button>
            <label className="flex min-h-12 items-center gap-2 rounded-full bg-white px-5 text-lg font-bold text-ink-soft">
              <input type="checkbox" checked={reduce} onChange={(e) => setReduce(e.target.checked)} className="h-5 w-5" /> 움직임 줄이기
            </label>
          </div>
        </div>

        <div className="mt-6 rounded-3xl bg-white p-5 text-base text-ink-soft">
          <p className="font-bold text-ink">모델 정보</p>
          <p className="mt-1">형식: glTF 2.0 바이너리(GLB) · 파일: /models/dandi.glb{info ? ` · 삼각형 ${info.triangles.toLocaleString()}개 · 노드 ${info.nodes}개 · 재질 ${info.materials}개` : ''}</p>
          <p className="mt-1">제작: 사진의 비율을 재서 코드로 만든 3D 메시(client/scripts/build-dandi-model.mjs). 표정·동작은 이름 붙은 부위(머리·눈·입·볼·귀·팔·꼬리)를 실시간으로 움직이는 방식이에요.</p>
          <p className="mt-1">이 화면의 버튼은 확인용이에요. 실제 대화 화면에서는 음성 인식·AI 응답·음성 출력 이벤트가 상태를 바꿔요.</p>
        </div>
      </div>
    </div>
  );
}
