// Fills the page from JSON next to it. Paths are relative, so the site works at any prefix,
// and in a Guest's isolated origin, where every request goes over the mesh to the Sharer.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function load(name) {
  const res = await fetch(`data/${name}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${name}.json: ${res.status}`);
  return res.json();
}

const tone = { up: "ok", degraded: "warn", down: "bad" };

async function status(el) {
  const { updated, services } = await load("status");
  el.innerHTML = services
    .map(
      (s) => `<article class="card"><h2>${esc(s.name)}
<span class="pill ${tone[s.state] ?? "warn"}">${esc(s.state)}</span></h2>
<p>${esc(s.note)}</p></article>`,
    )
    .join("");
  document.getElementById("updated").textContent = new Date(updated).toLocaleString();
}

async function releases(el) {
  const { releases } = await load("releases");
  el.innerHTML = releases
    .map(
      (r) => `<tr><td><code>${esc(r.version)}</code></td><td>${esc(r.date)}</td>
<td>${esc(r.summary)}</td></tr>`,
    )
    .join("");
}

for (const el of document.querySelectorAll("[data-fill]")) {
  const fill = { status, releases }[el.dataset.fill];
  fill?.(el).catch((e) => {
    el.innerHTML = `<p class="note">Could not load the data: ${esc(e.message)}</p>`;
  });
}
