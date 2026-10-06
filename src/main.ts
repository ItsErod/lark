import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./styles.css";
import { mount } from "./ui/app";

const root = document.querySelector("#app");
if (root instanceof HTMLElement) mount(root);
