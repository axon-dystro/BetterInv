/* Better Inventory - Foundry VTT v14 lightweight module */

const MODULE_ID = "betterinv";
const DEFAULT_CATEGORIES = [];
let betterInvPopup = null;
let betterInvActionMenuCleanup = null;
let betterInvState = {
  actorId: null,
  containerId: null,
  search: "",
  scale: 1
};

Hooks.once("init", () => {
  registerBetterInvHotkey();
});

Hooks.once("ready", async () => {
  console.log("Better Inventory loaded!");
  ensureBetterInvButton();
  installBetterInvInputGuard();
  installBetterInvDialogZGuard();
});

Hooks.on("renderHotbar", () => ensureBetterInvButton());
Hooks.on("controlToken", () => { if (document.getElementById("betterinv-window")) renderBetterInvWindow(); });
Hooks.on("updateActor", actor => refreshIfCurrentActor(actor));
Hooks.on("createItem", item => refreshIfItemActor(item));
Hooks.on("updateItem", item => refreshIfItemActor(item));
Hooks.on("deleteItem", item => refreshIfItemActor(item));

function registerBetterInvHotkey() {
  if (!game?.keybindings) return;
  game.keybindings.register(MODULE_ID, "toggleInventory", {
    name: "Better Inventory öffnen/schließen",
    hint: "Öffnet oder schließt das Better-Inventory-Fenster.",
    editable: [{ key: "KeyI" }],
    onDown: () => { toggleBetterInvWindow(); return true; },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}


function installBetterInvInputGuard() {
  if (document.body?.dataset?.betterInvInputGuard === "1") return;
  if (document.body?.dataset) document.body.dataset.betterInvInputGuard = "1";
  const guard = event => {
    const target = event.target;
    if (!target?.closest?.("#betterinv-window .betterinv-search, .betterinv-dialog-top input, .betterinv-dialog-top textarea")) return;
    // Foundry registers global single-key hotkeys. While focus is in our fields,
    // keep the keystroke inside the input without cancelling normal typing.
    event.stopImmediatePropagation();
  };
  ["keydown", "keyup", "keypress"].forEach(type => {
    document.addEventListener(type, guard, true);
    window.addEventListener(type, guard, true);
  });
}

function bringFoundryDialogsToFront({ avoidOverlap = false } = {}) {
  const selectors = [
    ".dialog.app.window-app",
    ".application.dialog",
    ".dnd5e2.dialog",
    ".dnd5e.dialog",
    ".app.window-app",
    ".application",
    "[role='dialog']"
  ];
  const betterInv = document.getElementById("betterinv-window");
  for (const el of document.querySelectorAll(selectors.join(","))) {
    if (!el || el.id === "betterinv-window" || el.closest?.("#betterinv-window")) continue;
    el.style.zIndex = "20000";
    el.classList.add("betterinv-dialog-top");
    if (avoidOverlap && betterInv) moveElementOutsideBetterInv(el, betterInv);
  }
}

function moveElementOutsideBetterInv(el, betterInv) {
  const bi = betterInv.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const overlaps = !(r.right < bi.left || r.left > bi.right || r.bottom < bi.top || r.top > bi.bottom);
  if (!overlaps) return;
  const gap = 14;
  let left = bi.right + gap;
  let top = Math.max(8, Math.min(bi.top + 20, window.innerHeight - r.height - 8));
  if (left + r.width > window.innerWidth - 8) left = bi.left - r.width - gap;
  if (left < 8) {
    left = Math.max(8, Math.min(window.innerWidth - r.width - 8, bi.left + 24));
    top = bi.bottom + gap;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, bi.top - r.height - gap);
  }
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
}

function elevateRecentFoundryApps() {
  for (const delay of [0, 60, 140, 260, 500]) {
    setTimeout(() => bringFoundryDialogsToFront({ avoidOverlap: true }), delay);
  }
}

function installBetterInvDialogZGuard() {
  if (document.body?.dataset?.betterInvDialogZGuard === "1") return;
  if (document.body?.dataset) document.body.dataset.betterInvDialogZGuard = "1";
  bringFoundryDialogsToFront();
  const observer = new MutationObserver(() => bringFoundryDialogsToFront());
  observer.observe(document.body, { childList: true, subtree: true });
}

function ensureBetterInvButton() {
  if (document.getElementById("betterinv-button")) return;
  const hotbar = document.getElementById("hotbar") ?? document.querySelector("#interface #hotbar") ?? document.querySelector(".hotbar");
  if (!hotbar) { setTimeout(ensureBetterInvButton, 500); return; }
  const button = document.createElement("button");
  button.id = "betterinv-button";
  button.type = "button";
  button.title = "Better Inventory öffnen (I)";
  button.innerHTML = `<img src="icons/containers/bags/pack-leather-brown.webp" alt="">`;
  button.addEventListener("click", () => toggleBetterInvWindow());
  hotbar.appendChild(button);
}

function getCurrentActor() {
  const selected = canvas?.tokens?.controlled?.[0]?.actor;
  if (selected) return selected;
  if (betterInvState.actorId) return game.actors?.get(betterInvState.actorId) ?? null;
  return game.user.character ?? null;
}

function getSelectablePlayerActors() {
  const playerUsers = game.users?.filter(u => !u.isGM) ?? [];
  const userCharacterIds = new Set(playerUsers.map(u => u.character?.id).filter(Boolean));
  const actors = game.actors?.filter(actor => {
    if (actor.type !== "character") return false;
    if (userCharacterIds.has(actor.id)) return true;
    return playerUsers.some(user => {
      const level = actor.ownership?.[user.id] ?? actor.permission?.[user.id] ?? 0;
      return level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });
  }) ?? [];
  return [...new Map(actors.map(a => [a.id, a])).values()].sort((a, b) => a.name.localeCompare(b.name));
}

function actorChooserHtml(actors) {
  if (!actors.length) return `<p class="betterinv-hint">Keine Spieler-Charaktere mit Owner-Rechten gefunden.</p>`;
  return `
    <div class="betterinv-gm-chooser">
      <h3>Charakter auswählen</h3>
      <p class="betterinv-hint">Wähle einen Spielercharakter, dessen Inventar du verwalten möchtest.</p>
      <div class="betterinv-gm-actor-grid">
        ${actors.map(actor => `
          <button type="button" class="betterinv-gm-actor" data-actor-id="${escapeAttr(actor.id)}">
            <img src="${escapeAttr(actor.img || "icons/svg/mystery-man.svg")}" alt="">
            <span>${escapeHtml(actor.name)}</span>
          </button>
        `).join("")}
      </div>
    </div>`;
}

function refreshIfCurrentActor(actor) {
  const current = getCurrentActor();
  if (current?.id === actor?.id && document.getElementById("betterinv-window")) renderBetterInvWindow();
}

function refreshIfItemActor(item) {
  const current = getCurrentActor();
  if (current?.id === item?.parent?.id && document.getElementById("betterinv-window")) renderBetterInvWindow();
}

function getInventoryItems(actor) {
  return Array.from(actor?.items ?? []).filter(item => ["weapon", "equipment", "consumable", "tool", "loot", "container", "backpack"].includes(item.type));
}

function isContainerLike(item) {
  if (!item) return false;
  if (["container", "backpack"].includes(item.type)) return true;

  // DnD5e v5+ stores real inventory containers with capacity/contents data,
  // even if not every container is shown in the sheet's short top strip.
  const capacity = foundry.utils.getProperty(item, "system.capacity");
  const contents = foundry.utils.getProperty(item, "system.contents");
  const containerType = foundry.utils.getProperty(item, "system.type.value") ?? foundry.utils.getProperty(item, "system.type");
  if (containerType === "container" || containerType === "backpack") return true;
  if (capacity && typeof capacity === "object") return true;
  if (Array.isArray(contents)) return true;

  // Conservative name fallback for common D&D containers that may be imported oddly.
  // Avoid obvious non-containers like Bagpipes, Bag of Beans, Bag of Tricks, Bag of Sand.
  const name = String(item.name ?? "").toLowerCase();
  const falseBags = ["bagpipes", "bag of beans", "bag of tricks", "bag of sand"];
  if (falseBags.some(x => name.includes(x))) return false;
  return /\b(backpack|saddlebags?|pouch|sack|chest|case|box|quiver|bag of holding|bag of devouring)\b/i.test(item.name ?? "");
}

function getContainerItems(actor) {
  return getInventoryItems(actor).filter(item => isContainerLike(item));
}

function getItemContainerId(item) {
  const candidates = [
    foundry.utils.getProperty(item, "system.container"),
    foundry.utils.getProperty(item, "system.container.id"),
    foundry.utils.getProperty(item, "system.container.uuid"),
    foundry.utils.getProperty(item, "system.container.value"),
    foundry.utils.getProperty(item, "system.containerIdentifier"),
    foundry.utils.getProperty(item, "system.equippedContainer"),
    foundry.utils.getProperty(item, "flags.dnd5e.container"),
    foundry.utils.getProperty(item, "flags.itemcollection.container")
  ].filter(v => v !== undefined && v !== null && v !== "");

  for (const value of candidates) {
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      if (value.id) return String(value.id);
      if (value._id) return String(value._id);
      if (value.uuid) return String(value.uuid);
      if (value.value) return String(value.value);
    }
  }
  return null;
}

function itemIsInContainer(item, container) {
  if (!container) return !getItemContainerId(item);
  const cid = getItemContainerId(item);
  if (!cid) return false;
  return cid === container.id || cid === container.uuid || cid.endsWith(`.${container.id}`) || cid.includes(container.id);
}

function getVisibleItems(actor, container) {
  const items = getInventoryItems(actor);

  // Actor overview: container-like items are shown as cards in the backpack strip,
  // not again as normal unsorted inventory rows.
  if (!container) return items.filter(item => !getItemContainerId(item) && !isContainerLike(item));

  // Container view: show the contents of the selected container. If a nested
  // container is inside this container, keep it visible here as a normal item.
  return items.filter(item => item.id !== container.id && itemIsInContainer(item, container));
}

function getContextKey(containerId) {
  return containerId ? `container:${containerId}` : "actor";
}

