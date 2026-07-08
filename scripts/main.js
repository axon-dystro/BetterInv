/* Better Inventory - Foundry VTT v13/v14 compatible lightweight module */

const MODULE_ID = "betterinv";
const DEFAULT_CATEGORIES = ["Schriftrollen", "Werkzeuge", "Materialien", "Magic Items"];
let betterInvPopup = null;

Hooks.once("init", () => {
  registerBetterInvHotkey();
});

Hooks.once("ready", async () => {
  console.log("Better Inventory loaded!");
  ui.notifications.info("Better Inventory ist aktiv!");
  ensureBetterInvButton();
});

Hooks.on("renderHotbar", () => {
  ensureBetterInvButton();
});

Hooks.on("controlToken", () => {
  const windowEl = document.getElementById("betterinv-window");
  if (windowEl) renderBetterInvWindow();
});

function registerBetterInvHotkey() {
  if (!game?.keybindings) return;

  game.keybindings.register(MODULE_ID, "toggleInventory", {
    name: "Better Inventory öffnen/schließen",
    hint: "Öffnet oder schließt das Better-Inventory-Fenster.",
    editable: [{ key: "KeyI" }],
    onDown: () => {
      toggleBetterInvWindow();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}

function ensureBetterInvButton() {
  if (document.getElementById("betterinv-button")) return;

  const hotbar = document.getElementById("hotbar")
    ?? document.querySelector("#interface #hotbar")
    ?? document.querySelector(".hotbar");

  if (!hotbar) {
    setTimeout(ensureBetterInvButton, 500);
    return;
  }

  const button = document.createElement("button");
  button.id = "betterinv-button";
  button.type = "button";
  button.title = "Better Inventory öffnen (I)";
  button.innerHTML = "🎒";
  button.addEventListener("click", () => toggleBetterInvWindow());

  hotbar.appendChild(button);
}

function getCurrentActor() {
  return canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
}

async function getCategories(actor) {
  const stored = actor?.getFlag(MODULE_ID, "categories");
  if (Array.isArray(stored) && stored.length) return stored;
  return DEFAULT_CATEGORIES;
}

async function setCategories(actor, categories) {
  if (!actor) return;
  const clean = [...new Set(categories.map(c => String(c).trim()).filter(Boolean))];
  await actor.setFlag(MODULE_ID, "categories", clean);
}

function itemCategory(item) {
  return item.getFlag(MODULE_ID, "category") || "__unsorted";
}

async function setItemCategory(item, category) {
  if (!item) return;
  if (!category || category === "__unsorted") await item.unsetFlag(MODULE_ID, "category");
  else await item.setFlag(MODULE_ID, "category", category);
}

function toggleBetterInvWindow() {
  const existing = document.getElementById("betterinv-window");
  if (existing) {
    existing.remove();
    return;
  }
  renderBetterInvWindow();
}

async function renderBetterInvWindow() {
  const actor = getCurrentActor();

  let windowEl = document.getElementById("betterinv-window");
  if (!windowEl) {
    windowEl = document.createElement("section");
    windowEl.id = "betterinv-window";
    windowEl.className = "betterinv-window";
    windowEl.style.left = windowEl.style.left || "120px";
    windowEl.style.top = windowEl.style.top || "110px";
    document.body.appendChild(windowEl);
  }

  if (!actor) {
    windowEl.innerHTML = `
      <header class="betterinv-header">
        <h2>🎒 Better Inventory</h2>
        <div class="betterinv-header-actions">
          <button type="button" class="betterinv-popout" title="Als Browser-Popup öffnen">⧉</button>
          <button type="button" class="betterinv-close" title="Schließen">×</button>
        </div>
      </header>
      <div class="betterinv-body">
        <p>Kein Token ausgewählt und kein Charakter deinem User zugeordnet.</p>
        <p class="betterinv-hint">Wähle einen Token auf der Map aus oder ordne deinem User einen Charakter zu.</p>
      </div>
      <div class="betterinv-resize-hint">↘</div>
    `;
    activateWindowListeners(windowEl, actor);
    return;
  }

  const categories = await getCategories(actor);
  const inventoryItems = Array.from(actor.items ?? []).filter(item => {
    return ["weapon", "equipment", "consumable", "tool", "loot", "container", "backpack"].includes(item.type);
  });

  const sections = [{ id: "__unsorted", name: "Unsortiert" }, ...categories.map(c => ({ id: c, name: c }))];

  const sectionHtml = sections.map(section => {
    const items = inventoryItems.filter(item => itemCategory(item) === section.id);
    const rows = items.length
      ? items.map(item => itemRowHtml(item, categories)).join("")
      : `<p class="betterinv-empty">Leer</p>`;

    return `
      <details class="betterinv-category" open>
        <summary>${escapeHtml(section.name)} <span>${items.length}</span></summary>
        <div class="betterinv-items">${rows}</div>
      </details>
    `;
  }).join("");

  windowEl.innerHTML = `
    <header class="betterinv-header">
      <h2>🎒 Better Inventory</h2>
      <div class="betterinv-header-actions">
        <button type="button" class="betterinv-popout" title="Als Browser-Popup öffnen">⧉</button>
        <button type="button" class="betterinv-close" title="Schließen">×</button>
      </div>
    </header>

    <div class="betterinv-body">
      <div class="betterinv-actor">
        <strong>${escapeHtml(actor.name)}</strong>
        <span>${inventoryItems.length} Items</span>
      </div>

      <div class="betterinv-toolbar">
        <input type="text" class="betterinv-new-category" placeholder="Neue Kategorie, z.B. Schriftrollen">
        <button type="button" class="betterinv-add-category">+ Kategorie</button>
      </div>

      ${sectionHtml}
    </div>
    <div class="betterinv-resize-hint">↘</div>
  `;

  activateWindowListeners(windowEl, actor);
}

function itemRowHtml(item, categories) {
  const img = item.img || "icons/svg/item-bag.svg";
  const qty = foundry.utils.getProperty(item, "system.quantity") ?? 1;
  const weight = foundry.utils.getProperty(item, "system.weight") ?? "–";
  const current = itemCategory(item);

  const options = [`<option value="__unsorted" ${current === "__unsorted" ? "selected" : ""}>Unsortiert</option>`]
    .concat(categories.map(cat => `<option value="${escapeAttr(cat)}" ${current === cat ? "selected" : ""}>${escapeHtml(cat)}</option>`))
    .join("");

  return `
    <article class="betterinv-item" data-item-id="${item.id}">
      <img src="${escapeAttr(img)}" alt="">
      <div class="betterinv-item-main">
        <button type="button" class="betterinv-open-item" title="Item öffnen">${escapeHtml(item.name)}</button>
        <small>${escapeHtml(item.type)} · Anzahl: ${escapeHtml(String(qty))} · Gewicht: ${escapeHtml(String(weight))}</small>
      </div>
      <select class="betterinv-category-select" title="Kategorie wählen">
        ${options}
      </select>
    </article>
  `;
}

function activateWindowListeners(windowEl, actor) {
  windowEl.querySelector(".betterinv-close")?.addEventListener("click", () => windowEl.remove());
  windowEl.querySelector(".betterinv-popout")?.addEventListener("click", () => openBetterInvPopup(windowEl));
  makeBetterInvDraggable(windowEl);

  windowEl.querySelector(".betterinv-add-category")?.addEventListener("click", async () => {
    const input = windowEl.querySelector(".betterinv-new-category");
    const name = input?.value?.trim();
    if (!name) return;
    const categories = await getCategories(actor);
    if (categories.includes(name)) {
      ui.notifications.warn("Diese Kategorie gibt es schon.");
      return;
    }
    await setCategories(actor, [...categories, name]);
    renderBetterInvWindow();
  });

  windowEl.querySelectorAll(".betterinv-category-select").forEach(select => {
    select.addEventListener("change", async event => {
      const row = event.currentTarget.closest(".betterinv-item");
      const item = actor?.items?.get(row?.dataset?.itemId);
      await setItemCategory(item, event.currentTarget.value);
      renderBetterInvWindow();
    });
  });

  windowEl.querySelectorAll(".betterinv-open-item").forEach(button => {
    button.addEventListener("click", event => {
      const row = event.currentTarget.closest(".betterinv-item");
      const item = actor?.items?.get(row?.dataset?.itemId);
      item?.sheet?.render(true);
    });
  });
}

function makeBetterInvDraggable(windowEl) {
  const header = windowEl.querySelector(".betterinv-header");
  if (!header || header.dataset.dragReady === "1") return;
  header.dataset.dragReady = "1";

  header.addEventListener("mousedown", event => {
    if (event.button !== 0) return;
    if (event.target.closest("button, input, select, textarea, a")) return;

    event.preventDefault();
    const rect = windowEl.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    function onMove(moveEvent) {
      const maxLeft = window.innerWidth - 80;
      const maxTop = window.innerHeight - 50;
      const left = Math.max(0, Math.min(maxLeft, moveEvent.clientX - offsetX));
      const top = Math.max(0, Math.min(maxTop, moveEvent.clientY - offsetY));
      windowEl.style.left = `${left}px`;
      windowEl.style.top = `${top}px`;
      windowEl.style.right = "auto";
      windowEl.style.bottom = "auto";
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function openBetterInvPopup(windowEl) {
  const bodyHtml = windowEl.querySelector(".betterinv-body")?.innerHTML ?? "";
  const title = "Better Inventory";

  if (betterInvPopup && !betterInvPopup.closed) {
    betterInvPopup.focus();
  } else {
    betterInvPopup = window.open("", "betterinv-popout", "width=620,height=720,resizable=yes,scrollbars=yes");
  }

  if (!betterInvPopup) {
    ui.notifications.warn("Popup wurde vom Browser blockiert.");
    return;
  }

  betterInvPopup.document.open();
  betterInvPopup.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { margin: 0; padding: 12px; background: #111; color: #f0e6c8; font-family: sans-serif; }
          h1 { margin: 0 0 12px; font-size: 22px; }
          .betterinv-note { opacity: .75; margin-bottom: 12px; }
          .betterinv-actor, .betterinv-toolbar { display: flex; gap: 8px; justify-content: space-between; margin-bottom: 10px; }
          .betterinv-toolbar { display: none; }
          .betterinv-category { margin: 8px 0; border: 1px solid #7a6a45; border-radius: 6px; background: rgba(255,255,255,.04); }
          .betterinv-category summary { display: flex; justify-content: space-between; padding: 8px 10px; cursor: pointer; font-weight: bold; }
          .betterinv-items { padding: 6px; }
          .betterinv-item { display: grid; grid-template-columns: 36px 1fr 150px; gap: 8px; align-items: center; padding: 6px; border-bottom: 1px solid rgba(255,255,255,.08); }
          .betterinv-item img { width: 34px; height: 34px; object-fit: cover; border: 1px solid #7a6a45; border-radius: 4px; }
          .betterinv-open-item { border: 0; background: transparent; color: #f0e6c8; text-align: left; font-weight: bold; }
          select, input, button { background: #222; color: #f0e6c8; border: 1px solid #7a6a45; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>🎒 Better Inventory</h1>
        <div class="betterinv-note">Popup-Ansicht. Änderungen machst du aktuell noch im Foundry-Fenster.</div>
        ${bodyHtml}
      </body>
    </html>
  `);
  betterInvPopup.document.close();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
