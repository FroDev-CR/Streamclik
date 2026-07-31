import type { Appearance } from "@clerk/types";

/**
 * Clerk vive dentro de una tarjeta que ya dibuja el layout de autenticación.
 * Estas clases eliminan su envoltorio visual y llevan todos sus controles al
 * mismo lenguaje gráfico negro, crema y amarillo de la tienda pública.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "#050505",
    colorBackground: "transparent",
    colorText: "#050505",
    colorTextSecondary: "#62605a",
    colorInputBackground: "#fffdf6",
    colorInputText: "#050505",
    colorDanger: "#d92d20",
    colorSuccess: "#16803c",
    colorWarning: "#9a6700",
    borderRadius: "0.75rem",
    fontFamily: "inherit",
  },
  elements: {
    rootBox: "auth-clerk-root",
    cardBox: "auth-clerk-card-box",
    card: "auth-clerk-card",
    header: "auth-clerk-header",
    main: "auth-clerk-main",
    footer: "auth-clerk-footer",
    footerItem: "auth-clerk-footer-item",
    footerAction: "auth-clerk-footer-action",
    footerActionText: "auth-clerk-footer-text",
    footerActionLink: "auth-clerk-footer-link",
    footerPages: "auth-clerk-footer-pages",
    socialButtonsRoot: "auth-clerk-social-root",
    socialButtonsBlockButton: "auth-clerk-social-button",
    socialButtonsBlockButtonText: "auth-clerk-social-text",
    dividerRow: "auth-clerk-divider",
    dividerLine: "auth-clerk-divider-line",
    dividerText: "auth-clerk-divider-text",
    form: "auth-clerk-form",
    formFieldLabel: "auth-clerk-label",
    formFieldInput: "auth-clerk-input",
    formFieldAction: "auth-clerk-field-action",
    formButtonPrimary: "auth-clerk-submit",
    identityPreview: "auth-clerk-identity",
    identityPreviewText: "auth-clerk-identity-text",
    alternativeMethodsBlockButton: "auth-clerk-alternative-button",
    otpCodeFieldInput: "auth-clerk-otp-input",
    alert: "auth-clerk-alert",
  },
};
