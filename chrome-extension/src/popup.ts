/** The toolbar popup: which version runs, and the "Allow any website" switch. */

import { COMMIT } from "./build.js";
import { anyWebsite, setAnyWebsite } from "./settings.js";

const version = document.getElementById("version");
if (version != null) version.textContent = `${chrome.runtime.getManifest().version} (${COMMIT})`;

const box = document.getElementById("any-website") as HTMLInputElement | null;
const option = document.getElementById("any-website-option");
const advanced = document.getElementById("advanced") as HTMLDetailsElement | null;
const reach = document.getElementById("reach");
const reachText = reach?.firstChild?.textContent ?? "";

function show(on: boolean): void {
  if (box != null) box.checked = on;
  option?.classList.toggle("on", on);
  // Turned on, it stays in view: the user should not forget it.
  if (on && advanced != null) advanced.open = true;
  if (reach?.firstChild != null)
    reach.firstChild.textContent = on
      ? "\n      It answers only peershare.sandclaw.ai and pages on this computer. Allow any website is on: it reaches this computer, private networks and the internet.\n      "
      : reachText;
}

void anyWebsite().then(show);
box?.addEventListener("change", () => {
  const on = box.checked;
  void setAnyWebsite(on).then(() => show(on));
});
