/**
 * Tailwind CSS v4 se integra como plugin de PostCSS. Ya no hace falta
 * `tailwind.config.js`: el tema se define con la directiva `@theme` dentro de
 * `src/app/globals.css`, junto a los estilos que lo usan.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
