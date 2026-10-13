import type { SettingEntry } from "./ui/settings";

export const SHARE_SETTING_ENTRIES: readonly SettingEntry[] = [
  {
    id: "voice.share.quality",
    section: "voice",
    label: "Screen share quality",
    description: "Default resolution and frame rate for Go Live. Every option is available.",
    keywords: "720 1080 1440 2160 4k source fps bitrate stream golive",
  },
  {
    id: "voice.share.audio",
    section: "voice",
    label: "Share application audio",
    description: "Send the shared app's audio on the stream when the computer can capture it.",
    keywords: "loopback wasapi sound",
  },
  {
    id: "voice.share.encoder",
    section: "voice",
    label: "Hardware encoder",
    description: "NVENC, AMF, Quick Sync, VideoToolbox, or Media Foundation. Auto picks one that this computer can use.",
    keywords: "nvenc amf qsv h264 hardware",
  },
];

let installed = false;

export async function installShareSettings(): Promise<void> {
  if (installed) return;
  installed = true;
  const { registerSettingEntries } = await import("./ui/settings");
  registerSettingEntries(SHARE_SETTING_ENTRIES);
}

/** Tests clear the settings catalog between cases. */
export function resetShareSettingsInstall(): void {
  installed = false;
}
