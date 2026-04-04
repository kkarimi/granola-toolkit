/** @jsxImportSource solid-js */

import { render } from "solid-js/web";

import { App } from "./App.tsx";
import "./styles.css";

const root = document.getElementById("granola-web-root");

if (!root) {
  throw new Error("Granola web root element not found");
}

render(() => <App />, root);
