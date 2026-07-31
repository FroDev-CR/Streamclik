import type { Appearance } from '@clerk/types';

/**
 * Tema de los componentes de Clerk.
 *
 * Clerk renderiza sus formularios en el mismo árbol de React que la aplicación,
 * no en un iframe, así que hereda las fuentes pero no los colores. Sin este
 * objeto, el login aparece en blanco sobre una aplicación oscura: no es un
 * detalle estético, es la clase de discontinuidad que hace dudar al usuario de
 * si sigue en el mismo sitio justo cuando va a escribir su contraseña.
 *
 * Los valores se toman de los tokens de `globals.css` en vez de repetir hex
 * sueltos allí donde hagan falta, para que un cambio de paleta no deje el login
 * anclado a los colores viejos.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: '#1e7fff',
    colorBackground: 'transparent',
    colorText: '#f2f4f8',
    colorTextSecondary: '#9aa1b1',
    colorInputBackground: '#171a22',
    colorInputText: '#f2f4f8',
    colorDanger: '#ef4444',
    colorSuccess: '#22c55e',
    colorWarning: '#f59e0b',
    borderRadius: '0.75rem',
    fontFamily: 'inherit',
  },
  elements: {
    // La tarjeta ya la pinta el layout de (auth); dejar que Clerk pinte otra
    // produce un borde dentro de otro borde.
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none border-0 bg-transparent',
    card: 'bg-transparent shadow-none border-0 p-0',
    header: 'hidden',
    footer: 'bg-transparent',
    footerAction: 'bg-transparent',
    formButtonPrimary:
      'bg-[#1e7fff] hover:bg-[#4d9bff] text-white normal-case font-medium tracking-normal',
    // Los campos van opacos aunque la tarjeta sea translúcida: un input
    // semitransparente sobre el degradado deja el texto escrito compitiendo con
    // la onda de detrás justo mientras se teclea la contraseña.
    formFieldInput: 'bg-[#171a22] border-[#23262f]',
    socialButtonsBlockButton: 'bg-[#171a22] border-[#23262f] hover:bg-[#1d2029]',
    dividerLine: 'bg-[#23262f]',
  },
};
