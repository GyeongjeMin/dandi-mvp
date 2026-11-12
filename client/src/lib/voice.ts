/**
 * 단디 음성 대화 엔진 (브라우저 내장 기능만 사용 — 설치·키 불필요)
 *
 *  [듣기] Web Speech API 음성인식(STT) — 말이 끝나면(잠깐 멈추면) 자동으로 문장 확정
 *    ↓
 *  [생각] 서버에 스트리밍 요청 → 단디의 답이 만들어지는 대로 조각(delta)을 받음
 *    ↓
 *  [말하기] 조각을 문장 단위로 끊어, 첫 문장이 완성되는 즉시 음성합성(TTS)으로 읽기 시작
 *    ↓  (답을 다 읽으면)
 *  [듣기] 버튼을 다시 누르지 않아도 자동으로 다음 말씀을 들음 … '대화 끝내기'를 누를 때까지 반복
 *
 * 브라우저 제약 (작동하는 것처럼 꾸미지 않기 위해 명시)
 *  - 음성인식은 Chrome·Edge(PC·안드로이드)와 Safari(iOS 14.5+, macOS)에서 됩니다. Firefox 는 지원하지 않습니다.
 *    Chrome 의 음성인식은 인터넷으로 Google 서버를 거칩니다(오프라인 불가).
 *  - 마이크는 https 또는 localhost 주소에서만 쓸 수 있습니다.
 *  - 단디가 말하는 동안에는 듣지 않습니다(스피커 소리를 어르신 말로 잘못 알아듣는 것을 막기 위해).
 *    대신 '말 끊기' 버튼으로 언제든 단디의 말을 멈추고 바로 말씀하실 수 있습니다.
 *  - 목소리(한국어 음성)의 종류와 자연스러움은 기기·브라우저에 설치된 음성에 따라 다릅니다.
 */
import { streamMessage, type Emotion, type SendResult } from './api';

export type VoiceState = 'idle' | 'preparing' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';
export type VoiceErrorKind = 'unsupported' | 'insecure' | 'permission' | 'no-mic' | 'network' | 'server';

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onspeechstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

function recognitionCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const voiceSupport = () => ({
  stt: typeof window !== 'undefined' && !!recognitionCtor(),
  tts: typeof window !== 'undefined' && 'speechSynthesis' in window,
  secure: typeof window !== 'undefined' && window.isSecureContext,
});

// ── 목소리 고르기 ───────────────────────────────

let koVoice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ko'));
  const prefer = ['Google', 'Yuna', 'SunHi', 'Heami', 'InJoon'];
  koVoice = prefer.map((p) => voices.find((v) => v.name.includes(p))).find(Boolean) ?? voices[0] ?? null;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}
export const hasKoreanVoice = () => { pickVoice(); return !!koVoice; };

/** iOS Safari 등은 '버튼을 누른 그 순간'에 한 번 말해야 이후 음성이 나옵니다. 버튼 클릭 처리기에서 바로 호출하세요. */
export function unlockSpeech() {
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch { /* 무시 */ }
}

/** 설정 화면의 '목소리 들어보기' */
export function speakSample(text: string, rate: number) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = rate;
  if (koVoice) u.voice = koVoice;
  window.speechSynthesis.speak(u);
}

// ── 문장 나누기 (스트리밍 조각 → 읽을 문장) ───────────