async function getCategories(actor, containerId = null) {
  const all = actor?.getFlag(MODULE_ID, "categoriesByContext") ?? {};
  const ctx = getContextKey(containerId);
  const stored = all[ctx];

  // Important: no auto-default categories. If the user deletes every category,
  // only "Unsortiert" remains and nothing gets recreated on reload.
  if (Array.isArray(stored)) return stored.map(c => String(c).trim()).filter(Boolean);
  return DEFAULT_CATEGORIES;
}

async function setCategories(actor, categories, containerId = null) {
  if (!actor) return;
  const all = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "categoriesByContext") ?? {});
  const ctx = getContextKey(containerId);
  all[ctx] = [...new Set(categories.map(c => String(c).trim()).filter(Boolean))];
  await actor.setFlag(MODULE_ID, "categoriesByContext", all);
}

async function getSubcategories(actor, parentCategory, containerId = null) {
  if (!actor || !parentCategory || parentCategory === "__unsorted") return [];
  const all = actor.getFlag(MODULE_ID, "subcategoriesByContext") ?? {};
  const ctx = getContextKey(containerId);
  const list = all?.[ctx]?.[parentCategory];
  return Array.isArray(list) ? list.map(c => sanitizePlainText(c, { max: 48 })).filter(Boolean) : [];
}

async function setSubcategories(actor, parentCategory, subcategories, containerId = null) {
  if (!actor || !parentCategory || parentCategory === "__unsorted") return;
  const all = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "subcategoriesByContext") ?? {});
  const ctx = getContextKey(containerId);
  all[ctx] ??= {};
  all[ctx][parentCategory] = [...new Set(subcategories.map(c => sanitizePlainText(c, { max: 48 })).filter(Boolean))];
  await actor.setFlag(MODULE_ID, "subcategoriesByContext", all);
}

function makeSubcategoryId(parent, sub) { return `${parent}::${sub}`; }
function parseCategoryId(id) {
  const value = String(id ?? "__unsorted");
  if (!value.includes("::")) return { parent: value, sub: null };
  const [parent, ...rest] = value.split("::");
  return { parent, sub: rest.join("::") || null };
}
function displayCategoryName(id) {
  if (id === "__unsorted") return "Unsortiert";
  const parsed = parseCategoryId(id);
  return parsed.sub ? parsed.sub : parsed.parent;
}

async function getCategoryOptions(actor, categories, containerId = null) {
  const options = ["__unsorted"];
  for (const category of categories) {
    options.push(category);
    const subs = await getSubcategories(actor, category, containerId);
    for (const sub of subs) options.push(makeSubcategoryId(category, sub));
  }
  return options;
}

function categoryOptionLabel(id) {
  if (id === "__unsorted") return "Unsortiert";
  const parsed = parseCategoryId(id);
  return parsed.sub ? `${parsed.parent} / ${parsed.sub}` : parsed.parent;
}

async function addSubcategory(actor, parentCategory, subName, containerId = null) {
  subName = sanitizePlainText(subName, { max: 48 });
  if (!subName || !actor || parentCategory === "__unsorted") return;
  const subs = await getSubcategories(actor, parentCategory, containerId);
  if (subs.includes(subName)) { ui.notifications.warn("Diese Unterkategorie gibt es schon."); return; }
  await setSubcategories(actor, parentCategory, [...subs, subName], containerId);
}

async function renameSubcategory(actor, parentCategory, oldSub, newSub, containerId = null) {
  newSub = sanitizePlainText(newSub, { max: 48 });
  if (!newSub || !actor || parentCategory === "__unsorted") return;
  const subs = await getSubcategories(actor, parentCategory, containerId);
  if (subs.includes(newSub) && newSub !== oldSub) { ui.notifications.warn("Diese Unterkategorie gibt es schon."); return; }
  await setSubcategories(actor, parentCategory, subs.map(s => s === oldSub ? newSub : s), containerId);
  const oldId = makeSubcategoryId(parentCategory, oldSub);
  const newId = makeSubcategoryId(parentCategory, newSub);
  for (const item of getInventoryItems(actor)) {
    if (itemCategory(item, containerId) === oldId) await setItemCategory(item, newId, containerId);
  }
}

async function deleteSubcategory(actor, parentCategory, subName, containerId = null) {
  if (!actor || parentCategory === "__unsorted") return;
  const confirmed = await Dialog.confirm({
    title: "Unterkategorie löschen",
    content: `<p>Unterkategorie <strong>${escapeHtml(subName)}</strong> löschen? Items darin werden nach <strong>${escapeHtml(parentCategory)}</strong> verschoben.</p>`
  });
  if (!confirmed) return;
  const subs = (await getSubcategories(actor, parentCategory, containerId)).filter(s => s !== subName);
  await setSubcategories(actor, parentCategory, subs, containerId);
  const oldId = makeSubcategoryId(parentCategory, subName);
  for (const item of getInventoryItems(actor)) {
    if (itemCategory(item, containerId) === oldId) await setItemCategory(item, parentCategory, containerId);
  }
}

async function getCategoryOrder(actor, containerId = null, categories = null) {
  const ctx = getContextKey(containerId);
  const all = actor?.getFlag(MODULE_ID, "categoryOrderByContext") ?? {};
  const existing = Array.isArray(all[ctx]) ? all[ctx] : [];
  const known = ["__unsorted", ...(categories ?? await getCategories(actor, containerId))];
  return [...existing.filter(id => known.includes(id)), ...known.filter(id => !existing.includes(id))];
}

async function setCategoryOrder(actor, order, containerId = null) {
  if (!actor) return;
  const categories = await getCategories(actor, containerId);
  const valid = ["__unsorted", ...categories];
  const clean = [...new Set(order.filter(id => valid.includes(id)))];
  const finalOrder = [...clean, ...valid.filter(id => !clean.includes(id))];
  const all = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "categoryOrderByContext") ?? {});
  all[getContextKey(containerId)] = finalOrder;
  await actor.setFlag(MODULE_ID, "categoryOrderByContext", all);
}

async function renameCategory(actor, oldName, newName, containerId = null) {
  if (!actor || oldName === "__unsorted") return;
  newName = sanitizePlainText(newName, { max: 48 });
  if (!newName) return;
  const categories = await getCategories(actor, containerId);
  if (categories.includes(newName) && newName !== oldName) { ui.notifications.warn("Diese Kategorie gibt es schon."); return; }
  const renamed = categories.map(c => c === oldName ? newName : c);
  await setCategories(actor, renamed, containerId);
  const order = await getCategoryOrder(actor, containerId, renamed);
  await setCategoryOrder(actor, order.map(id => id === oldName ? newName : id), containerId);

  const allSubs = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "subcategoriesByContext") ?? {});
  const ctx = getContextKey(containerId);
  const subs = allSubs?.[ctx]?.[oldName] ?? [];
  if (allSubs?.[ctx]) {
    delete allSubs[ctx][oldName];
    allSubs[ctx][newName] = subs;
    await actor.setFlag(MODULE_ID, "subcategoriesByContext", allSubs);
  }

  for (const item of getInventoryItems(actor)) {
    const cat = itemCategory(item, containerId);
    if (cat === oldName) await setItemCategory(item, newName, containerId);
    else if (cat.startsWith(`${oldName}::`)) await setItemCategory(item, `${newName}::${cat.slice(oldName.length + 2)}`, containerId);
  }
}

async function deleteCategory(actor, categoryName, containerId = null) {
  if (!actor || categoryName === "__unsorted") return;
  const confirmed = await Dialog.confirm({
    title: "Kategorie löschen",
    content: `<p>Kategorie <strong>${escapeHtml(categoryName)}</strong> löschen? Items darin werden nach <strong>Unsortiert</strong> verschoben.</p>`
  });
  if (!confirmed) return;
  const categories = (await getCategories(actor, containerId)).filter(c => c !== categoryName);
  await setCategories(actor, categories, containerId);
  await setCategoryOrder(actor, (await getCategoryOrder(actor, containerId, categories)).filter(id => id !== categoryName), containerId);

  const allSubs = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "subcategoriesByContext") ?? {});
  const ctx = getContextKey(containerId);
  if (allSubs?.[ctx]?.[categoryName]) {
    delete allSubs[ctx][categoryName];
    await actor.setFlag(MODULE_ID, "subcategoriesByContext", allSubs);
  }

  for (const item of getInventoryItems(actor)) {
    const cat = itemCategory(item, containerId);
    if (cat === categoryName || cat.startsWith(`${categoryName}::`)) await setItemCategory(item, "__unsorted", containerId);
  }
}

function itemCategory(item, containerId = null) {
  const all = item.getFlag(MODULE_ID, "categoryByContext") ?? {};
  return all[getContextKey(containerId)] || "__unsorted";
}

async function setItemCategory(item, category, containerId = null) {
  if (!item) return;
  const all = foundry.utils.deepClone(item.getFlag(MODULE_ID, "categoryByContext") ?? {});
  const ctx = getContextKey(containerId);
  if (!category || category === "__unsorted") delete all[ctx];
  else all[ctx] = category;
  await item.setFlag(MODULE_ID, "categoryByContext", all);
}

async function getItemOrder(actor, containerId = null) {
  const all = actor?.getFlag(MODULE_ID, "itemOrderByContext") ?? {};
  const ctx = getContextKey(containerId);
  return Array.isArray(all[ctx]) ? all[ctx] : [];
}

async function setItemOrder(actor, itemIds, containerId = null) {
  if (!actor) return;
  const all = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "itemOrderByContext") ?? {});
  all[getContextKey(containerId)] = [...new Set(itemIds.filter(Boolean))];
  await actor.setFlag(MODULE_ID, "itemOrderByContext", all);
}

async function getContainerOrder(actor) {
  const order = actor?.getFlag(MODULE_ID, "containerOrder") ?? [];
  return Array.isArray(order) ? order : [];
}

async function setContainerOrder(actor, containerIds) {
  if (!actor) return;
  await actor.setFlag(MODULE_ID, "containerOrder", [...new Set(containerIds.filter(Boolean))]);
}

