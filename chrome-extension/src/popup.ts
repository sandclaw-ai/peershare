/** The toolbar popup: which version runs. */

import { COMMIT } from "./build.js";

const version = document.getElementById("version");
if (version != null) version.textContent = `${chrome.runtime.getManifest().version} (${COMMIT})`;
