// 단디 캐릭터 — 조개를 품에 안은 수달 돌봄인형(제품 콘셉트 이미지).
// 소개 페이지(#/intro)와 같은 이미지를 써서 앱 전체가 하나의 브랜드로 보이게 합니다.
// 작은 크기(60px 이하)에서는 얼굴이 잘 보이도록 동그란 프로필로, 큰 크기에서는 전신으로 보여 줍니다.

interface Props {
  size?: number;
  mood?: 'happy' | 'talk' | 'think';
  className?: string;
  bob?: boolean;
}

const SRC = '/landing/dandi-front.png'; // 197 × 297

export default function Character({ size = 96, mood = 'happy', className = '', bob = false }: Props) {
  // 생각 중일 때는 고개를 살짝 갸웃
  const tilt = mood === 'think' ? 'rotate-[-6deg]' : '';

  if (size <= 60) {
    return (
      <span
        role="img"
        aria-label="단디"
        className={`inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-otter-100 ${bob ? 'dandi-bob' : ''} ${className}`}
        style={{ width: size, height: size }}
      >
        <img src={SRC} alt="" width={197} height={297} draggable={false}
          className="h-auto select-none"
          style={{ width: size * 0.82, transform: `translateY(${size * 0.1}px)${mood === 'think' ? ' rotate(-6deg)' : ''}` }} />
      </span>
    );
  }

  return (
    <img
      src={SRC}
      alt="단디"
      width={197}
      height={297}
      draggable={false}
      className={`h-auto select-none object-contain product-shadow ${tilt} ${bob ? 'dandi-bob' : ''} ${className}`}
      style={{ width: size * 0.8 }}
    />
  );
}