async function getContainerLayerCount(actor) {
  const n = Number(actor?.getFlag(MODULE_ID, "containerLayerCount") ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(12, Math.max(1, Math.round(n))) : null;
}

async function setContainerLayerCount(actor, count) {
  if (!actor) return;
  const clean = Math.min(12, Math.max(1, Math.round(Number(count) || 1)));
  await actor.setFlag(MODULE_ID, "containerLayerCount", clean);
}

async function getContainerLayerMap(actor) {
  const map = actor?.getFlag(MODULE_ID, "containerLayerMap") ?? {};
  return map && typeof map === "object" && !Array.isArray(map) ? map : {};
}

async function setContainerLayerMap(actor, map) {
  if (!actor) return;
  const clean = {};
  for (const [id, row] of Object.entries(map ?? {})) {
    const n = Math.round(Number(row));
    if (id && Number.isFinite(n) && n >= 0) clean[id] = n;
  }
  await actor.setFlag(MODULE_ID, "containerLayerMap", clean);
}

function getRawContainerAlias(actor, container) {
  const aliases = actor?.getFlag(MODULE_ID, "containerAliases") ?? {};
  const keys = [container?.id, container?.uuid, container?.name].filter(Boolean);
  for (const key of keys) {
    const alias = sanitizePlainText(aliases?.[key], { max: 40 });
    if (alias) return alias;
  }

  // Fallback for older test versions: if the same container was saved under a
  // stale key, still find the alias by comparing item identifiers loosely.
  const entries = Object.entries(aliases);
  const itemIds = [container?.id, container?.uuid, container?.name].filter(Boolean).map(String);
  for (const [key, value] of entries) {
    if (itemIds.some(id => String(key).includes(id) || id.includes(String(key)))) {
      const alias = sanitizePlainText(value, { max: 40 });
      if (alias) return alias;
    }
  }
  return "";
}

function getContainerAlias(actor, container) {
  return getRawContainerAlias(actor, container) || container?.name || "Rucksack";
}

async function setContainerAlias(actor, container, alias) {
  if (!actor || !container) return;
  const aliases = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "containerAliases") ?? {});
  const keys = [container.id, container.uuid, container.name].filter(Boolean).map(String);
  const originalName = sanitizePlainText(container.name, { max: 40 });
  const currentAlias = getRawContainerAlias(actor, container);

  const clearAlias = () => {
    for (const key of keys) delete aliases[key];
    // Clean up aliases saved by older dev builds under odd/stale keys.
    for (const [key, value] of Object.entries({...aliases})) {
      const cleanValue = sanitizePlainText(value, { max: 40 });
      if (cleanValue === currentAlias || cleanValue === originalName) delete aliases[key];
      if (keys.some(id => String(key).includes(id) || id.includes(String(key)))) delete aliases[key];
    }
  };

  alias = sanitizePlainText(alias, { max: 40 });
  if (alias === "__betterinv_clear_alias__" || !alias || alias === originalName) {
    clearAlias();
  } else {
    clearAlias();
    aliases[container.id] = alias;
  }
  await actor.setFlag(MODULE_ID, "containerAliases", aliases);
}

async function sortContainersBySavedOrder(actor, containers) {
  const order = await getContainerOrder(actor);
  if (!order.length) return containers;
  const index = new Map(order.map((id, i) => [id, i]));
  return [...containers].sort((a, b) => {
    const ai = index.has(a.id) ? index.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = index.has(b.id) ? index.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

async function sortItemsBySavedOrder(actor, items, containerId = null) {
  const order = await getItemOrder(actor, containerId);
  if (!order.length) return items;
  const index = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = index.has(a.id) ? index.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = index.has(b.id) ? index.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.sort - b.sort || a.name.localeCompare(b.name);
  });
}

function toggleBetterInvWindow() {
  const existing = document.getElementById("betterinv-window");
  if (existing) { closeBetterInvItemActionMenu(); existing.remove(); return; }
  betterInvState.containerId = null;
  renderBetterInvWindow();
}

async function renderBetterInvWindow({ preserveScroll = true } = {}) {
  closeBetterInvItemActionMenu();
  const actor = getCurrentActor();
  let windowEl = document.getElementById("betterinv-window");
  const previousBody = windowEl?.querySelector?.(".betterinv-body");
  const previousScrollTop = preserveScroll ? (previousBody?.scrollTop ?? 0) : 0;
  const activeEl = document.activeElement;
  const restoreSearchFocus = Boolean(activeEl?.closest?.("#betterinv-window") && activeEl.classList?.contains("betterinv-search"));
  const restoreSearchStart = restoreSearchFocus ? (activeEl.selectionStart ?? String(activeEl.value ?? "").length) : null;
  const restoreSearchEnd = restoreSearchFocus ? (activeEl.selectionEnd ?? restoreSearchStart) : null;
  if (!windowEl) {
    windowEl = document.createElement("section");
    windowEl.id = "betterinv-window";
    windowEl.className = "betterinv-window";
    windowEl.style.left = "120px";
    windowEl.style.top = "110px";
    document.body.appendChild(windowEl);
  }
  windowEl.style.setProperty("--bi-content-scale", String(betterInvState.scale || 1));

  if (!actor && game.user.isGM) {
    const actors = getSelectablePlayerActors();
    windowEl.innerHTML = baseShellHtml(actorChooserHtml(actors));
    activateWindowListeners(windowEl, null, null);
    windowEl.querySelectorAll(".betterinv-gm-actor").forEach(btn => {
      btn.addEventListener("click", () => {
        betterInvState.actorId = btn.dataset.actorId;
        betterInvState.containerId = null;
        betterInvState.search = "";
        renderBetterInvWindow({ preserveScroll: false });
      });
    });
    return;
  }

  if (!actor) {
    windowEl.innerHTML = baseShellHtml(`
      <p>Kein Token ausgewählt und kein Charakter deinem User zugeordnet.</p>
      <p class="betterinv-hint">Wähle einen Token auf der Map aus oder ordne deinem User einen Charakter zu.</p>
    `);
    activateWindowListeners(windowEl, actor, null);
    return;
  }

  const currentContainer = betterInvState.containerId ? actor.items.get(betterInvState.containerId) : null;
  if (betterInvState.containerId && !currentContainer) betterInvState.containerId = null;
  const activeContainer = betterInvState.containerId ? currentContainer : null;
  const query = String(betterInvState.search ?? "").trim().toLowerCase();
  const allVisibleItems = await sortItemsBySavedOrder(actor, getVisibleItems(actor, activeContainer), activeContainer?.id ?? null);
  const visibleItems = query ? allVisibleItems.filter(item => itemMatchesSearch(item, query)) : allVisibleItems;
  const containers = await sortContainersBySavedOrder(actor, getContainerItems(actor));
  const categories = await getCategories(actor, activeContainer?.id ?? null);
  const categoryOptions = await getCategoryOptions(actor, categories, activeContainer?.id ?? null);

  const topContainerHtml = !activeContainer ? await renderContainerCards(actor, containers) : renderContainerBreadcrumb(actor, activeContainer);
  const searchContainersHtml = (!activeContainer && query) ? renderSearchContainerHits(actor, containers, query) : "";
  const order = await getCategoryOrder(actor, activeContainer?.id ?? null, categories);
  const sectionNames = new Map([["__unsorted", "Unsortiert"], ...categories.map(c => [c, c])]);
  const sections = order.map(id => ({ id, name: sectionNames.get(id) })).filter(s => s.name);

  const sectionHtmlParts = [];
  for (const section of sections) {
    const directItems = visibleItems.filter(item => itemCategory(item, activeContainer?.id ?? null) === section.id);
    const rows = directItems.length
      ? directItems.map(item => itemRowHtml(item, categoryOptions, activeContainer?.id ?? null, section.id)).join("")
      : `<p class="betterinv-empty">Leer</p>`;

    let subcategoryHtml = "";
    if (section.id !== "__unsorted") {
      const subs = await getSubcategories(actor, section.id, activeContainer?.id ?? null);
      subcategoryHtml = subs.map(sub => {
        const subId = makeSubcategoryId(section.id, sub);
        const subItems = visibleItems.filter(item => itemCategory(item, activeContainer?.id ?? null) === subId);
        const subRows = subItems.length
          ? subItems.map(item => itemRowHtml(item, categoryOptions, activeContainer?.id ?? null, subId)).join("")
          : `<p class="betterinv-empty">Leer</p>`;
        return `
          <details class="betterinv-subcategory" open draggable="true" data-parent-category="${escapeAttr(section.id)}" data-category="${escapeAttr(subId)}" data-subcategory="${escapeAttr(sub)}">
            <summary>
              <span class="betterinv-sub-grip" title="Unterkategorie verschieben">☰</span>
              <span class="betterinv-sub-indent">↳</span>
              <span class="betterinv-category-name">${escapeHtml(sub)}</span>
              <span class="betterinv-category-count">${subItems.length}</span>
              <span class="betterinv-subcategory-settings" title="Unterkategorie bearbeiten">⚙</span>
            </summary>
            <div class="betterinv-items betterinv-subitems">${subRows}</div>
          </details>`;
      }).join("");
    }

    sectionHtmlParts.push(`
      <details class="betterinv-category" open draggable="true" data-category="${escapeAttr(section.id)}">
        <summary>
          <span class="betterinv-drag-grip" title="Gedrückt halten und Kategorie verschieben">☰</span>
          <span class="betterinv-category-name">${escapeHtml(section.name)}</span>
          <span class="betterinv-category-count">${directItems.length}</span>
          ${section.id !== "__unsorted" ? `<span class="betterinv-add-subcategory" title="Unterkategorie erstellen">+</span>` : ""}
          <span class="betterinv-category-settings" title="Kategorie bearbeiten">⚙</span>
        </summary>
        <div class="betterinv-items">${rows}</div>
        ${subcategoryHtml}
      </details>`);
  }
  const sectionHtml = sectionHtmlParts.join("");

  windowEl.innerHTML = baseShellHtml(`
    <div class="betterinv-content" style="zoom: ${escapeAttr(String(betterInvState.scale || 1))}">
      <div class="betterinv-actor">
        <strong>${activeContainer ? escapeHtml(getContainerAlias(actor, activeContainer)) : "Rucksäcke"}</strong>
        <span>
          ${activeContainer ? "Inhalt" : "Körper / Rucksäcke"} · ${visibleItems.length} Items
          ${game.user.isGM ? `<button type="button" class="betterinv-change-actor" title="Anderen Spielercharakter öffnen">Spieler wechseln</button>` : ""}
          ${activeContainer ? `<button type="button" class="betterinv-active-container-rename" data-container-id="${activeContainer.id}" title="Rucksack-UI-Name ändern">✎</button>` : ""}
        </span>
      </div>
      ${topContainerHtml}
      <div class="betterinv-toolbar">
        <input type="search" class="betterinv-search" value="${escapeAttr(betterInvState.search ?? "")}" placeholder="Suchen: Item, Pergament, Arrow, Bagpipes …">
        <button type="button" class="betterinv-add-item" title="Neues Item für diesen Charakter erstellen"><i class="fas fa-plus" aria-hidden="true"></i><span>Item</span></button>
        <button type="button" class="betterinv-add-category">+ Kategorie</button>
      </div>
      ${searchContainersHtml}
      ${sectionHtml}
    </div>
  `);

  activateWindowListeners(windowEl, actor, activeContainer);
  const newBody = windowEl.querySelector(".betterinv-body");
  if (newBody) newBody.scrollTop = previousScrollTop;
  if (restoreSearchFocus) {
    const input = windowEl.querySelector(".betterinv-search");
    if (input) {
      requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
        const len = String(input.value ?? "").length;
        const start = Math.min(restoreSearchStart ?? len, len);
        const end = Math.min(restoreSearchEnd ?? start, len);
        try { input.setSelectionRange(start, end); } catch (_) {}
      });
    }
  }
}

