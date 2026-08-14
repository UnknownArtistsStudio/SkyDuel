import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SkyDuel } from "../app/game/SkyDuel";
import "../app/globals.css";

window.SKY_DUEL_ROOM_ORIGIN = "https://loop-and-lead-duel.latelee.chatgpt.site";
const titleArt = new URL("./og.png", window.location.href).href;
document.documentElement.style.setProperty("--title-art", `url("${titleArt}")`);

const root = document.getElementById("root");
if (!root) throw new Error("Sky Duel could not find its game screen.");

createRoot(root).render(
  <StrictMode>
    <SkyDuel />
  </StrictMode>,
);