export class SentenceSplitter {
  private buf = '';
  constructor(private emit: (s: string) => void) {}
  feed(t: string) {
    this.buf += t;
    for (;;) {
      const m = /^([\s\S]*?[.!?。…~]+["”’)]?)\s+/.exec(this.buf);
      if (m && m[1].trim().length >= 4) {
        this.emit(m[1].trim());
        this.buf = this.buf.slice(m[0].length);
        continue;
      }
      // 마침표 없이 너무 길어지면 쉼표·띄어쓰기에서 끊어 먼저 읽기
      if (this.buf.length > 90) {
        const cut = Math.max(this.buf.lastIndexOf(', ', 80), this.buf.lastIndexOf(' ', 80));
        if (cut > 20) { this.emit(this.buf.slice(0, cut + 1).trim()); this.buf = this.buf.slice(cut + 1); continue; }
      }
      break;
    }
  }
  flush() {
    if (this.buf.trim()) this.emit(this.buf.trim());
    this.buf = '';
  }
}

// ── 음성 대화 진행자 ─────────────────────────────

export interface VoiceCallbacks {
  onState: (s: VoiceState) => void;
  onInterim: (text: string) => void;           // 지금 듣고 있는 말 (실시간 자막)
  onUserFinal: (text: string) => void;         // 확정된 어르신의 말
  onDandiText: (text: string) => void;         // 지금 단디가 하는 말 (자막)
  onResult: (r: SendResult) => void;           // 저장까지 끝난 한 번의 주고받기
  onError: (kind: VoiceErrorKind, message: string) => void;
  onPaused: (reason: 'silence' | 'error') => void;
  onEnded: () => void;
  /** 서버가 정한 이번 답의 캐릭터 표정 (답보다 먼저 옴) */
  onMeta?: (emotion: Emotion) => void;
  /** 음성합성이 실제로 소리를 내기 시작·단어 경계·끝 (캐릭터 입 움직임) */
  onSpeech?: (kind: 'start' | 'word' | 'end') => void;
}

const ERROR_TEXT: Record<VoiceErrorKind, string> = {
  unsupported: '이 브라우저에서는 음성 대화를 쓸 수 없어요.',
  insecure: '보안 연결(https)이 아닌 주소라 마이크를 쓸 수 없어요.',
  permission: '마이크 사용이 허용되지 않았어요.',
  'no-mic': '마이크를 찾을 수 없어요.',
  network: '음성 인식에 인터넷 연결이 필요해요. 연결이 불안정한 것 같아요.',
  server: '단디의 대답을 받지 못했어요.',
};

export class VoiceSession {
  state: VoiceState = 'idle';
  private rec: Recognition | null = null;
  private queue: string[] = [];
  private speaking = false;
  private turnDone = true;          // 이번 차례의 답을 서버에서 다 받았는지
  private muted = false;            // '말 끊기' 뒤 남은 답은 읽지 않음
  private silentCount = 0;
  private abort: AbortController | null = null;
  private lastResult: SendResult | null = null;
  private dandiCaption = '';
  private alive = true;
  private utterances = new Set<SpeechSynthesisUtterance>(); // 가비지 컬렉션으로 onend 가 사라지는 브라우저 버그 방지
  private listenTimer: number | null = null;

  constructor(private conversationId: number, private cb: VoiceCallbacks, private rate = 0.9) {}

  private set(s: VoiceState) { this.state = s; this.cb.onState(s); }

  /** 마이크 권한을 먼저 확인합니다(거부·마이크 없음 등을 쉬운 말로 안내하기 위해). */
  async checkMic(): Promise<VoiceErrorKind | null> {
    const sup = voiceSupport();
    if (!sup.secure) return 'insecure';
    if (!sup.stt) return 'unsupported';
    if (!navigator.mediaDevices?.getUserMedia) return null; // 확인할 방법이 없으면 음성인식에 맡김
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return null;
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission';
      if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-mic';
      return null;
    }
  }

  /** 단디의 첫마디를 읽고, 이어서 듣기 시작 */
  async begin(openingText: string) {
    this.set('preparing');
    const err = await this.checkMic();
    if (!this.alive) return;
    if (err) { this.fail(err); return; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.speakTurn(openingText);
  }

  private fail(kind: VoiceErrorKind, detail?: string) {
    this.stopListening();
    this.set('error');
    this.cb.onError(kind, detail ?? ERROR_TEXT[kind]);
  }

  // ── 말하기 ──
  private speakTurn(text: string) {
    this.muted = false;
    this.turnDone = true;
    this.dandiCaption = '';
    const sp = new SentenceSplitter((s) => this.enqueue(s));
    sp.feed(text);
    sp.flush();
  }

  private enqueue(sentence: string) {
    if (this.muted || !this.alive) return;
    this.dandiCaption = this.dandiCaption ? `${this.dandiCaption} ${sentence}` : sentence;
    this.cb.onDandiText(this.dandiCaption);
    this.queue.push(sentence);
    if (!this.speaking) this.playNext();
  }

  private playNext() {
    if (!this.alive) return;
    const next = this.queue.shift();
    if (!next) {
      this.speaking = false;
      if (this.turnDone) this.afterSpeech();
      return;
    }
    this.speaking = true;
    this.set('speaking');
    if (!('speechSynthesis' in window)) {
      // 음성합성이 없으면 자막만 보여 주고 읽는 시간만큼 기다림
      this.cb.onSpeech?.('start');
      globalThis.setTimeout(() => { this.cb.onSpeech?.('end'); this.playNext(); }, Math.max(1200, next.length * 90));
      return;
    }
    const u = new SpeechSynthesisUtterance(next);
    u.lang = 'ko-KR';
    u.rate = this.rate;
    if (koVoice) u.voice = koVoice;
    let finished = false;
    // 안전장치: 일부 브라우저(크롬)는 가끔 '말하기 끝' 신호를 보내지 않아 대화가 멈춥니다.
    // 문장 길이로 넉넉히 잡은 시간 안에 끝 신호가 없으면 끝난 것으로 보고 다음으로 넘어갑니다.
    const guard = globalThis.setTimeout(() => { if (!finished) { window.speechSynthesis.cancel(); done(); } }, Math.max(5000, (next.length * 280) / this.rate));
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      this.utterances.delete(u);
      this.cb.onSpeech?.('end');
      if (this.speaking) this.playNext();
    };
    u.onstart = () => this.cb.onSpeech?.('start');
    u.onboundary = (e) => { if (e.name === 'word') this.cb.onSpeech?.('word'); };
    u.onend = done;
    u.onerror = done;
    this.utterances.add(u);
    window.speechSynthesis.speak(u);
  }

  private afterSpeech() {
    if (!this.alive) return;
    if (this.lastResult?.assistantMessage.endSession) { this.end(); return; }
    // 스피커 소리 끝부분을 듣지 않도록 잠깐 쉬었다가 듣기
    this.listenTimer = window.setTimeout(() => this.listen(), 350);
  }

  /** 단디의 말을 멈추고 바로 듣기 ('말 끊기') */
  interrupt() {
    this.muted = true;
    this.queue = [];
    this.speaking = false;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.listen();
  }

  // ── 듣기 ──
  listen() {
    if (!this.alive) return;
    if (this.listenTimer) { clearTimeout(this.listenTimer); this.listenTimer = null; }
    const Ctor = recognitionCtor();
    if (!Ctor) { this.fail('unsupported'); return; }
    this.stopListening();
    const rec = new Ctor();
    this.rec = rec;
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;        // 말을 잠깐 멈추면 한 문장으로 확정
    rec.maxAlternatives = 1;
    let finalText = '';
    let interimText = '';
    let errorKind: VoiceErrorKind | null = null;
    let noSpeech = false;
    rec.onresult = (e) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      interimText = interim;
      this.cb.onInterim((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech') noSpeech = true;
      else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') errorKind = 'permission';
      else if (e.error === 'audio-capture') errorKind = 'no-mic';
      else if (e.error === 'network') errorKind = 'network';
    };
    rec.onend = () => {
      if (this.rec !== rec || !this.alive) return;
      this.rec = null;
      if (errorKind) { this.fail(errorKind); return; }
      const said = (finalText || interimText).trim();
      if (said) { this.silentCount = 0; this.send(said); return; }
      if (noSpeech || !said) {
        this.silentCount++;
        if (this.silentCount >= 2) { this.set('paused'); this.cb.onPaused('silence'); return; }
        this.listen();
      }
    };
    this.cb.onInterim('');
    this.set('listening');
    try { rec.start(); } catch { this.fail('unsupported'); }
  }

  private stopListening() {
    const r = this.rec;
    this.rec = null;
    if (r) { try { r.abort(); } catch { /* 무시 */ } }
  }

  /** 다시 듣기 (쉬는 중·오류 뒤) */
  resume() { this.silentCount = 0; this.listen(); }

  // ── 보내기 ──
  /** 어르신의 말(음성 인식 결과 또는 화면 버튼·글자 입력)을 보내고 답을 바로 읽기 */
  async send(text: string) {
    if (!this.alive) return;
    this.stopListening();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.queue = [];
    this.speaking = false;
    this.cb.onUserFinal(text);
    this.cb.onInterim('');
    this.set('thinking');
    this.muted = false;
    this.turnDone = false;
    this.lastResult = null;
    this.dandiCaption = '';
    this.cb.onDandiText('');
    const sp = new SentenceSplitter((s) => this.enqueue(s));
    this.abort = new AbortController();
    try {
      const r = await streamMessage(this.conversationId, text, (d) => sp.feed(d), this.abort.signal, (m) => this.cb.onMeta?.(m.emotion));
      if (!this.alive) return;
      sp.flush();
      this.lastResult = r;
      this.turnDone = true;
      // 화면 자막은 저장된 최종 문장으로 맞춤
      if (!this.muted) { this.dandiCaption = r.assistantMessage.content; this.cb.onDandiText(this.dandiCaption); }
      this.cb.onResult(r);
      // '말 끊기'로 이미 듣는 중이면 그대로 둠
      if (!this.muted && !this.speaking && this.queue.length === 0) this.afterSpeech();
    } catch (e) {
      if (!this.alive || (e as Error).name === 'AbortError') return;
      this.turnDone = true;
      const status = (e as { status?: number }).status;
      this.set('paused');
      this.cb.onError(status === 0 ? 'network' : 'server', (e as Error).message);
      this.cb.onPaused('error');
    }
  }

  /** 대화 끝내기 */
  end() {
    if (!this.alive) return;
    this.alive = false;
    if (this.listenTimer) clearTimeout(this.listenTimer);
    this.stopListening();
    this.abort?.abort();
    this.queue = [];
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.state = 'idle';
    this.cb.onState('idle');
    this.cb.onEnded();
  }

  /** 화면을 떠날 때 조용히 정리 (콜백 없이) */
  dispose() {
    this.alive = false;
    if (this.listenTimer) clearTimeout(this.listenTimer);
    this.stopListening();
    this.abort?.abort();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  setRate(rate: number) { this.rate = rate; }
}
