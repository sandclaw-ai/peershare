/**
 * The extension's own settings, in `chrome.storage.local`: only the popup
 * writes them, so no web page can change what the extension may reach.
 */

const ANY_WEBSITE = "anyWebsite";

/** "Allow any website": relay to public URLs too. Off unless the user turned it on. */
export async function anyWebsite(): Promise<boolean> {
  const stored = await chrome.storage.local.get(ANY_WEBSITE);
  return stored[ANY_WEBSITE] === true;
}

export async function setAnyWebsite(on: boolean): Promise<void> {
  await chrome.storage.local.set({ [ANY_WEBSITE]: on });
}
