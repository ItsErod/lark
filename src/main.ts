import "@fontsource/inter/latin-400.css";
import "./styles.css";
import "./design.css";
import "./design-composer.css";
import "./design-messages.css";
import "./design-profile.css";
import { installCrashHandlers, reportCrash } from "./crash";
import { mount } from "./ui/app";
import { mountCallPopout } from "./ui/call-popout";

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
if (root instanceof HTMLElement) {
  try {
    if (new URLSearchParams(location.search).has("popout")) mountCallPopout(root);
    else mount(root);
  } catch (error) {
    reportCrash(error);
  }
}
