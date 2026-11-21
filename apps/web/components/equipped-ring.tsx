import type { PortalCharacter } from '../lib/api';

export function EquippedRing({ character }: { character?: PortalCharacter }) {
  if (!character?.current) return null;
  const ring = character.equippedRing;
  if (!ring) return <div className="equipped-ring-fact"><small>장착 반지</small><b>미장착</b></div>;
  const pending = ring.balancePending || ring.critChance === null || ring.critDamage === null;
  return (
    <>
      <div className="equipped-ring-fact"><small>장착 반지</small><b>{ring.name} · {ring.grade} · +{ring.enhancement} · ★{ring.stars}</b></div>
      {pending ? (
        <div className="equipped-ring-fact"><small>반지 능력치</small><b>밸런스 승인 대기</b></div>
      ) : (
        <>
          <div><small>치명타 확률</small><b>{ring.critChance?.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%</b></div>
          <div><small>치명타 피해 증가</small><b>{ring.critDamage?.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%</b></div>
        </>
      )}
      <div className="equipped-ring-fact"><small>반지 옵션</small><b>{ring.options.length ? ring.options.map((option) => option.label).join(' · ') : '옵션 없음'}</b></div>
    </>
  );
}
