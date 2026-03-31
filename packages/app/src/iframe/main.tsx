import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./canvas.css";
import { IframeApp } from "./IframeApp.js";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found in iframe.html");

createRoot(rootEl).render(
  <StrictMode>
    <IframeApp />
  </StrictMode>,
);
