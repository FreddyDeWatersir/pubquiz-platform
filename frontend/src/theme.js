// ──────────────────────────────────────────────────────────
// THEME.JS — Single source of truth for all styling
// ──────────────────────────────────────────────────────────
//
// WHY THIS EXISTS:
// Before this, every component had hardcoded color values like '#1a1a2e'.
// If you want to change the primary color, you'd have to find and replace
// it in 6+ files. That's fragile and error-prone.
//
// This is the "DRY" principle — Don't Repeat Yourself.
// Define once, import everywhere. Change once, updates everywhere.
//
// LEARNING POINT:
// In professional codebases, this is usually done with CSS variables
// (--primary: #ff6b00) or a theme library (styled-components ThemeProvider).
// For your inline-styles approach, a JS object works fine.
//

export const colors = {
  // Backgrounds — dark to light
  bg: '#0A0A0F',           // deepest background
  bgCard: '#141419',       // card/panel background
  bgCardHover: '#1C1C24',  // card hover state
  bgInput: '#1E1E28',      // input field background

  // Primary — orange (action, CTAs, energy)
  primary: '#FF6B00',
  primaryHover: '#FF8533',
  primaryMuted: 'rgba(255, 107, 0, 0.15)',

  // Secondary — purple (secondary actions, badges, accents)
  secondary: '#7C3AED',
  secondaryHover: '#9461F5',
  secondaryMuted: 'rgba(124, 58, 237, 0.15)',

  // Feedback
  success: '#22C55E',
  successMuted: 'rgba(34, 197, 94, 0.15)',
  error: '#EF4444',
  errorMuted: 'rgba(239, 68, 68, 0.15)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245, 158, 11, 0.15)',

  // Text
  text: '#FFFFFF',
  textMuted: '#8B8B9E',
  textDim: '#5A5A6E',

  // Borders & dividers
  border: '#2A2A38',
  borderLight: '#3A3A4A',
};

// Reusable shadow styles
export const shadows = {
  card: '0 4px 20px rgba(0, 0, 0, 0.4)',
  cardHover: '0 8px 30px rgba(0, 0, 0, 0.6)',
  glow: '0 0 20px rgba(255, 107, 0, 0.2)',
  glowPurple: '0 0 20px rgba(124, 58, 237, 0.2)',
};

// Common style patterns you can spread into components
export const commonStyles = {
  // Full-page container
  pageContainer: {
    minHeight: '100vh',
    backgroundColor: colors.bg,
    color: colors.text,
    padding: '20px',
    fontFamily: "'Outfit', 'Segoe UI', sans-serif",
  },

  // Centered card layout (for join screen, login, etc.)
  centeredContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: colors.bg,
    fontFamily: "'Outfit', 'Segoe UI', sans-serif",
  },

  card: {
    backgroundColor: colors.bgCard,
    padding: '32px',
    borderRadius: '16px',
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.card,
  },

  // Primary button (orange)
  buttonPrimary: {
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    backgroundColor: colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: '700',
    letterSpacing: '0.5px',
    transition: 'all 0.2s ease',
  },

  // Secondary button (purple)
  buttonSecondary: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: colors.secondary,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'all 0.2s ease',
  },

  // Ghost/subtle button
  buttonGhost: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  // Danger button (red)
  buttonDanger: {
    padding: '12px 24px',
    fontSize: '14px',
    backgroundColor: colors.error,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
  },

  // Input field
  input: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '16px',
    backgroundColor: colors.bgInput,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },

  // Section title
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '700',
    margin: 0,
    color: colors.text,
  },

  // Badge styles
  badgeOrange: {
    backgroundColor: colors.primaryMuted,
    color: colors.primary,
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.5px',
  },

  badgePurple: {
    backgroundColor: colors.secondaryMuted,
    color: colors.secondary,
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.5px',
  },

  badgeGreen: {
    backgroundColor: colors.successMuted,
    color: colors.success,
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.5px',
  },

  // Toast notification
  toast: {
    position: 'fixed',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: colors.primary,
    color: '#fff',
    padding: '14px 28px',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    boxShadow: shadows.glow,
    zIndex: 1000,
  },
};
