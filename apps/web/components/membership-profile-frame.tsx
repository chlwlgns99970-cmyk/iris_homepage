import Image from 'next/image';
import styles from './membership-features.module.css';

export function MembershipProfileFrame({
  src,
  alt,
  active,
}: {
  src: string;
  alt: string;
  active: boolean;
}) {
  return <span className={`${styles.profileFrame} ${active ? styles.profileFrameActive : ''}`} data-membership-frame={active ? 'active' : 'free'}>
    <Image src={src} alt={alt} width={66} height={66} />
    {active && <span className={styles.memberBadge}>MEMBER</span>}
  </span>;
}
