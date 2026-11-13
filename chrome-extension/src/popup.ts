/** The toolbar popup: which version runs. */

const version = document.getElementById("version");
if (version != null) version.textContent = chrome.runtime.getManifest().version;
