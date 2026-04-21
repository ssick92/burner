export const webRetroTheme = {
  colorScheme: "light",
  colors: {
    ink: "#1f1f22",
    inkSoft: "#33333a",
    muted: "#6b6b75",
    mutedSoft: "#8a8a95",
    hairline: "rgba(0, 0, 0, 0.12)",
    hairlineStrong: "rgba(0, 0, 0, 0.22)",
    pageBg: "#d8dce3",
    surface: "#fdfcf9",
    surfaceAlt: "#f4f2ec",
    surfaceSunken: "#ebe9e2",
    rowAlt: "#f7f5ef",
    accent: "#3a72b8",
    accentDeep: "#2a568c",
    accentSoft: "#cfdcee",
    danger: "#b54a3a",
    warning: "#b98a2a",
    success: "#4a8a4a",
  },
  radii: {
    sm: "3px",
    md: "5px",
    lg: "8px",
  },
  shadows: {
    sm: "0 1px 2px rgba(30, 28, 35, 0.08)",
    md: "0 2px 6px rgba(30, 28, 35, 0.1)",
    lg: "0 8px 22px rgba(30, 28, 35, 0.12)",
    insetTop: "inset 0 1px 0 rgba(255, 255, 255, 0.65)",
  },
  typography: {
    ui: [
      '"Lucida Grande"',
      '"Lucida Sans Unicode"',
      '"Segoe UI"',
      "Tahoma",
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(", "),
    mono: ['"Monaco"', '"Consolas"', '"Courier New"', "monospace"].join(", "),
    sizes: {
      xs: "11px",
      sm: "12px",
      base: "13px",
      md: "14px",
      lg: "16px",
      xl: "20px",
      "2xl": "26px",
      "3xl": "34px",
    },
  },
} as const;

export const webRetroThemeClassName = "theme-burner-web-retro";

export const webRetroThemeCss = `
.${webRetroThemeClassName} {
  color-scheme: ${webRetroTheme.colorScheme};
  --ink: ${webRetroTheme.colors.ink};
  --ink-soft: ${webRetroTheme.colors.inkSoft};
  --muted: ${webRetroTheme.colors.muted};
  --muted-soft: ${webRetroTheme.colors.mutedSoft};
  --hairline: ${webRetroTheme.colors.hairline};
  --hairline-strong: ${webRetroTheme.colors.hairlineStrong};
  --page-bg: ${webRetroTheme.colors.pageBg};
  --surface: ${webRetroTheme.colors.surface};
  --surface-alt: ${webRetroTheme.colors.surfaceAlt};
  --surface-sunken: ${webRetroTheme.colors.surfaceSunken};
  --row-alt: ${webRetroTheme.colors.rowAlt};
  --accent: ${webRetroTheme.colors.accent};
  --accent-deep: ${webRetroTheme.colors.accentDeep};
  --accent-soft: ${webRetroTheme.colors.accentSoft};
  --danger: ${webRetroTheme.colors.danger};
  --warning: ${webRetroTheme.colors.warning};
  --success: ${webRetroTheme.colors.success};
  --radius-sm: ${webRetroTheme.radii.sm};
  --radius: ${webRetroTheme.radii.md};
  --radius-lg: ${webRetroTheme.radii.lg};
  --shadow-1: ${webRetroTheme.shadows.sm};
  --shadow-2: ${webRetroTheme.shadows.md};
  --shadow-3: ${webRetroTheme.shadows.lg};
  --inset-top: ${webRetroTheme.shadows.insetTop};
  --font-ui: ${webRetroTheme.typography.ui};
  --font-mono: ${webRetroTheme.typography.mono};
  --fs-xs: ${webRetroTheme.typography.sizes.xs};
  --fs-sm: ${webRetroTheme.typography.sizes.sm};
  --fs-base: ${webRetroTheme.typography.sizes.base};
  --fs-md: ${webRetroTheme.typography.sizes.md};
  --fs-lg: ${webRetroTheme.typography.sizes.lg};
  --fs-xl: ${webRetroTheme.typography.sizes.xl};
  --fs-2xl: ${webRetroTheme.typography.sizes["2xl"]};
  --fs-3xl: ${webRetroTheme.typography.sizes["3xl"]};
}
`.trim();
