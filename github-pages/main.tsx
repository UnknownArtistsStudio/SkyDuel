import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SkyWars } from "../app/game/SkyWars";
import "../app/globals.css";

window.SKY_WARS_ROOM_ORIGIN = "https://loop-and-lead-duel.latelee.chatgpt.site";

const root = document.getElementById("root");
if (!root) throw new Error("Sky Wars could not find its game screen.");

createRoot(root).render(
  <StrictMode>
    <SkyWars />
  </StrictMode>,
);
