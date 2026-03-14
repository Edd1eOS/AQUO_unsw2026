/**
 * Augments ImportMetaEnv with Vite/WXT build-time flags.
 * DEV is true in development and stripped in production builds.
 */
interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly MODE?: string;
  /** Lemon Squeezy checkout URL for the Purchase CTA. Set in .env.local; do not commit. */
  readonly VITE_LS_CHECKOUT_URL?: string;
}
