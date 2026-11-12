// 브라우저 내장 음성 기능 (설치 필요 없음). 지원하지 않는 브라우저에서는 버튼이 숨겨집니다.

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 0.9; // 어르신을 위해 조금 천천히
  const ko = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('ko'));
  if (ko) u.voice = ko;
  window.speechSynthesis.speak(u);
}

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void;
};

function getRecognitionCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
export const canListen = () => typeof window !== 'undefined' && !!getRecognitionCtor();

/** 말로 입력하기. onText 로 인식된 문장을 돌려줍니다. 반환값을 호출하면 중지. */
export function listen(onText: (t: string) => void, onEnd: () => void): () => void {
  const Ctor = getRecognitionCtor();
  if (!Ctor) { onEnd(); return () => {}; }
  const r = new Ctor();
  r.lang = 'ko-KR';
  r.interimResults = true;
  r.continuous = false;
  r.onresult = (e) => {
    const text = Array.from(e.results).map((x) => x[0].transcript).join('');
    onText(text);
  };
  r.onend = onEnd;
  r.onerror = onEnd;
  r.start();
  return () => r.stop();
}
