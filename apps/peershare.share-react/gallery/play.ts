/**
 * Interaction scripts for gallery frames: the steps a person takes, run against the real
 * components in the page (no test framework). They find controls the way a person names them:
 * a button's text or label, a field's label.
 */

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function all<T extends Element>(selector: string): T[] {
  return [...document.querySelectorAll<T>(selector)];
}

function named(el: Element): string {
  return (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The control whose label or text matches, waiting for it to appear. */
async function find(name: string | RegExp, selector: string): Promise<HTMLElement> {
  const match = (el: Element) =>
    typeof name === "string" ? named(el) === name : name.test(named(el));
  for (let i = 0; i < 50; i++) {
    const el = all<HTMLElement>(selector).find(match);
    if (el != null) return el;
    await wait(50);
  }
  throw new Error(`no ${selector} named ${String(name)}`);
}

const CONTROLS = 'button, [role="menuitem"], [role="switch"], a';

/**
 * Clicks a button, menu item, tab or switch the way a mouse does: Radix menus open on
 * pointerdown and Radix tabs switch on mousedown, so both are sent before the click.
 */
export async function click(name: string | RegExp): Promise<void> {
  const el = await find(name, CONTROLS);
  el.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }),
  );
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  el.click();
  await wait(150);
}

/** Types into the field labelled `label` the way React sees typing. */
export async function type(label: string, value: string): Promise<void> {
  let input: HTMLInputElement | undefined;
  for (let i = 0; i < 50 && input == null; i++) {
    const byAria = all<HTMLInputElement>("input").find(
      (el) => el.getAttribute("aria-label") === label,
    );
    const byLabel = all<HTMLLabelElement>("label").find((l) => named(l) === label);
    input =
      byAria ??
      (byLabel?.htmlFor
        ? (document.getElementById(byLabel.htmlFor) as HTMLInputElement)
        : undefined);
    if (input == null) await wait(50);
  }
  if (input == null) throw new Error(`no field labelled ${label}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(100);
}

export type Play = () => Promise<void>;
