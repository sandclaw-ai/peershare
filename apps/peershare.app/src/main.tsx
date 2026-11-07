import { createRoot } from "react-dom/client";
import "./styles.css";
import { loadConfig } from "./config.js";
import { GuestApp } from "./guest-app.js";
import { isGuestPage } from "./routes.js";
import { SharerApp } from "./sharer-app.js";

const root = createRoot(document.getElementById("root") as HTMLElement);
const config = await loadConfig();
root.render(
  isGuestPage(location.pathname) ? <GuestApp config={config} /> : <SharerApp config={config} />,
);
