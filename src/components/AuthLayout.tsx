import type { ReactNode } from 'react';
import { icon } from '../assets/icons';
import { Icon } from './Icon';
import s from './AuthLayout.module.css';

// Left brand panel shared by the sign-in and password-recovery screens.
export function AuthLayout({ children, plain }: { children: ReactNode; plain?: boolean }) {
  return (
    <div className={s.page}>
      <aside className={s.brandPanel}>
        <div className={s.logo}>
          <Icon name="login-grid" size={26} />
          <p>
            <span>SUPERMARKET</span>
            <span>OPS</span>
          </p>
        </div>
        <div className={s.motif} aria-hidden>
          <div className={`${s.block} ${s.green}`}>
            <img src={icon('login-camera-green')} width={22} height={22} alt="" style={{ left: 100, top: 62 }} />
          </div>
          <div className={`${s.block} ${s.red}`}>
            <img src={icon('login-camera-red')} width={22} height={22} alt="" style={{ left: 80, top: 40 }} />
            <img src={icon('login-pin-red')} width={28} height={28} alt="" style={{ left: 140, top: 36 }} />
            <img src={icon('login-camera-green')} width={22} height={22} alt="" style={{ left: 200, top: 56 }} />
          </div>
          <div className={`${s.block} ${s.amber}`}>
            <img src={icon('login-camera-amber')} width={22} height={22} alt="" style={{ left: 160, top: 45 }} />
          </div>
        </div>
        <div>
          <h1 className={s.headline}>
            Real-time supermarket
            <br />
            operations, <em>powered by AI.</em>
          </h1>
          <p className={s.lede}>Monitor queues, crowding and incidents live — and turn camera video into action for your store team.</p>
        </div>
      </aside>
      <div className={`${s.formSide} ${plain ? s.plain : ''}`}>{children}</div>
    </div>
  );
}
