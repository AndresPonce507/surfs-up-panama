export type Theme = 'light' | 'dark';

const storageKey = 'surfs-up-theme';

export function connectThemeToggle(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (button === null) return;
  let theme: Theme;
  try {
    const saved = window.localStorage.getItem(storageKey);
    theme = saved === 'dark' ? 'dark' : 'light';
  } catch {
    theme = 'light';
  }
  const apply = (): void => {
    document.documentElement.dataset.theme = theme;
    const label = theme === 'dark' ? button.dataset.activateLight : button.dataset.activateDark;
    if (label === undefined) throw new Error();
    button.ariaLabel = label;
    const chosenBackground = getComputedStyle(document.documentElement).getPropertyValue('--bg');
    document.documentElement.style.background = chosenBackground;
    for (const chrome of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) chrome.content = chosenBackground;
  };
  apply();
  button.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    apply();
    try { window.localStorage.setItem(storageKey, theme); } catch { /* browser storage is optional */ }
  });
}