function baseShellHtml(bodyHtml) {
  return `
    <header class="betterinv-header">
      <h2>Better Inventory<small>by <a class="betterinv-author-link" href="https://discord.com/users/622739422332321792" target="_blank" rel="noopener noreferrer" title="Axon auf Discord öffnen">Axon</a></small></h2>
      <div class="betterinv-header-actions">
        <button type="button" class="betterinv-scale-down" title="UI kleiner">−</button>
        <button type="button" class="betterinv-scale-up" title="UI größer">+</button>
        <button type="button" class="betterinv-popout" title="Als Browser-Popup öffnen">⧉</button>
        <button type="button" class="betterinv-close" title="Schließen">×</button>
      </div>
    </header>
    <div class="betterinv-body">${bodyHtml}</div>
    <div class="betterinv-resize-hint">↘</div>`;
}

function itemMatchesSearch(item, query) {
  if (!query) return true;
  const haystack = [item.name, item.type, foundry.utils.getProperty(item, "system.type.value"), foundry.utils.getProperty(item, "system.identifier")]
    .map(v => String(v ?? "").toLowerCase()).join(" ");
  return haystack.includes(query);
}

function renderSearchContainerHits(actor, containers, query) {
  const hits = containers.filter(container => {
    if (String(container.name ?? "").toLowerCase().includes(query)) return true;
    if (String(getContainerAlias(actor, container) ?? "").toLowerCase().includes(query)) return true;
    return getVisibleItems(actor, container).some(item => itemMatchesSearch(item, query));
  });
  if (!hits.length) return "";
  return `
    <section class="betterinv-search-hits">
      <h3>Rucksäcke mit Treffern</h3>
      <div class="betterinv-containers betterinv-containers-search">
        ${hits.map(container => `
          <div class="betterinv-container-card" role="button" tabindex="0" draggable="true" data-container-id="${container.id}" title="${escapeAttr(getContainerAlias(actor, container))} öffnen">
            <img src="${escapeAttr(container.img || "icons/svg/item-bag.svg")}" alt="">
            <span>${escapeHtml(getContainerAlias(actor, container))}</span>
          </div>
        `).join("")}
      </div>
    </section>`;
}

