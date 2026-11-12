import { useState } from 'react';
import Character from '../components/Character';
import { Button, Card, Toggle } from '../components/ui';
import { ModeBadge } from '../components/Layout';
import { api, type RegionShare, type User } from '../lib/api';
import { useApp } from '../lib/store';
import { navigate } from '../lib/router';

export const PROVINCES = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
export const SHARE_OPTIONS: Array<{ value: RegionShare; label: string; desc: string }> = [
  { value: 'city', label: '시·군·구까지', desc: '예: 경남 진주시' },
  { value: 'province', label: '시·도까지만', desc: '예: 경남' },
  { value: 'none', label: '공개 안 함', desc: '지역은 추천에 쓰지 않아요' },
];

export default function Onboarding() {
  const { health, setUser, toast } = useApp();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    nickname: '', ageBand: '', regionProvince: '경남', regionCity: '', regionShare: 'city' as RegionShare,
    consentMemory: true, consentMatching: false,
  });
  const [saving, setSaving] = useState(false);
  const ageBands = health?.ageBands ?? ['60대 초반', '60대 후반', '70대 초반', '70대 중반', '70대 후반', '80대 초반', '80대 후반', '90대 이상'];

  const fillDemo = () => setForm({
    nickname: '봄날', ageBand: '70대 초반', regionProvince: '경남', regionCity: '진주시', regionShare: 'city', consentMemory: true, consentMatching: true,
  });

  const submit = async () => {
    setSaving(true);
    try {
      const r = await api<{ user: User }>('/users', { method: 'POST', body: form });
      setUser(r.user);
      toast(`${r.user.nickname}님, 반가워요!`);
      // 소개 페이지의 '단디와 대화하기'로 들어왔다면 바로 대화 화면으로 이어 줍니다.
      navigate(location.hash.startsWith('#/chat') ? '/chat' : '/');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (step === 1) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-8">
        <div className="flex items-center justify-between gap-3">
          <a href="#/intro" className="flex min-h-11 items-center rounded-full px-3 text-base font-bold text-ink-soft hover:bg-cream-200">← 단디 소개 보기</a>
          <ModeBadge />
        </div>
        <div className="mt-4 flex flex-col items-center text-center">
          <Character size={150} bob />
          <h1 className="mt-4 text-4xl font-black text-ink">단디</h1>
          <p className="mt-2 text-2xl font-bold">어르신의 이야기를 기억하는 AI 말벗이에요</p>
        </div>
        <ol className="mt-8 space-y-3">
          {[
            ['💬', '단디와 이야기해요', '옛날이야기, 요즘 이야기 무엇이든 편하게 들려주세요.'],
            ['📒', '소중한 추억을 기억해요', '기억해도 될지 꼭 여쭤보고, 언제든 고치거나 지울 수 있어요.'],
            ['🤝', '비슷한 동네 친구를 소개해요', '취미와 경험이 비슷한 분을 찾아 드려요. 원하실 때만요.'],
          ].map(([icon, t, d], i) => (
            <li key={t} className="flex gap-4 rounded-3xl bg-white p-4 shadow-soft">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-leaf-50 text-2xl" aria-hidden>{icon}</span>
              <div>
                <p className="text-xl font-extrabold">{i + 1}. {t}</p>
                <p className="text-lg text-ink-soft">{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <Button size="lg" className="mt-8 w-full" onClick={() => setStep(2)}>시작하기</Button>
        <p className="mt-4 text-center text-sm text-ink-faint">이 화면은 창업 프로젝트 평가용 시연 프로토타입(MVP)입니다.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <div className="flex items-center justify-between">
        <button className="text-lg font-bold text-ink-soft" onClick={() => setStep(1)}>← 뒤로</button>
        <ModeBadge />
      </div>
      <h1 className="mt-4 text-3xl font-black">단디에게 소개해 주세요</h1>
      <p className="mt-1 text-lg text-ink-soft">실명 대신 불리고 싶은 별명이면 충분해요.</p>
      <button onClick={fillDemo} className="mt-3 rounded-xl border-2 border-dashed border-peach-200 bg-peach-50 px-4 py-2 text-base font-bold text-peach-700">
        🎬 시연용 예시로 채우기 (봄날 · 70대 초반 · 경남 진주시)
      </button>

      <Card className="mt-5 space-y-5">
        <label className="block">
          <span className="mb-1 block text-lg font-bold">별명</span>
          <input className="w-full rounded-2xl border-2 border-cream-300 px-4 py-3 text-xl" maxLength={12} value={form.nickname}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="예: 봄날" />
        </label>
        <div>
          <span className="mb-2 block text-lg font-bold">연령대</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ageBands.map((a) => (
              <button key={a} type="button" onClick={() => setForm({ ...form, ageBand: a })} aria-pressed={form.ageBand === a}
                className={`min-h-12 rounded-2xl border-2 text-base font-bold ${form.ageBand === a ? 'border-leaf-500 bg-leaf-50 text-leaf-700' : 'border-cream-200 bg-white'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-lg font-bold">사는 지역</span>
          <p className="mb-2 text-base text-ink-soft">상세 주소는 묻지도, 저장하지도 않아요.</p>
          <div className="flex gap-2">
            <select className="min-h-14 rounded-2xl border-2 border-cream-300 bg-white px-3 text-lg" value={form.regionProvince}
              onChange={(e) => setForm({ ...form, regionProvince: e.target.value })} aria-label="시·도">
              {PROVINCES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input className="min-w-0 flex-1 rounded-2xl border-2 border-cream-300 px-4 text-lg" maxLength={15} value={form.regionCity}
              onChange={(e) => setForm({ ...form, regionCity: e.target.value })} placeholder="시·군·구 (예: 진주시)" aria-label="시·군·구" />
          </div>
          <span className="mb-2 mt-4 block text-lg font-bold">다른 분께 보여 줄 지역 범위</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {SHARE_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => setForm({ ...form, regionShare: o.value })} aria-pressed={form.regionShare === o.value}
                className={`rounded-2xl border-2 p-3 text-left ${form.regionShare === o.value ? 'border-leaf-500 bg-leaf-50' : 'border-cream-200 bg-white'}`}>
                <span className="block text-base font-bold">{o.label}</span>
                <span className="block text-sm text-ink-soft">{o.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <h2 className="mt-8 text-2xl font-black">동의해 주실 것</h2>
      <p className="mt-1 text-lg text-ink-soft">두 가지는 따로따로 고르실 수 있고, 나중에 ‘내 정보’에서 언제든 바꿀 수 있어요.</p>
      <div className="mt-3 space-y-3">
        <Toggle checked={form.consentMemory} onChange={(v) => setForm({ ...form, consentMemory: v })}
          label="[선택] 대화 속 추억을 기억해도 돼요"
          description="단디가 이야기 속 직업·취미·추억을 찾아 ‘기억해도 될까요?’ 하고 여쭤봐요. [기억할게요]를 누른 것만 저장되고, 언제든 고치거나 지울 수 있어요." />
        <Toggle checked={form.consentMatching} onChange={(v) => setForm({ ...form, consentMatching: v })}
          label="[선택] 친구 추천에 내 정보를 써도 돼요"
          description="확인된 추억 중 직업·취미·관심사·경험과, 공개를 고른 범위의 지역만 써요. 가족 이야기와 연락처는 절대 쓰거나 보여 주지 않아요." />
      </div>

      <Button size="lg" className="mt-8 w-full" disabled={!form.nickname.trim() || !form.ageBand || saving} onClick={submit}>
        {saving ? '준비 중…' : '단디 만나러 가기'}
      </Button>
      {(!form.nickname.trim() || !form.ageBand) && <p className="mt-2 text-center text-base text-ink-soft">별명과 연령대를 골라 주세요.</p>}
    </div>
  );
}
