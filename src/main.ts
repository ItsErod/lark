import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./styles.css";
import { mount } from "./ui/app";
import { mountCallPopout } from "./ui/call-popout";

const root = document.querySelector("#app");
if (root instanceof HTMLElement) {
  if (new URLSearchParams(location.search).has("popout")) mountCallPopout(root);
  else mount(root);
}
