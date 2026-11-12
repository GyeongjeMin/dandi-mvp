import { useEffect, useState } from 'react';
import { Button, Card, PageTitle, Toggle } from '../components/ui';
import { ConfirmModal } from '../components/memory';
import { ModeBadge } from '../components/Layout';
import { api, type Prefs, type RegionShare, type User } from '../lib/api';
import { hasKoreanVoice, speakSample, voiceSupport } from '../lib/voice';
import { useApp } from '../lib/store';
import { navigate } from '../lib/router';
import { PROVINCES, SHARE_OPTIONS } from './Onboarding';

const RATES = [
  { value: 0.8, label: '천천히' },
  { value: 0.9, label: '보통' },
  { value: 1.0, label: '조금 빠르게' },
];

/** 대화 방식 — 계정에 저장되어 휴대폰·태블릿·컴퓨터 어디서든 같게 적용돼요. */
function TalkStyle() {
  const { toast } = useApp();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [topic, setTopic] = useState('');
  useEffect(() => { api<{ prefs: Prefs }>('/prefs').then((r) => setPrefs(r.prefs)).catch(() => {}); }, []);
  if (!prefs) return null;
  const save = async (patch: Partial<Prefs>, msg?: string) => {
    try {
      const r = await api<{ prefs: Prefs }>('/prefs', { method: 'PATCH', body: patch });
      setPrefs(r.prefs);
      if (msg) toast(msg);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const sup = voiceSupport();
  return (
    <Card className="space-y-5">
      <h2 className="text-xl font-extrabold">단디와 이야기하는 방식</h2>
      <div>
        <p className="mb-2 text-lg font-bold">단디의 말 길이</p>
        <div className="grid grid-cols-2 gap-2">
          {([['short', '짧게', '한두 문장으로'], ['normal', '보통', '조금 더 자세히']] as const).map(([v, l, d]) => (
            <button key={v} onClick={() => save({ replyLength: v }, `말 길이를 ‘${l}’로 바꿨어요`)} aria-pressed={prefs.replyLength === v}
              className={`rounded-2xl border-2 p-3 text-left ${prefs.replyLength === v ? 'border-leaf-500 bg-leaf-50' : 'border-cream-200 bg-white'}`}>
              <span className="block text-lg font-bold">{l}</span><span className="block text-base text-ink-soft">{d}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-sm text-ink-faint">AI 모드에서 반영돼요. 데모 모드에서는 미리 준비된 문장을 써요.</p>
      </div>
      <div>
        <p className="mb-2 text-lg font-bold">단디의 목소리 빠르기</p>
        <div className="grid grid-cols-3 gap-2">
          {RATES.map((r) => (
            <button key={r.value} onClick={() => { save({ speechRate: r.value }); speakSample('안녕하세요, 단디예요. 이 빠르기로 말할게요.', r.value); }} aria-pressed={prefs.speechRate === r.value}
              className={`min-h-14 rounded-2xl border-2 text-lg font-bold ${prefs.speechRate === r.value ? 'border-leaf-500 bg-leaf-50' : 'border-cream-200 bg-white'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-sm text-ink-faint">
          {!sup.tts ? '이 브라우저는 소리로 읽어 주기를 지원하지 않아요.' : hasKoreanVoice() ? '누르면 그 빠르기로 들려 드려요.' : '이 기기에 한국어 목소리가 없으면 다른 목소리로 읽힐 수 있어요.'}
        </p>
      </div>
      <Toggle checked={prefs.reduceMotion} onChange={(v) => save({ reduceMotion: v }, v ? '단디의 움직임을 줄였어요' : '단디가 다시 자연스럽게 움직여요')}
        label="단디 움직임 줄이기"
        description="대화 화면의 3D 단디가 천천히, 조금만 움직여요. 어지럽거나 눈이 피로할 때 켜 주세요." />
      <div>
        <p className="mb-1 text-lg font-bold">먼저 꺼내지 않았으면 하는 이야기</p>
        <p className="mb-2 text-base text-ink-soft">적어 두시면 단디가 그 이야기로 먼저 말을 걸지 않아요.</p>
        <div className="flex flex-wrap gap-2">
          {prefs.avoidTopics.map((t) => (
            <button key={t} onClick={() => save({ avoidTopics: prefs.avoidTopics.filter((x) => x !== t) })} className="min-h-11 rounded-full border-2 border-cream-300 bg-white px-4 text-base font-bold" aria-label={`${t} 지우기`}>
              {t} ✕
            </button>
          ))}
        </div>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (topic.trim()) { save({ avoidTopics: [...prefs.avoidTopics, topic.trim()] }, '적어 두었어요'); setTopic(''); } }}>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={15} placeholder="예: 병원, 돌아가신 남편" aria-label="피하고 싶은 이야기"
            className="min-h-12 min-w-0 flex-1 rounded-2xl border-2 border-cream-300 px-4 text-lg" />
          <Button size="sm" type="submit" disabled={!topic.trim()}>추가</Button>
        </form>
      </div>
    </Card>
  );
}

export default function Settings() {
  const { user, setUser, health, toast, logout } = useApp();
  const [form, setForm] = useState(user);
  const [saving, setSaving] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  useEffect(() => setForm(user), [user]);
  if (!form || !user) return null;

  const patch = async (body: Partial<User>, msg: string) => {
    setSaving(true);
    try {
      const r = await api<{ user: User }>('/me', { method: 'PATCH', body });
      setUser(r.user);
      toast(msg);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSaving(false); }
  };

  const wipe = async () => {
    try {
      await api('/me', { method: 'DELETE' });
      setWipeOpen(false);
      logout();
      navigate('/');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const ageBands = health?.ageBands ?? [];
  return (
    <div className="space-y-6">
      <PageTitle title="내 정보와 동의" subtitle="단디가 무엇을 기억하고 어디에 쓰는지 직접 정하실 수 있어요." />

      <Card className="space-y-3">
        <h2 className="text-xl font-extrabold">정보 활용 동의</h2>
        <Toggle checked={user.consentMemory} onChange={(v) => patch({ consentMemory: v }, v ? '추억 기억하기를 켰어요' : '추억 기억하기를 껐어요. 이미 기억한 추억은 그대로 있어요.')}
          label="대화 속 추억 기억하기"
          description="켜 두면 단디가 이야기 속 추억을 찾아 ‘기억해도 될까요?’ 하고 여쭤봐요. 꺼 두면 새로 기억하지 않아요." />
        <Toggle checked={user.consentMatching} onChange={(v) => patch({ consentMatching: v }, v ? '친구 추천을 켰어요' : '친구 추천을 껐어요')}
          label="친구 추천에 내 정보 쓰기"
          description="확인된 추억의 직업·취미·관심사·경험과 공개 범위 안의 지역만 써요. 가족 이야기와 연락처는 쓰지 않아요." />
      </Card>

      <TalkStyle />

      <Card className="space-y-2">
        <h2 className="text-xl font-extrabold">가족 연결과 알림</h2>
        <p className="text-lg text-ink-soft">가족 초대, 가족에게 보여 줄 범위, 복약·생활 알림은 따로 모아 두었어요.</p>
        <Button variant="secondary" onClick={() => navigate('/care')}>👪 가족 연결과 알림 열기</Button>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-extrabold">내 소개</h2>
        <label className="block">
          <span className="mb-1 block text-lg font-bold">별명</span>
          <input className="w-full rounded-2xl border-2 border-cream-300 px-4 py-3 text-lg" maxLength={12} value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-lg font-bold">연령대</span>
          <select className="min-h-14 w-full rounded-2xl border-2 border-cream-300 bg-white px-3 text-lg" value={form.ageBand} onChange={(e) => setForm({ ...form, ageBand: e.target.value })}>
            {ageBands.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <div>
          <span className="mb-1 block text-lg font-bold">사는 지역</span>
          <div className="flex gap-2">
            <select className="min-h-14 rounded-2xl border-2 border-cream-300 bg-white px-3 text-lg" value={form.regionProvince} onChange={(e) => setForm({ ...form, regionProvince: e.target.value })} aria-label="시·도">
              {PROVINCES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input className="min-w-0 flex-1 rounded-2xl border-2 border-cream-300 px-4 text-lg" maxLength={15} value={form.regionCity} onChange={(e) => setForm({ ...form, regionCity: e.target.value })} aria-label="시·군·구" />
          </div>
        </div>
        <div>
          <span className="mb-2 block text-lg font-bold">다른 분께 보여 줄 지역 범위</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {SHARE_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => setForm({ ...form, regionShare: o.value as RegionShare })} aria-pressed={form.regionShare === o.value}
                className={`rounded-2xl border-2 p-3 text-left ${form.regionShare === o.value ? 'border-leaf-500 bg-leaf-50' : 'border-cream-200 bg-white'}`}>
                <span className="block text-base font-bold">{o.label}</span>
                <span className="block text-sm text-ink-soft">{o.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <Button disabled={saving || !form.nickname.trim()} onClick={() => patch({
          nickname: form.nickname, ageBand: form.ageBand, regionProvince: form.regionProvince, regionCity: form.regionCity, regionShare: form.regionShare,
        }, '내 소개를 저장했어요')}>저장하기</Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl font-extrabold">단디는 이렇게 정보를 다뤄요</h2>
        <ul className="space-y-2 text-lg">
          <li>✔︎ <b>[기억할게요]를 누른 이야기만</b> 기억해요. 단디의 짐작은 ‘짐작’이라고 따로 표시해요.</li>
          <li>✔︎ 기억은 ‘나의 추억’에서 <b>언제든 고치거나 지울 수</b> 있고, 바로 대화와 추천에 반영돼요.</li>
          <li>✔︎ 가족 이야기와 민감한 이야기는 <b>다른 분께 자동으로 전하지 않아요.</b></li>
          <li>✔︎ 연락처·상세 주소는 저장하지 않고, 다른 분의 동의 없이 연결되지 않아요.</li>
          <li>✔︎ AI 연결용 비밀키는 서버에만 있고 화면(브라우저)에는 전달되지 않아요.</li>
        </ul>
        <p className="rounded-2xl bg-cream-100 p-4 text-base text-ink-soft">
          이 프로그램은 평가용 시연 프로토타입(MVP)이에요. 위 원칙을 기능으로 구현했지만, 실제 서비스로 출시하기 전에는 개인정보 보호법 등 법률 검토와 보안 점검(로그인·암호화·접근 기록 등)을 추가로 거쳐야 해요.
        </p>
        <div className="flex items-center gap-2 text-base text-ink-soft">현재 대화 방식: <ModeBadge /></div>
      </Card>

      <Card className="space-y-3 border-red-100">
        <h2 className="text-xl font-extrabold">내 정보 모두 지우기</h2>
        <p className="text-lg text-ink-soft">대화 기록, 추억, 추천 결과, 교류 제안까지 모두 지우고 처음 화면으로 돌아가요.</p>
        <Button variant="danger" onClick={() => setWipeOpen(true)}>모든 정보 지우기</Button>
      </Card>

      <ConfirmModal open={wipeOpen} onClose={() => setWipeOpen(false)} onConfirm={wipe} danger
        title="정말 모든 정보를 지울까요?" confirmLabel="모두 지우기"
        body={<p>{user.nickname}님의 대화와 추억이 모두 사라지고 되돌릴 수 없어요.</p>} />
    </div>
  );
}
