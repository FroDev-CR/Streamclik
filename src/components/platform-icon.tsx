import Image from 'next/image';

import { platformIconSource } from '@/features/catalog/platform-icons';
import { cn } from '@/lib/utils';

export function PlatformIcon({
  iconKey,
  name,
  className,
}: {
  iconKey: string | null | undefined;
  name: string;
  className?: string;
}) {
  return (
    <Image
      src={platformIconSource(iconKey)}
      alt=""
      title={name}
      width={48}
      height={48}
      unoptimized
      aria-hidden
      className={cn('size-8 object-contain', className)}
    />
  );
}
