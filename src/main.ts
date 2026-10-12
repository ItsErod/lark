import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./styles.css";
import "./design.css";
import { installCrashHandlers, reportCrash } from "./crash";
import { mount } from "./ui/app";
import { mountCallPopout } from "./ui/call-popout";

installCrashHandlers();

const root = document.querySelector("#app");
if (root instanceof HTMLElement) {
  try {
    if (new URLSearchParams(location.search).has("popout")) mountCallPopout(root);
    else mount(root);
  } catch (error) {
    reportCrash(error);
  }
}
