/** What a call keybind should do. Lark has no ringing state, so a DM or group is the call. */

export interface CallChannel {
  id: string;
  kind: string;
}

export interface CallVoice {
  channelId: string;
  guildId: string | null;
}

export type CallKeyAction =
  | { op: "join"; channelId: string }
  | { op: "focus"; channelId: string }
  | { op: "leave" }
  | { op: "toast"; message: string };

function isDm(channel: CallChannel | null): channel is CallChannel {
  return Boolean(channel && (channel.kind === "dm" || channel.kind === "group"));
}

export function callKeyAction(id: string, current: CallChannel | null, voice: CallVoice | null): CallKeyAction | null {
  const dm = isDm(current) ? current : null;
  const inDmCall = Boolean(voice && !voice.guildId);
  if (id === "start_call") {
    if (dm) return { op: "join", channelId: dm.id };
    return { op: "toast", message: "Open a direct message to start a call." };
  }
  if (id === "answer_call") {
    if (inDmCall && voice) return { op: "focus", channelId: voice.channelId };
    if (dm) return { op: "join", channelId: dm.id };
    return { op: "toast", message: "No call to answer." };
  }
  if (id === "decline_call") {
    if (inDmCall) return { op: "leave" };
    return { op: "toast", message: "No call to decline." };
  }
  return null;
}
