/** Logos disponibles para las plataformas. Los SVG viven en `/public` para no depender de CDNs. */
export const PLATFORM_ICON_OPTIONS = [
  { key: 'generic', label: 'Genérico', src: '/icon.svg' },
  { key: 'netflix', label: 'Netflix', src: '/platform-icons/netflix.svg' },
  { key: 'disney_plus', label: 'Disney+', src: '/platform-icons/disney_plus.svg' },
  { key: 'max', label: 'HBO Max', src: '/platform-icons/hbo-max.png' },
  { key: 'prime_video', label: 'Prime Video', src: '/platform-icons/prime_video.svg' },
  { key: 'paramount_plus', label: 'Paramount+', src: '/platform-icons/paramount_plus.svg' },
  { key: 'apple_tv', label: 'Apple TV+', src: '/platform-icons/apple_tv.svg' },
  { key: 'crunchyroll', label: 'Crunchyroll', src: '/platform-icons/crunchyroll.svg' },
  { key: 'hulu', label: 'Hulu', src: '/platform-icons/hulu.svg' },
  { key: 'peacock', label: 'Peacock', src: '/platform-icons/peacock.svg' },
  { key: 'pluto_tv', label: 'Pluto TV', src: '/platform-icons/pluto_tv.svg' },
  { key: 'youtube', label: 'YouTube', src: '/platform-icons/youtube.svg' },
  { key: 'spotify', label: 'Spotify', src: '/platform-icons/spotify.svg' },
  { key: 'twitch', label: 'Twitch', src: '/platform-icons/twitch.svg' },
  { key: 'mubi', label: 'MUBI', src: '/platform-icons/mubi.svg' },
  { key: 'starz', label: 'STARZ', src: '/platform-icons/starz.svg' },
  { key: 'iptv', label: 'IPTV', src: '/platform-icons/iptv.svg' },
] as const;

export type PlatformIconKey = (typeof PLATFORM_ICON_OPTIONS)[number]['key'];

export function isPlatformIconKey(value: string): value is PlatformIconKey {
  return PLATFORM_ICON_OPTIONS.some((option) => option.key === value);
}

export function platformIconSource(value: string | null | undefined): string {
  return PLATFORM_ICON_OPTIONS.find((option) => option.key === value)?.src ?? '/icon.svg';
}
