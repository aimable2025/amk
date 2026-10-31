import { useEffect, useState } from 'react';
import { User as UserIcon } from 'lucide-react';
import type { AppUser } from '../../types/auth';

export interface UserAvatarProps {
  user?: Pick<
    AppUser,
    'displayName' | 'photoURL' | 'email'
  > | {
    displayName?: string | null;
    photoURL?: string | null;
    email?: string | null;
  } | null;
  name?: string | null;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showName?: boolean;
  subtitle?: string | null;
  nameClassName?: string;
  subtitleClassName?: string;
  statusDot?: 'online' | 'offline' | 'pending' | 'busy' | null;
  showStatus?: boolean;
  isOnline?: boolean;
}

const sizeStyles = {
  xs: {
    container: 'h-7 w-7',
    text: 'text-[10px]',
    icon: 13,
    name: 'text-xs',
    subtitle: 'text-[10px]',
    dot: 'h-2 w-2 border',
  },
  sm: {
    container: 'h-9 w-9',
    text: 'text-xs',
    icon: 16,
    name: 'text-sm',
    subtitle: 'text-[11px]',
    dot: 'h-2.5 w-2.5 border-2',
  },
  md: {
    container: 'h-11 w-11',
    text: 'text-sm',
    icon: 18,
    name: 'text-sm',
    subtitle: 'text-xs',
    dot: 'h-3 w-3 border-2',
  },
  lg: {
    container: 'h-14 w-14',
    text: 'text-base',
    icon: 22,
    name: 'text-base',
    subtitle: 'text-xs',
    dot: 'h-3.5 w-3.5 border-2',
  },
  xl: {
    container: 'h-20 w-20',
    text: 'text-xl',
    icon: 30,
    name: 'text-lg',
    subtitle: 'text-sm',
    dot: 'h-4 w-4 border-2',
  },
};

const PALETTE_CLASSES = [
  'bg-slate-900 text-white',
  'bg-blue-900 text-blue-100',
  'bg-emerald-900 text-emerald-100',
  'bg-indigo-900 text-indigo-100',
  'bg-teal-900 text-teal-100',
  'bg-amber-900 text-amber-100',
  'bg-cyan-900 text-cyan-100',
];

function getPaletteClass(seed: string): string {
  if (!seed) return PALETTE_CLASSES[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE_CLASSES.length;
  return PALETTE_CLASSES[index];
}

export function getInitials(name?: string | null): string {
  const normalized = (name || '').trim();
  if (!normalized) {
    return '';
  }
  const cleaned = normalized.includes('@')
    ? normalized.split('@')[0].replace(/[._-]+/g, ' ')
    : normalized;
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (
    parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

const dotColorMap: Record<NonNullable<UserAvatarProps['statusDot']>, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-400',
  pending: 'bg-amber-500',
  busy: 'bg-rose-500',
};

export default function UserAvatar({
  user,
  name,
  displayName,
  email,
  photoURL,
  size = 'md',
  className = '',
  showName = false,
  subtitle,
  nameClassName = '',
  subtitleClassName = '',
  statusDot = null,
  showStatus = false,
  isOnline = true,
}: UserAvatarProps) {
  const rawName =
    user?.displayName?.trim() ||
    name?.trim() ||
    displayName?.trim() ||
    user?.email?.trim() ||
    email?.trim() ||
    '';

  const resolvedName = rawName || 'Utilisateur Ets AMANI';

  const resolvedPhoto =
    (user?.photoURL && user.photoURL.trim()) ||
    (photoURL && photoURL.trim()) ||
    null;

  const resolvedStatusDot: UserAvatarProps['statusDot'] =
    statusDot ?? (showStatus ? (isOnline ? 'online' : 'offline') : null);

  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [resolvedPhoto]);

  const styles = sizeStyles[size];
  const initials = getInitials(rawName);
  const colorClass = getPaletteClass(rawName);
  const shouldShowImage = Boolean(resolvedPhoto && !imgError);

  const avatar = (
    <div
      className="relative inline-flex shrink-0"
      title={resolvedName}
    >
      <div
        className={[
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full',
          colorClass,
          'ring-2 ring-white/90 shadow-sm select-none',
          styles.container,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {shouldShowImage && resolvedPhoto ? (
          <img
            src={resolvedPhoto}
            alt={`Photo de profil de ${resolvedName}`}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : initials ? (
          <span className={`font-bold tracking-tight leading-none ${styles.text}`}>
            {initials}
          </span>
        ) : (
          <UserIcon size={styles.icon} className="opacity-85" />
        )}
      </div>

      {resolvedStatusDot && (
        <span
          className={[
            'absolute -bottom-0.5 -right-0.5 rounded-full border-white',
            styles.dot,
            dotColorMap[resolvedStatusDot],
          ].join(' ')}
        />
      )}
    </div>
  );

  if (!showName) {
    return avatar;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      {avatar}
      <div className="min-w-0 flex-1">
        <div
          className={[
            'truncate font-semibold text-slate-900',
            styles.name,
            nameClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {resolvedName}
        </div>
        {subtitle && (
          <div
            className={[
              'truncate text-slate-500',
              styles.subtitle,
              subtitleClassName,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
