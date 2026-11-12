import { useCallback, useEffect, useState } from 'react';
import Character from '../components/Character';
import { Button, Card, PageTitle, Spinner } from '../components/ui';
import { api, type FamilyPost } from '../lib/api';
import { formatDate } from '../lib/format';
import { navigate } from '../lib/router';
import { useApp } from '../lib/store';

/** 어르신이 보는 '가족 소식' — 가족이 보낸 사진과 메시지 */
export default function FamilyNews() {
  const { toast } = useApp();
  const [posts, setPosts] = useState<FamilyPost[] | null>(null);
  const [hasFamily, setHasFamily] = useState(true);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api<{ posts: FamilyPost[] }>('/care/posts'),
        api<{ members: unknown[] }>('/care'),
      ]);
      setPosts(p.posts);
      setHasFamily(c.members.length > 0);
      // 화면에 보여 드렸으니 '봤어요'로 표시 (가족 화면에 반영)
      for (const x of p.posts.filter((x) => !x.seenAt)) api(`/care/posts/${x.id}/seen`, { method: 'POST' }).catch(() => {});
    } catch (e) { toast((e as Error).message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  if (!posts) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="가족 소식" subtitle="가족이 보낸 사진과 메시지예요. 단디와 함께 보며 이야기할 수 있어요." />

      {posts.length === 0 ? (
        <Card className="flex flex-col items-center py-10 text-center">
          <Character size={100} />
          <p className="mt-3 text-xl font-bold">아직 도착한 소식이 없어요</p>
          {hasFamily ? (
            <p className="mt-1 text-lg text-ink-soft">가족이 사진이나 메시지를 보내면 여기에 보이고, 단디가 먼저 알려 드려요.</p>
          ) : (
            <>
              <p className="mt-1 text-lg text-ink-soft">가족과 연결하면 가족이 보낸 사진과 메시지를 여기서 볼 수 있어요.</p>
              <Button className="mt-4" onClick={() => navigate('/care')}>가족과 연결하기</Button>
            </>
          )}
        </Card>
      ) : (
        <ul className="space-y-5">
          {posts.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-3xl bg-white shadow-soft">
              {p.photoUrl && <img src={p.photoUrl} alt={`${p.from} 님이 보낸 사진`} loading="lazy" className="max-h-[70vh] w-full bg-cream-200 object-contain" />}
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-extrabold">{p.from}</p>
                  <span className="text-base text-ink-faint">{formatDate(p.createdAt, true)}</span>
                  {!p.seenAt && <span className="rounded-full bg-peach-600 px-2.5 py-0.5 text-sm font-bold text-white">새 소식</span>}
                </div>
                {p.message && <p className="mt-2 text-xl leading-relaxed">{p.message}</p>}
                <Button className="mt-4 w-full sm:w-auto" variant="peach" onClick={() => navigate(`/?talk=1&post=${p.id}`)}>
                  🎙️ 이 소식으로 단디와 이야기하기
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
