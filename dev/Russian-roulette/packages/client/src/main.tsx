import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

document.documentElement.style.setProperty("--table-bg-url", `url("${import.meta.env.BASE_URL}assets/noir-card-table.png")`);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
