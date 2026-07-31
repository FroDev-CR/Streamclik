import Image from 'next/image';

/**
 * Logotipo de StreamClick.
 *
 * El archivo es un PNG de 1774×887 con fondo blanco recortado. Se sirve con
 * `next/image` para que Next genere las variantes y no se descarguen 230 KB por
 * un logotipo de cabecera.
 *
 * `priority` en la cabecera porque es el primer elemento con el que el usuario
 * confirma que está en el sitio correcto: cargarlo perezosamente produce un
 * hueco visible justo en la primera pintura.
 */
export function Logo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="StreamClick"
      width={1774}
      height={887}
      priority={priority}
      className={className ?? 'h-7 w-auto'}
    />
  );
}
