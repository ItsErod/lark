/** Settings chrome stays out of the first paint. Import it when a pane opens. */

export type SettingsPages = typeof import("./settings-pages");

let settingsPages: SettingsPages | null = null;
let loading: Promise<SettingsPages> | null = null;

export function peekSettingsPages(): SettingsPages | null {
  return settingsPages;
}

export function loadSettingsPages(): Promise<SettingsPages> {
  if (settingsPages) return Promise.resolve(settingsPages);
  if (!loading) {
    loading = import("./settings-pages").then((mod) => {
      settingsPages = mod;
      return mod;
    });
  }
  return loading;
}
