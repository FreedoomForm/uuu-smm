// Test-taking background presets — picked on the profile page, stored on the
// User row as a preset KEY (the CSS lives here so future presets keep working
// for everyone). '' / null = the standard app background. Applied to the
// start-test, take-test and results screens behind the white cards.
// Shared by src/components/pages/* views via testBackgroundCss().
export const TEST_BG_PRESETS: { id: string; css: string }[] = [
  { id: 'aurora',   css: 'linear-gradient(180deg,#dbeafe 0%,#e0e7ff 45%,#ede9fe 100%)' },
  { id: 'sunset',   css: 'linear-gradient(180deg,#ffedd5 0%,#fecdd3 55%,#fbcfe8 100%)' },
  { id: 'mint',     css: 'linear-gradient(180deg,#d1fae5 0%,#ccfbf1 50%,#e0f2fe 100%)' },
  { id: 'lavender', css: 'linear-gradient(180deg,#ede9fe 0%,#f3e8ff 50%,#fce7f3 100%)' },
  { id: 'peach',    css: 'linear-gradient(180deg,#fef3c7 0%,#ffedd5 55%,#fee2e2 100%)' },
  { id: 'ocean',    css: 'linear-gradient(180deg,#0c4a6e 0%,#0369a1 55%,#0ea5e9 100%)' },
  { id: 'midnight', css: 'linear-gradient(180deg,#0f172a 0%,#1e293b 55%,#334155 100%)' },
  { id: 'rose',     css: 'linear-gradient(180deg,#881337 0%,#9f1239 55%,#be123c 100%)' },
];

export const testBackgroundCss = (id: string) => TEST_BG_PRESETS.find(p => p.id === id)?.css || '';
