import "@fontsource/inter/latin-400.css";
import "./styles.css";
import "./design.css";
import "./design-composer.css";
import "./design-messages.css";
import "./design-profile.css";
import "./design-voice.css";
import "./design-chrome.css";
import { installCrashHandlers, reportCrash } from "./crash";
import { notifyInterfaceBoot } from "./interface-update";
import { mount } from "./ui/app";

installCrashHandlers();

if (!new URLSearchParams(location.search).has("bench")) {
  const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 300));
  idle(() => {
    void import("@fontsource/inter/latin-500.css");
    void import("@fontsource/inter/latin-600.css");
    void import("@fontsource/inter/latin-700.css");
  });
}

const root = document.querySelector("#app");
const popout = new URLSearchParams(location.search).has("popout");
if (root instanceof HTMLElement && popout) {
  void import("./ui/call-popout").then(({ mountCallPopout }) => {
    try {
      mountCallPopout(root);
      notifyInterfaceBoot();
    } catch (error) {
      reportCrash(error);
    }
  });
} else if (root instanceof HTMLElement) {
  try {
    mount(root);
    notifyInterfaceBoot();
  } catch (error) {
    reportCrash(error);
  }
}