function sanitizePlainText(value, { max = 60 } = {}) {
  return String(value ?? "")
    .replace(/[<>`{}\[\]\\]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function promptContainerAlias(actor, container) {
  return await new Promise(resolve => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value); } };
    const dialog = new Dialog({
      title: "Rucksack umbenennen",
      content: `<form><div class="form-group"><label>Rucksackname</label><input name="alias" type="text" value="${escapeAttr(getRawContainerAlias(actor, container))}" placeholder="${escapeAttr(container?.name ?? "Rucksack")}" autofocus><p class="notes">${escapeHtml(container?.name ?? "Originalname")}</p></div></form>`,
      buttons: {
        save: { label: "Speichern", callback: html => {
          const value = sanitizePlainText(html.find('[name="alias"]').val(), { max: 40 });
          done(value || "__betterinv_clear_alias__");
        } },
        cancel: { label: "Abbrechen", callback: () => done(null) }
      },
      default: "save",
      close: () => done(null)
    });
    dialog.render(true);
    setTimeout(() => {
      bringFoundryDialogsToFront({ avoidOverlap: false });
      const el = dialog.element?.[0] ?? dialog.element ?? document.querySelector('.dialog.app.window-app');
      const input = el?.querySelector?.('input[name="alias"]');
      if (input) {
        ["keydown", "keyup", "keypress", "beforeinput", "input", "paste"].forEach(type => {
          input.addEventListener(type, event => event.stopPropagation(), { capture: true });
        });
        input.focus();
        input.select();
      }
    }, 50);
  });
}

async function promptCategoryName() {
  return await new Promise(resolve => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value); } };
    const dialog = new Dialog({
      title: "Neue Kategorie",
      content: `<form><div class="form-group"><label>Name</label><input name="name" type="text" placeholder="z.B. Schriftrollen" autofocus></div></form>`,
      buttons: {
        create: { label: "Erstellen", callback: html => done(sanitizePlainText(html.find('[name="name"]').val(), { max: 48 })) },
        cancel: { label: "Abbrechen", callback: () => done(null) }
      },
      default: "create",
      close: () => done(null)
    });
    dialog.render(true);
    setTimeout(() => {
      const el = dialog.element?.[0] ?? dialog.element ?? document.querySelector('.dialog.app.window-app');
      if (el) {
        el.style.zIndex = "20000";
        el.classList.add("betterinv-dialog-top");
        const input = el.querySelector('input[name="name"]');
        if (input) {
          ["keydown", "keyup", "keypress", "beforeinput", "input", "paste"].forEach(type => {
            input.addEventListener(type, event => event.stopPropagation(), { capture: true });
          });
          input.focus();
          input.select();
        }
      }
    }, 50);
  });
}

async function renderContainerCards(actor, containers) {
  if (!containers.length) return `<p class="betterinv-hint">Keine Rucksäcke/Container gefunden. Top-Level-Items werden unten angezeigt.</p>`;
  const savedLayerCount = await getContainerLayerCount(actor);
  const layerCount = savedLayerCount ?? Math.max(1, Math.ceil(containers.length / 4));
  const rows = Array.from({ length: layerCount }, () => []);
  const layerMap = await getContainerLayerMap(actor);
  const hasSavedLayerMap = Object.keys(layerMap).length > 0;

  if (hasSavedLayerMap) {
    const noRow = [];
    containers.forEach(container => {
      const raw = layerMap?.[container.id];
      const rowIndex = Math.round(Number(raw));
      if (Number.isFinite(rowIndex) && rowIndex >= 0 && rowIndex < layerCount) rows[rowIndex].push(container);
      else noRow.push(container);
    });
    // New containers that never had a layer assignment go into the last layer,
    // so existing custom layer layouts do not collapse or rebalance.
    rows[Math.max(0, layerCount - 1)].push(...noRow);
  } else {
    const perLayer = Math.max(1, Math.ceil(containers.length / layerCount));
    containers.forEach((container, i) => rows[Math.min(layerCount - 1, Math.floor(i / perLayer))].push(container));
  }

  return `
    <div class="betterinv-container-tools">
      <span>Rucksack-Layer</span>
      <button type="button" class="betterinv-layer-minus" title="Layer entfernen">−</button>
      <button type="button" class="betterinv-layer-plus" title="Layer hinzufügen">+</button>
    </div>
    <div class="betterinv-containers" data-layer-count="${layerCount}">
      ${rows.map((row, rowIndex) => `
        <div class="betterinv-container-row ${row.length ? "" : "betterinv-container-row-empty"}" data-row-index="${rowIndex}">
          ${row.map(container => `
            <div class="betterinv-container-card" role="button" tabindex="0" draggable="true" data-container-id="${container.id}" title="${escapeAttr(getContainerAlias(actor, container))} öffnen">
              <button type="button" class="betterinv-container-rename" data-container-id="${container.id}" title="UI-Name ändern">✎</button>
              <img src="${escapeAttr(container.img || "icons/svg/item-bag.svg")}" alt="">
              <span>${escapeHtml(getContainerAlias(actor, container))}</span>
              ${getContainerAlias(actor, container) !== container.name ? `<small>${escapeHtml(container.name)}</small>` : ""}
            </div>
          `).join("")}
        </div>
      `).join("")}
    </div>`;
}

function renderContainerBreadcrumb(actor, container) {
  const count = getVisibleItems(actor, container).length;
  return `
    <div class="betterinv-container-view">
      <button type="button" class="betterinv-back">← Alle Rucksäcke</button>
      <div class="betterinv-container-title">
        <img src="${escapeAttr(container.img || "icons/svg/item-bag.svg")}" alt="">
        <div><strong>${escapeHtml(getContainerAlias(actor, container))}</strong><small>${count} Inhalt(e)</small></div>
      </div>
      <div class="betterinv-remove-from-container" title="Item hier ablegen, um es zurück ins Hauptinventar zu legen">↥ Aus Rucksack nehmen</div>
    </div>`;
}

function getItemQuantityData(item) {
  const raw = foundry.utils.getProperty(item, "system.quantity");
  const nested = foundry.utils.getProperty(item, "system.quantity.value");
  const value = Number(typeof raw === "object" && raw !== null ? nested : raw);
  return {
    value: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 1,
    updatePath: typeof raw === "object" && raw !== null ? "system.quantity.value" : "system.quantity"
  };
}

async function setItemQuantity(item, value) {
  if (!item) return;
  const quantity = getItemQuantityData(item);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  const next = Math.max(0, Math.floor(parsed));
  if (next === quantity.value) return;
  await item.update({ [quantity.updatePath]: next });
}

async function changeItemQuantity(item, delta) {
  if (!item || !Number.isFinite(delta)) return;
  const quantity = getItemQuantityData(item);
  await setItemQuantity(item, quantity.value + Math.trunc(delta));
}

function getItemEquippedData(item) {
  if (!item) return { supported: false, value: false, updatePath: null };

  const direct = foundry.utils.getProperty(item, "system.equipped");
  if (typeof direct === "boolean") {
    return { supported: true, value: direct, updatePath: "system.equipped" };
  }

  if (direct && typeof direct === "object") {
    for (const key of ["value", "equipped"]) {
      if (typeof direct[key] === "boolean") {
        return { supported: true, value: direct[key], updatePath: `system.equipped.${key}` };
      }
    }
  }

  return { supported: false, value: false, updatePath: null };
}

async function toggleBetterInvItemEquipped(item) {
  const equipped = getItemEquippedData(item);
  if (!equipped.supported || !equipped.updatePath) {
    ui.notifications.warn("Dieses Item unterstützt keinen Ausrüstungsstatus.");
    return;
  }
  await item.update({ [equipped.updatePath]: !equipped.value });
  ui.notifications.info(`${item.name} wurde ${equipped.value ? "abgelegt" : "ausgerüstet"}.`);
}

function closeBetterInvItemActionMenu() {
  if (typeof betterInvActionMenuCleanup === "function") {
    betterInvActionMenuCleanup();
    return;
  }
  document.getElementById("betterinv-item-action-menu")?.remove();
}

async function duplicateBetterInvItem(actor, item) {
  if (!actor || !item) return;
  const data = item.toObject();
  delete data._id;
  data.name = `${item.name} (Kopie)`;
  await actor.createEmbeddedDocuments("Item", [data]);
  ui.notifications.info(`${item.name} wurde dupliziert.`);
}

async function deleteBetterInvItem(item) {
  if (!item) return;
  const confirmed = await Dialog.confirm({
    title: "Item löschen",
    content: `<p><strong>${escapeHtml(item.name)}</strong> wirklich dauerhaft löschen?</p>`
  });
  if (!confirmed) return;
  await item.delete();
  ui.notifications.info(`${item.name} wurde gelöscht.`);
}

function getBetterInvCreatableItemTypes() {
  const preferred = ["loot", "weapon", "equipment", "consumable", "tool", "container", "backpack"];
  const configured = new Set([
    ...(Array.isArray(game.system?.documentTypes?.Item) ? game.system.documentTypes.Item : []),
    ...Object.keys(CONFIG.Item?.dataModels ?? {}),
    ...Object.keys(CONFIG.Item?.typeLabels ?? {})
  ]);
  const supported = preferred.filter(type => configured.has(type));
  return supported.length ? supported : preferred;
}

function getBetterInvItemTypeLabel(type) {
  const key = CONFIG.Item?.typeLabels?.[type] ?? `TYPES.Item.${type}`;
  const localized = game.i18n?.localize?.(key);
  if (localized && localized !== key) return localized;
  return String(type ?? "Item").replace(/(^|[-_\s])([a-z])/g, (_match, space, letter) => `${space ? " " : ""}${letter.toUpperCase()}`);
}

async function promptNewBetterInvItem() {
  const types = getBetterInvCreatableItemTypes();
  const defaultType = types.includes("loot") ? "loot" : types[0];
  const options = types.map(type => `<option value="${escapeAttr(type)}" ${type === defaultType ? "selected" : ""}>${escapeHtml(getBetterInvItemTypeLabel(type))}</option>`).join("");

  return await new Promise(resolve => {
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const dialog = new Dialog({
      title: "Neues Item erstellen",
      content: `
        <form class="betterinv-new-item-form">
          <div class="form-group">
            <label>Itemname</label>
            <input name="name" type="text" value="Neues Item" maxlength="120" autofocus>
          </div>
          <div class="form-group">
            <label>Itemtyp</label>
            <select name="type">${options}</select>
          </div>
          <p class="notes">Das normale Foundry-Itemfenster öffnet sich direkt nach dem Erstellen.</p>
        </form>`,
      buttons: {
        create: {
          label: "Erstellen",
          callback: html => {
            const name = sanitizePlainText(html.find('[name="name"]').val(), { max: 120 }) || "Neues Item";
            const type = String(html.find('[name="type"]').val() ?? defaultType);
            done({ name, type: types.includes(type) ? type : defaultType });
          }
        },
        cancel: { label: "Abbrechen", callback: () => done(null) }
      },
      default: "create",
      close: () => done(null)
    });
    dialog.render(true);
    setTimeout(() => {
      bringFoundryDialogsToFront({ avoidOverlap: false });
      const el = dialog.element?.[0] ?? dialog.element ?? document.querySelector('.dialog.app.window-app');
      const input = el?.querySelector?.('input[name="name"]');
      if (input) {
        ["keydown", "keyup", "keypress", "beforeinput", "input", "paste"].forEach(type => {
          input.addEventListener(type, event => event.stopPropagation(), { capture: true });
        });
        input.focus();
        input.select();
      }
    }, 50);
  });
}

async function createBetterInvItem(actor, activeContainer = null) {
  if (!actor) return null;
  const input = await promptNewBetterInvItem();
  if (!input) return null;

  const created = await actor.createEmbeddedDocuments("Item", [{
    name: input.name,
    type: input.type
  }]);
  const item = created?.[0] ?? null;
  if (!item) throw new Error("Foundry returned no created item document.");

  if (activeContainer) await moveItemToContainer(item, activeContainer);
  await setItemCategory(item, "__unsorted", activeContainer?.id ?? null);
  ui.notifications.info(`${item.name} wurde erstellt.`);
  openItemSheet(item);
  return item;
}

function openBetterInvItemActionMenu(button, actor, item) {
  closeBetterInvItemActionMenu();
  if (!button || !actor || !item) return;

  const menu = document.createElement("div");
  menu.id = "betterinv-item-action-menu";
  menu.className = "betterinv-item-actions-menu";
  menu.setAttribute("role", "menu");
  const equipped = getItemEquippedData(item);
  menu.innerHTML = `
    ${equipped.supported ? `<button type="button" class="betterinv-item-action-equipped" role="menuitem"><i class="fas ${equipped.value ? "fa-box-open" : "fa-shield-alt"}"></i><span>${equipped.value ? "Ablegen" : "Ausrüsten"}</span></button>` : ""}
    <button type="button" class="betterinv-item-action-duplicate" role="menuitem"><i class="fas fa-copy"></i><span>Duplizieren</span></button>
    <button type="button" class="betterinv-item-action-delete" role="menuitem"><i class="fas fa-trash"></i><span>Löschen</span></button>
  `;
  document.body.appendChild(menu);

  const rect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const gap = 5;
  let left = rect.right - menuRect.width;
  let top = rect.bottom + gap;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
  if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - gap;
  top = Math.max(8, top);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    menu.remove();
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    window.removeEventListener("resize", close);
    window.removeEventListener("scroll", close, true);
    if (betterInvActionMenuCleanup === close) betterInvActionMenuCleanup = null;
  };
  const onOutsidePointerDown = event => {
    if (menu.contains(event.target) || button.contains(event.target)) return;
    close();
  };
  betterInvActionMenuCleanup = close;

  menu.querySelector(".betterinv-item-action-equipped")?.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    close();
    try {
      await toggleBetterInvItemEquipped(item);
    } catch (error) {
      console.error("Better Inventory | Ausrüstungsstatus konnte nicht geändert werden", error);
      ui.notifications.error("Der Ausrüstungsstatus konnte nicht geändert werden.");
    }
  });

  menu.querySelector(".betterinv-item-action-duplicate")?.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    close();
    try {
      await duplicateBetterInvItem(actor, item);
    } catch (error) {
      console.error("Better Inventory | Item konnte nicht dupliziert werden", error);
      ui.notifications.error("Das Item konnte nicht dupliziert werden.");
    }
  });

  menu.querySelector(".betterinv-item-action-delete")?.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    close();
    try {
      await deleteBetterInvItem(item);
    } catch (error) {
      console.error("Better Inventory | Item konnte nicht gelöscht werden", error);
      ui.notifications.error("Das Item konnte nicht gelöscht werden.");
    }
  });

  setTimeout(() => document.addEventListener("pointerdown", onOutsidePointerDown, true), 0);
  window.addEventListener("resize", close, { once: true });
  window.addEventListener("scroll", close, { once: true, capture: true });
}

function itemRowHtml(item, categoryOptions, containerId) {
  const img = item.img || "icons/svg/item-bag.svg";
  const qty = getItemQuantityData(item).value;
  const equipped = getItemEquippedData(item);
  const weightRaw = foundry.utils.getProperty(item, "system.weight") ?? foundry.utils.getProperty(item, "system.weight.value") ?? "–";
  const weight = typeof weightRaw === "object" ? (weightRaw.value ?? weightRaw.total ?? "–") : weightRaw;
  const current = itemCategory(item, containerId);
  const options = (categoryOptions ?? ["__unsorted"]).map(cat =>
    `<option value="${escapeAttr(cat)}" ${current === cat ? "selected" : ""}>${escapeHtml(categoryOptionLabel(cat))}</option>`
  ).join("");

  return `
    <article class="betterinv-item ${equipped.supported && equipped.value ? "betterinv-item-equipped" : ""}" data-item-id="${item.id}" data-category="${escapeAttr(current)}" draggable="true">
      <span class="betterinv-item-grip" title="Gedrückt halten und Item verschieben">☰</span>
      <img src="${escapeAttr(img)}" alt="">
      <div class="betterinv-item-main">
        <button type="button" class="betterinv-open-item" title="Item öffnen">${escapeHtml(item.name)}</button>
        <small>${escapeHtml(item.type)} · Gewicht: ${escapeHtml(String(weight))}${equipped.supported && equipped.value ? ` · <span class="betterinv-equipped-label">Ausgerüstet</span>` : ""}</small>
      </div>
      <div class="betterinv-quantity-controls" aria-label="Anzahl ändern">
        <button type="button" class="betterinv-quantity-minus" title="Anzahl um 1 verringern" aria-label="Anzahl verringern">−</button>
        <input type="number" class="betterinv-quantity-value" min="0" step="1" inputmode="numeric" value="${escapeAttr(String(qty))}" data-original-value="${escapeAttr(String(qty))}" title="Anklicken und Anzahl direkt eingeben" aria-label="Aktuelle Anzahl direkt ändern">
        <button type="button" class="betterinv-quantity-plus" title="Anzahl um 1 erhöhen" aria-label="Anzahl erhöhen">+</button>
      </div>
      <button type="button" class="betterinv-edit-item" title="Item bearbeiten" aria-label="Item bearbeiten"><i class="fas fa-pen"></i></button>
      <span class="betterinv-category-picker" title="Kategorie ändern">
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
        <select class="betterinv-category-select" aria-label="Kategorie wählen">${options}</select>
      </span>
      <button type="button" class="betterinv-item-actions-button" title="Weitere Item-Aktionen" aria-label="Weitere Item-Aktionen"><i class="fas fa-ellipsis-v"></i></button>
    </article>`;
}

function activateWindowListeners(windowEl, actor, activeContainer) {
  windowEl.querySelector(".betterinv-close")?.addEventListener("click", () => { closeBetterInvItemActionMenu(); windowEl.remove(); });
  windowEl.querySelector(".betterinv-popout")?.addEventListener("pointerdown", event => { event.preventDefault(); openBetterInvPopup(windowEl); });
  windowEl.querySelector(".betterinv-scale-down")?.addEventListener("click", () => { betterInvState.scale = Math.max(0.65, Math.round(((betterInvState.scale || 1) - 0.1) * 10) / 10); renderBetterInvWindow(); });
  windowEl.querySelector(".betterinv-scale-up")?.addEventListener("click", () => { betterInvState.scale = Math.min(1.35, Math.round(((betterInvState.scale || 1) + 0.1) * 10) / 10); renderBetterInvWindow(); });
  makeBetterInvDraggable(windowEl);

  windowEl.querySelector(".betterinv-layer-plus")?.addEventListener("click", async () => {
    const current = await getContainerLayerCount(actor) ?? Math.max(1, Math.ceil(getContainerItems(actor).length / 4));
    await setContainerLayerCount(actor, current + 1);
    // Keep all existing backpack layer assignments exactly where they are.
    renderBetterInvWindow();
  });
  windowEl.querySelector(".betterinv-layer-minus")?.addEventListener("click", async () => {
    const current = await getContainerLayerCount(actor) ?? Math.max(1, Math.ceil(getContainerItems(actor).length / 4));
    const next = Math.max(1, current - 1);
    const containers = await sortContainersBySavedOrder(actor, getContainerItems(actor));
    const map = await getContainerLayerMap(actor);
    const nextMap = {};
    containers.forEach((container, index) => {
      const fallback = Math.min(current - 1, Math.floor(index / Math.max(1, Math.ceil(containers.length / current))));
      const row = Math.round(Number(map?.[container.id] ?? fallback));
      nextMap[container.id] = Math.min(next - 1, Math.max(0, Number.isFinite(row) ? row : 0));
    });
    await setContainerLayerMap(actor, nextMap);
    await setContainerLayerCount(actor, next);
    renderBetterInvWindow();
  });
  windowEl.querySelector(".betterinv-change-actor")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    betterInvState.actorId = null;
    betterInvState.containerId = null;
    betterInvState.search = "";
    renderBetterInvWindow({ preserveScroll: false });
  });

  windowEl.querySelector(".betterinv-active-container-rename")?.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const container = actor?.items?.get(event.currentTarget.dataset.containerId);
    if (!container) return;
    const alias = await promptContainerAlias(actor, container);
    if (alias === null) return;
    await setContainerAlias(actor, container, alias);
    renderBetterInvWindow();
  });

  windowEl.querySelectorAll(".betterinv-container-rename").forEach(btn => {
    btn.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const container = actor?.items?.get(btn.dataset.containerId);
      if (!container) return;
      const alias = await promptContainerAlias(actor, container);
      if (alias === null) return;
      await setContainerAlias(actor, container, alias);
      renderBetterInvWindow();
    });
  });
  windowEl.querySelectorAll(".betterinv-container-card").forEach(btn => {
    const open = event => {
      if (event.target.closest(".betterinv-container-rename")) return;
      betterInvState.containerId = btn.dataset.containerId;
      renderBetterInvWindow();
    };
    btn.addEventListener("click", open);
    btn.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(event); }
    });
  });

  windowEl.querySelector(".betterinv-back")?.addEventListener("click", () => {
    betterInvState.containerId = null;
    renderBetterInvWindow();
  });

  enableContainerDragSorting(windowEl, actor, activeContainer);
  enableItemToContainerDrop(windowEl, actor, activeContainer);

  const searchInput = windowEl.querySelector(".betterinv-search");
  if (searchInput) {
    // Foundry uses many single-key hotkeys. While typing in our search field,
    // those hotkeys must not fire, but the actual input event must still update
    // the search filter.
    ["keydown", "keyup", "keypress"].forEach(type => {
      searchInput.addEventListener(type, event => event.stopImmediatePropagation(), { capture: true });
    });
    ["beforeinput", "paste"].forEach(type => {
      searchInput.addEventListener(type, event => event.stopImmediatePropagation(), { capture: true });
    });
    searchInput.addEventListener("input", event => {
      event.stopPropagation();
      betterInvState.search = event.currentTarget.value ?? "";
      clearTimeout(windowEl._betterInvSearchTimer);
      windowEl._betterInvSearchTimer = setTimeout(() => renderBetterInvWindow(), 120);
    });
  }

  windowEl.querySelector(".betterinv-add-item")?.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    if (!actor || button.disabled) return;
    button.disabled = true;
    try {
      await createBetterInvItem(actor, activeContainer);
    } catch (error) {
      console.error("Better Inventory | Item konnte nicht erstellt werden", error);
      ui.notifications.error("Das Item konnte nicht erstellt werden.");
    } finally {
      button.disabled = false;
    }
  });

  windowEl.querySelector(".betterinv-add-category")?.addEventListener("click", async () => {
    const name = await promptCategoryName();
    if (!name) return;
    const categories = await getCategories(actor, activeContainer?.id ?? null);
    if (categories.includes(name)) { ui.notifications.warn("Diese Kategorie gibt es schon."); return; }
    const containerId = activeContainer?.id ?? null;
    await setCategories(actor, [...categories, name], containerId);
    const order = await getCategoryOrder(actor, containerId, [...categories, name]);
    await setCategoryOrder(actor, [...order, name], containerId);
    renderBetterInvWindow();
  });


  windowEl.querySelectorAll(".betterinv-add-subcategory").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const section = event.currentTarget.closest(".betterinv-category");
      const parentCategory = section?.dataset?.category;
      if (!parentCategory || parentCategory === "__unsorted") return;
      const name = await new Promise(resolve => {
        new Dialog({
          title: "Unterkategorie erstellen",
          content: `<form><div class="form-group"><label>Name</label><input name="name" type="text" placeholder="z.B. Vortex Warp" autofocus></div></form>`,
          buttons: {
            create: { label: "Erstellen", callback: html => resolve(sanitizePlainText(html.find('[name="name"]').val(), { max: 48 })) },
            cancel: { label: "Abbrechen", callback: () => resolve(null) }
          },
          default: "create",
          close: () => resolve(null)
        }).render(true);
        setTimeout(() => bringFoundryDialogsToFront({ avoidOverlap: false }), 50);
      });
      if (!name) return;
      await addSubcategory(actor, parentCategory, name, activeContainer?.id ?? null);
      renderBetterInvWindow();
    });
  });

  windowEl.querySelectorAll(".betterinv-subcategory-settings").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const section = event.currentTarget.closest(".betterinv-subcategory");
      const parentCategory = section?.dataset?.parentCategory;
      const currentName = section?.dataset?.subcategory;
      if (!parentCategory || !currentName) return;
      const choice = await new Promise(resolve => {
        new Dialog({
          title: "Unterkategorie bearbeiten",
          content: `<form><div class="form-group"><label>Name</label><input name="name" type="text" value="${escapeAttr(currentName)}" autofocus></div></form>`,
          buttons: {
            rename: { label: "Umbenennen", callback: html => resolve({ action: "rename", name: sanitizePlainText(html.find('[name="name"]').val(), { max: 48 }) }) },
            delete: { label: "Löschen", callback: () => resolve({ action: "delete" }) },
            cancel: { label: "Abbrechen", callback: () => resolve(null) }
          },
          default: "rename",
          close: () => resolve(null)
        }).render(true);
        setTimeout(() => bringFoundryDialogsToFront({ avoidOverlap: false }), 50);
      });
      if (!choice) return;
      const containerId = activeContainer?.id ?? null;
      if (choice.action === "rename") await renameSubcategory(actor, parentCategory, currentName, choice.name, containerId);
      if (choice.action === "delete") await deleteSubcategory(actor, parentCategory, currentName, containerId);
      renderBetterInvWindow();
    });
  });

  windowEl.querySelectorAll(".betterinv-category-settings").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const section = event.currentTarget.closest(".betterinv-category");
      const category = section?.dataset?.category;
      if (!category) return;
      if (category === "__unsorted") { ui.notifications.info("Unsortiert kann nicht gelöscht werden. Du kannst es aber verschieben."); return; }
      const currentName = category;
      const choice = await new Promise(resolve => {
        new Dialog({
          title: "Kategorie bearbeiten",
          content: `<form><div class="form-group"><label>Name</label><input name="name" type="text" value="${escapeAttr(currentName)}" autofocus></div></form>`,
          buttons: {
            rename: { label: "Umbenennen", callback: html => resolve({ action: "rename", name: sanitizePlainText(html.find('[name="name"]').val(), { max: 48 }) }) },
            delete: { label: "Löschen", callback: () => resolve({ action: "delete" }) },
            cancel: { label: "Abbrechen", callback: () => resolve(null) }
          },
          default: "rename",
          close: () => resolve(null)
        }).render(true);
        setTimeout(() => {
          const el = document.querySelector('.dialog.app.window-app');
          if (el) {
            el.style.zIndex = "20000";
            el.classList.add("betterinv-dialog-top");
            const input = el.querySelector('input[name="name"]');
            if (input) {
              ["keydown", "keyup", "keypress", "beforeinput", "input", "paste"].forEach(type => {
                input.addEventListener(type, event => event.stopPropagation(), { capture: true });
              });
              input.focus();
              input.select();
            }
          }
        }, 50);
      });
      if (!choice) return;
      const containerId = activeContainer?.id ?? null;
      if (choice.action === "rename") await renameCategory(actor, currentName, choice.name, containerId);
      if (choice.action === "delete") await deleteCategory(actor, currentName, containerId);
      renderBetterInvWindow();
    });
  });

  enableSubcategoryDragSorting(windowEl, actor, activeContainer?.id ?? null);
  enableCategoryDragSorting(windowEl, actor, activeContainer?.id ?? null);
  enableItemDragSorting(windowEl, actor, activeContainer?.id ?? null);

  windowEl.querySelectorAll(".betterinv-category-select").forEach(select => {
    select.addEventListener("change", async event => {
      const row = event.currentTarget.closest(".betterinv-item");
      const item = actor?.items?.get(row?.dataset?.itemId);
      await setItemCategory(item, event.currentTarget.value, activeContainer?.id ?? null);
      renderBetterInvWindow();
    });
  });

  windowEl.querySelectorAll(".betterinv-open-item").forEach(button => {
    button.addEventListener("click", async event => {
      const row = event.currentTarget.closest(".betterinv-item");
      const item = actor?.items?.get(row?.dataset?.itemId);
      await useOrOpenItem(item, event);
    });
  });

  windowEl.querySelectorAll(".betterinv-edit-item").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const row = event.currentTarget.closest(".betterinv-item");
      const item = actor?.items?.get(row?.dataset?.itemId);
      openItemSheet(item);
    });
  });

  windowEl.querySelectorAll(".betterinv-item-actions-button").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const row = event.currentTarget.closest(".betterinv-item");
      const item = actor?.items?.get(row?.dataset?.itemId);
      openBetterInvItemActionMenu(event.currentTarget, actor, item);
    });
  });

  windowEl.querySelectorAll(".betterinv-quantity-minus, .betterinv-quantity-plus").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      const row = event.currentTarget.closest(".betterinv-item");
      const item = actor?.items?.get(row?.dataset?.itemId);
      if (!item) return;
      button.disabled = true;
      try {
        const delta = event.currentTarget.classList.contains("betterinv-quantity-plus") ? 1 : -1;
        await changeItemQuantity(item, delta);
      } catch (error) {
        console.error("Better Inventory | Menge konnte nicht geändert werden", error);
        ui.notifications.error("Die Item-Anzahl konnte nicht geändert werden.");
      } finally {
        button.disabled = false;
      }
    });
  });

  windowEl.querySelectorAll(".betterinv-quantity-value").forEach(input => {
    input.addEventListener("click", event => event.stopPropagation());
    input.addEventListener("focus", event => {
      event.stopPropagation();
      event.currentTarget.dataset.originalValue = event.currentTarget.value;
      event.currentTarget.select();
    });
    input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.currentTarget.value = event.currentTarget.dataset.originalValue ?? "0";
        event.currentTarget.dataset.cancelled = "true";
        event.currentTarget.blur();
      }
    });
    input.addEventListener("blur", async event => {
      event.stopPropagation();
      const field = event.currentTarget;
      if (field.dataset.cancelled === "true") {
        delete field.dataset.cancelled;
        return;
      }
      const row = field.closest(".betterinv-item");
      const item = actor?.items?.get(row?.dataset?.itemId);
      if (!item) return;
      const oldValue = getItemQuantityData(item).value;
      const parsed = Number(field.value);
      const next = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : oldValue;
      field.value = String(next);
      field.disabled = true;
      try {
        await setItemQuantity(item, next);
        field.dataset.originalValue = String(next);
      } catch (error) {
        field.value = String(oldValue);
        console.error("Better Inventory | Menge konnte nicht direkt geändert werden", error);
        ui.notifications.error("Die Item-Anzahl konnte nicht geändert werden.");
      } finally {
        field.disabled = false;
      }
    });
  });
}

function ensureDropIndicator(windowEl) {
  let indicator = windowEl.querySelector(".betterinv-drop-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "betterinv-drop-indicator";
  }
  return indicator;
}

function clearDropIndicator(windowEl) {
  windowEl.querySelector(".betterinv-drop-indicator")?.remove();
}

function enableContainerDragSorting(windowEl, actor, activeContainer = null) {
  if (activeContainer) return;
  const strip = windowEl.querySelector(".betterinv-containers:not(.betterinv-containers-search)");
  if (!strip) return;
  const cards = Array.from(strip.querySelectorAll(".betterinv-container-card"));
  cards.forEach(card => {
    card.addEventListener("dragstart", event => {
      if (event.target.closest(".betterinv-container-rename")) { event.preventDefault(); return; }
      if (windowEl.querySelector(".betterinv-item-dragging")) return;
      card.classList.add("betterinv-container-dragging", "betterinv-item-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-betterinv-container", card.dataset.containerId);
      event.stopPropagation();
    });
    card.addEventListener("dragend", async event => {
      event.stopPropagation();
      const indicator = windowEl.querySelector(".betterinv-container-drop-indicator");
      if (indicator?.parentNode) indicator.parentNode.insertBefore(card, indicator);
      indicator?.remove();
      card.classList.remove("betterinv-container-dragging", "betterinv-item-dragging");
      const rows = Array.from(strip.querySelectorAll(".betterinv-container-row"));
      const order = [];
      const layerMap = {};
      rows.forEach((row, rowIndex) => {
        row.querySelectorAll(".betterinv-container-card").forEach(el => {
          const id = el.dataset.containerId;
          if (!id) return;
          order.push(id);
          layerMap[id] = rowIndex;
        });
      });
      await setContainerOrder(actor, order);
      await setContainerLayerMap(actor, layerMap);
      renderBetterInvWindow();
    });
  });
  strip.querySelectorAll(".betterinv-container-row").forEach(row => {
    row.addEventListener("dragover", event => {
      const dragging = windowEl.querySelector(".betterinv-container-dragging");
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      const indicator = ensureContainerDropIndicator(windowEl);
      const afterElement = getContainerAfterElement(row, event.clientX, event.clientY);
      if (afterElement == null) row.appendChild(indicator);
      else row.insertBefore(indicator, afterElement);
    });
    row.addEventListener("drop", event => {
      if (windowEl.querySelector(".betterinv-container-dragging")) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  });
}

function ensureContainerDropIndicator(windowEl) {
  let indicator = windowEl.querySelector(".betterinv-container-drop-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "betterinv-container-drop-indicator";
  }
  return indicator;
}

function getContainerAfterElement(row, x, y) {
  const cards = [...row.querySelectorAll(".betterinv-container-card:not(.betterinv-container-dragging)")];
  for (const card of cards) {
    const box = card.getBoundingClientRect();
    if (x < box.left + box.width / 2) return card;
  }
  return null;
}

function enableItemToContainerDrop(windowEl, actor, activeContainer = null) {
  windowEl.querySelectorAll(".betterinv-container-card").forEach(card => {
    card.addEventListener("dragover", event => {
      const dragging = windowEl.querySelector(".betterinv-item-dragging");
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      card.classList.add("betterinv-container-drop-target");
    });
    card.addEventListener("dragleave", () => card.classList.remove("betterinv-container-drop-target"));
    card.addEventListener("drop", async event => {
      const dragging = windowEl.querySelector(".betterinv-item-dragging");
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      card.classList.remove("betterinv-container-drop-target");
      const item = actor?.items?.get(dragging.dataset.itemId);
      const targetContainer = actor?.items?.get(card.dataset.containerId);
      if (!item || !targetContainer || item.id === targetContainer.id) return;
      await moveItemToContainer(item, targetContainer);
      await setItemCategory(item, "__unsorted", targetContainer.id);
      await setItemCategory(item, "__unsorted", activeContainer?.id ?? null);
      renderBetterInvWindow();
    });
  });

  const removeZone = windowEl.querySelector(".betterinv-remove-from-container");
  if (removeZone && activeContainer) {
    removeZone.addEventListener("dragover", event => {
      const dragging = windowEl.querySelector(".betterinv-item-dragging");
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      removeZone.classList.add("betterinv-remove-target");
    });
    removeZone.addEventListener("dragleave", () => removeZone.classList.remove("betterinv-remove-target"));
    removeZone.addEventListener("drop", async event => {
      const dragging = windowEl.querySelector(".betterinv-item-dragging");
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      removeZone.classList.remove("betterinv-remove-target");
      const item = actor?.items?.get(dragging.dataset.itemId);
      if (!item) return;
      await moveItemToContainer(item, null);
      await setItemCategory(item, "__unsorted", null);
      await setItemCategory(item, "__unsorted", activeContainer?.id ?? null);
      renderBetterInvWindow();
    });
  }
}

async function moveItemToContainer(item, targetContainer = null) {
  if (!item) return;
  const current = foundry.utils.getProperty(item, "system.container");
  const targetValue = targetContainer ? targetContainer.id : null;
  const update = {};

  if (current && typeof current === "object" && !Array.isArray(current)) {
    update["system.container"] = targetContainer
      ? { ...foundry.utils.deepClone(current), id: targetContainer.id, uuid: targetContainer.uuid, value: targetValue }
      : { ...foundry.utils.deepClone(current), id: null, uuid: null, value: null };
  } else {
    update["system.container"] = targetValue ?? "";
  }

  try { await item.update(update); return; }
  catch (err) { console.warn("Better Inventory | direct container update failed, trying id fallback", err); }

  try { await item.update({ "system.container": targetContainer?.id ?? "" }); return; }
  catch (err) { console.warn("Better Inventory | id container update failed", err); }

  ui.notifications.warn("Item konnte nicht automatisch in den Container verschoben werden. DnD5e hat das Datenfeld nicht akzeptiert.");
}


function enableSubcategoryDragSorting(windowEl, actor, containerId = null) {
  const subcats = Array.from(windowEl.querySelectorAll(".betterinv-subcategory"));

  subcats.forEach(subEl => {
    subEl.addEventListener("dragstart", event => {
      if (event.target.closest(".betterinv-item, select, input, textarea, a, .betterinv-subcategory-settings")) {
        event.preventDefault();
        return;
      }
      subEl.classList.add("betterinv-subcategory-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-betterinv-subcategory", subEl.dataset.subcategory);
      event.stopPropagation();
    });

    subEl.addEventListener("dragend", async event => {
      event.stopPropagation();
      const indicator = windowEl.querySelector(".betterinv-drop-indicator");
      const oldParentName = subEl.dataset.parentCategory;
      const targetParent = indicator?.closest(".betterinv-category");
      const targetParentName = targetParent?.dataset?.category;

      if (indicator?.parentNode && targetParentName === oldParentName) {
        indicator.parentNode.insertBefore(subEl, indicator);
      }
      clearDropIndicator(windowEl);
      subEl.classList.remove("betterinv-subcategory-dragging");

      const parentEl = windowEl.querySelector(`.betterinv-category[data-category="${CSS.escape(oldParentName ?? "")}"]`);
      if (parentEl) {
        const order = Array.from(parentEl.querySelectorAll(":scope > .betterinv-subcategory"))
          .map(el => el.dataset.subcategory)
          .filter(Boolean);
        await setSubcategories(actor, oldParentName, order, containerId);
      }
      renderBetterInvWindow();
    });
  });

  windowEl.querySelectorAll(".betterinv-category").forEach(categoryEl => {
    categoryEl.addEventListener("dragover", event => {
      const dragging = windowEl.querySelector(".betterinv-subcategory-dragging");
      if (!dragging) return;
      if (dragging.dataset.parentCategory !== categoryEl.dataset.category) return;
      if (event.target.closest(".betterinv-item")) return;
      event.preventDefault();
      event.stopPropagation();
      categoryEl.open = true;
      const indicator = ensureDropIndicator(windowEl);
      const afterElement = getSubcategoryAfterElement(categoryEl, event.clientY);
      if (afterElement == null) categoryEl.appendChild(indicator);
      else categoryEl.insertBefore(indicator, afterElement);
    });
    categoryEl.addEventListener("drop", event => {
      if (!windowEl.querySelector(".betterinv-subcategory-dragging")) return;
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

function getSubcategoryAfterElement(categoryEl, y) {
  const draggableElements = [...categoryEl.querySelectorAll(":scope > .betterinv-subcategory:not(.betterinv-subcategory-dragging)")];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function enableCategoryDragSorting(windowEl, actor, containerId = null) {
  const body = windowEl.querySelector(".betterinv-body");
  const categories = Array.from(windowEl.querySelectorAll(".betterinv-category"));
  categories.forEach(categoryEl => {
    categoryEl.addEventListener("dragstart", event => {
      // If the drag started from an item row inside this category, the item
      // sorter owns the drag. Otherwise the category sorter would also fire
      // because dragstart bubbles through the <details> element.
      if (event.target.closest(".betterinv-item, .betterinv-subcategory")) return;
      categoryEl.classList.add("betterinv-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-betterinv-category", categoryEl.dataset.category);
      event.stopPropagation();
    });
    categoryEl.addEventListener("dragend", async () => {
      const indicator = windowEl.querySelector(".betterinv-drop-indicator");
      if (indicator?.parentNode) indicator.parentNode.insertBefore(categoryEl, indicator);
      clearDropIndicator(windowEl);
      categoryEl.classList.remove("betterinv-dragging");
      const order = Array.from(windowEl.querySelectorAll(".betterinv-category")).map(el => el.dataset.category).filter(Boolean);
      await setCategoryOrder(actor, order, containerId);
      renderBetterInvWindow();
    });
  });
  body?.addEventListener("dragover", event => {
    const dragging = windowEl.querySelector(".betterinv-dragging");
    if (!dragging) return;
    event.preventDefault();
    const indicator = ensureDropIndicator(windowEl);
    const afterElement = getCategoryAfterElement(windowEl, event.clientY);
    const parent = dragging.parentElement ?? windowEl.querySelector(".betterinv-content") ?? body;
    if (afterElement == null) parent.appendChild(indicator);
    else afterElement.parentNode.insertBefore(indicator, afterElement);
  });
  body?.addEventListener("drop", event => {
    if (windowEl.querySelector(".betterinv-dragging")) event.preventDefault();
  });
}

function getCategoryAfterElement(windowEl, y) {
  const draggableElements = [...windowEl.querySelectorAll(".betterinv-category:not(.betterinv-dragging)")];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function enableItemDragSorting(windowEl, actor, containerId = null) {
  const rows = Array.from(windowEl.querySelectorAll(".betterinv-item"));
  rows.forEach(row => {
    row.addEventListener("dragstart", event => {
      if (event.target.closest("select, input, textarea, a, button, .betterinv-edit-item, .betterinv-open-item, .betterinv-quantity-controls")) {
        event.preventDefault();
        return;
      }
      row.classList.add("betterinv-item-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-betterinv-item", row.dataset.itemId);
      event.dataTransfer.setData("text/plain", row.dataset.itemId);
      event.stopPropagation();
    });
    row.addEventListener("dragend", async event => {
      event.stopPropagation();
      const indicator = windowEl.querySelector(".betterinv-drop-indicator");
      const targetList = indicator?.closest(".betterinv-items");
      const targetCategory = targetList?.closest(".betterinv-subcategory, .betterinv-category")?.dataset.category;
      if (indicator?.parentNode) indicator.parentNode.insertBefore(row, indicator);
      clearDropIndicator(windowEl);
      row.classList.remove("betterinv-item-dragging");

      const item = actor?.items?.get(row.dataset.itemId);
      if (item && targetCategory && row.dataset.category !== targetCategory) {
        await setItemCategory(item, targetCategory, containerId);
        row.dataset.category = targetCategory;
      }

      // Save one global visual order for the current actor/container context.
      // Filtering by category later keeps each category's local order stable.
      const order = Array.from(windowEl.querySelectorAll(".betterinv-item")).map(el => el.dataset.itemId).filter(Boolean);
      await setItemOrder(actor, order, containerId);
      renderBetterInvWindow();
    });
  });

  const placeIndicatorInList = (list, clientY) => {
    const indicator = ensureDropIndicator(windowEl);
    const afterElement = getItemAfterElement(list, clientY);
    if (afterElement == null) list.appendChild(indicator);
    else list.insertBefore(indicator, afterElement);
  };

  windowEl.querySelectorAll(".betterinv-items").forEach(list => {
    list.addEventListener("dragover", event => {
      const dragging = windowEl.querySelector(".betterinv-item-dragging");
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      placeIndicatorInList(list, event.clientY);
    });
    list.addEventListener("drop", event => {
      if (!windowEl.querySelector(".betterinv-item-dragging")) return;
      event.preventDefault();
      event.stopPropagation();
    });
  });

  // Allow dropping an item on a category header/body too. This is important when
  // a category is empty or collapsed: the item still gets a clear white target
  // line inside that category.
  windowEl.querySelectorAll(".betterinv-category, .betterinv-subcategory").forEach(categoryEl => {
    categoryEl.addEventListener("dragover", event => {
      const dragging = windowEl.querySelector(".betterinv-item-dragging");
      if (!dragging) return;
      if (event.target.closest(".betterinv-item")) return;
      event.preventDefault();
      event.stopPropagation();
      categoryEl.open = true;
      const list = categoryEl.querySelector(".betterinv-items");
      if (list) placeIndicatorInList(list, event.clientY);
    });
    categoryEl.addEventListener("drop", event => {
      if (!windowEl.querySelector(".betterinv-item-dragging")) return;
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

function getItemAfterElement(list, y) {
  const draggableElements = [...list.querySelectorAll(".betterinv-item:not(.betterinv-item-dragging)")];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function useOrOpenItem(item, event) {
  if (!item) return;

  // Prefer the native dnd5e usage flow. This is what opens the normal consume/use
  // dialog for consumables and rolls tools/spells where the system supports it.
  const attempts = [
    async () => typeof item.use === "function" ? item.use({ event, configureDialog: true }) : null,
    async () => {
      const activities = item.system?.activities;
      const activity = activities?.contents?.[0] ?? (activities ? Array.from(activities)[0] : null);
      if (activity && typeof activity.use === "function") return activity.use({ event, configureDialog: true });
      return null;
    },
    async () => typeof item.roll === "function" ? item.roll({ event, configureDialog: true }) : null
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      elevateRecentFoundryApps();
      if (result !== null && result !== undefined) return;
    } catch (err) {
      console.warn("Better Inventory | native item use failed, trying fallback", err);
    }
  }

  item.sheet?.render(true);
  elevateRecentFoundryApps();
}

function openItemSheet(item) {
  if (!item) return;
  item.sheet?.render(true);
  elevateRecentFoundryApps();
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
      windowEl.style.left = `${Math.max(0, Math.min(maxLeft, moveEvent.clientX - offsetX))}px`;
      windowEl.style.top = `${Math.max(0, Math.min(maxTop, moveEvent.clientY - offsetY))}px`;
      windowEl.style.right = "auto";
      windowEl.style.bottom = "auto";
    }
    function onUp() { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function openBetterInvPopup(windowEl) {
  const popup = window.open("", "betterinv-popout", "width=620,height=720,resizable=yes,scrollbars=yes");
  if (!popup) { ui.notifications.warn("Popup wurde vom Browser blockiert. Erlaube Popups für Foundry."); return; }
  betterInvPopup = popup;
  const bodyHtml = windowEl.querySelector(".betterinv-body")?.innerHTML ?? "";
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><title>Better Inventory</title><link rel="stylesheet" href="/modules/betterinv/styles/style.css"><style>
    body{margin:0;min-height:100vh;background:#06080b;color:#eef3f7;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:auto;padding:18px}
    .betterinv-popup-shell{max-width:820px;margin:0 auto}.betterinv-popup-title{margin:0 0 12px;font-size:22px;font-weight:900;letter-spacing:.02em}.betterinv-note{color:rgba(238,243,247,.62);margin-bottom:14px}
    .betterinv-toolbar,.betterinv-category-picker,.betterinv-edit-item,.betterinv-quantity-controls{display:none!important}.betterinv-item{grid-template-columns:46px minmax(0,1fr)!important}
  </style></head><body><div class="betterinv-popup-shell"><h1 class="betterinv-popup-title">🎒 Better Inventory</h1><div class="betterinv-note">Popup-Ansicht. Änderungen machst du aktuell im Foundry-Fenster.</div>${bodyHtml}</div></body></html>`);
  popup.document.close();
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escapeAttr(value) { return escapeHtml(value); }
