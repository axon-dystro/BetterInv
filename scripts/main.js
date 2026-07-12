/* Better Inventory - Foundry VTT v14 lightweight module */

const MODULE_ID = "betterinv";
const DEFAULT_CATEGORIES = [];
const BETTER_INV_USER_SETTINGS_FLAG = "userSettings";
const BETTER_INV_USER_SETTINGS_VERSION = 3;
const DEFAULT_BETTER_INV_USER_SETTINGS = Object.freeze({
  version: BETTER_INV_USER_SETTINGS_VERSION,
  moduleEnabled: true,
  showCurrency: true,
  showCurrencyCalculator: true,
  showItems: true,
  showSearch: true,
  showCategories: true,
  showSubcategories: true,
  showFavorites: true,
  showUnknownItems: true,
  showCategoryWeights: true,
  showItemValues: true,
  showQuantityControls: true,
  showEditButton: true,
  showAddItemButton: true,
  showItemActionsMenu: true,
  showEquipActions: true,
  showCategoryDropdown: true,
  showContainers: true,
  showContainerCapacity: true,
  showEncumbrance: true
});

const BETTER_INV_SETTINGS_GROUPS = [
  {
    title: "Geld",
    icon: "fa-coins",
    settings: [
      ["showCurrency", "Geldanzeige", "Zeigt Platin, Gold, Elektrum, Silber und Kupfer."],
      ["showCurrencyCalculator", "Geldrechner", "Zeigt Eingaben sowie Hinzufügen, Bezahlen, Aufrunden und Abrunden."]
    ]
  },
  {
    title: "Items",
    icon: "fa-list",
    settings: [
      ["showItems", "Items anzeigen", "Blendet die vollständige Itemliste ein oder aus."],
      ["showSearch", "Suchleiste", "Zeigt die Suche oberhalb der Items und Rucksäcke."],
      ["showCategories", "Kategorien", "Zeigt Kategorien und ihre Verwaltungsfunktionen."],
      ["showSubcategories", "Unterkategorien", "Zeigt Unterkategorien innerhalb der Hauptkategorien."],
      ["showFavorites", "Favoriten", "Zeigt den Favoritenbereich und die Favoritenaktion."],
      ["showUnknownItems", "Unbekannte Items", "Zeigt nicht identifizierte Items in einem eigenen Bereich."],
      ["showCategoryWeights", "Kategoriegewicht", "Zeigt Gewichte an Kategorien und Unterkategorien."],
      ["showItemValues", "Itempreise", "Zeigt den gespeicherten Wert direkt am Item."],
      ["showQuantityControls", "Mengensteuerung", "Zeigt Anzahl sowie Plus- und Minussteuerung."],
      ["showEditButton", "Bearbeiten-Button", "Zeigt den Stift direkt am Item."],
      ["showAddItemButton", "Item hinzufügen", "Zeigt den Button zum Erstellen eines neuen Items."],
      ["showItemActionsMenu", "Drei-Punkte-Menü", "Zeigt weitere Itemaktionen wie Duplizieren und Löschen."],
      ["showEquipActions", "Ausrüsten / Ablegen", "Zeigt die Ausrüstungsaktion im Drei-Punkte-Menü."],
      [null, "Einstimmung", "Unterstützung für eingestimmte Gegenstände folgt in einer späteren Version.", { disabled: true, badge: "Coming soon" }],
      ["showCategoryDropdown", "Kategorie-Dropdown", "Zeigt die kleine Kategorienauswahl direkt am Item."]
    ]
  },
  {
    title: "Container",
    icon: "fa-box-open",
    settings: [
      ["showContainers", "Rucksäcke anzeigen", "Blendet Rucksackkarten und Containeransicht vollständig ein oder aus."],
      ["showContainerCapacity", "Containerkapazität", "Zeigt Kapazität und Balken auf Rucksäcken."]
    ]
  },
  {
    title: "Charakter",
    icon: "fa-weight-hanging",
    settings: [
      ["showEncumbrance", "Traglast", "Zeigt die gesamte Traglast des Charakters."]
    ]
  }
];
let betterInvPopup = null;
let betterInvActionMenuCleanup = null;
let betterInvActionMenuButton = null;
let betterInvState = {
  actorId: null,
  containerId: null,
  search: "",
  scale: 1,
  settingsOpen: false,
  currencyDraftActorId: null,
  currencyDraft: {}
};

// Prevent overlapping money transactions for the same actor, including during
// updateActor-triggered re-renders which can temporarily create fresh buttons.
const betterInvCurrencyTransactions = new Set();

Hooks.once("init", () => {
  registerBetterInvHotkey();
  registerBetterInvSettings();
});

Hooks.once("ready", async () => {
  console.log("Better Inventory loaded!");
  await initializeBetterInvUserSettings();
  ensureBetterInvButton();
  installBetterInvInputGuard();
  installBetterInvDialogZGuard();
});

Hooks.on("renderHotbar", () => ensureBetterInvButton());
Hooks.on("controlToken", () => {
  if (getBetterInvUserSettings().moduleEnabled === false) return;
  if (document.getElementById("betterinv-window")) renderBetterInvWindow();
});
Hooks.on("updateActor", actor => refreshIfCurrentActor(actor));
Hooks.on("createItem", item => refreshIfItemActor(item));
Hooks.on("updateItem", item => refreshIfItemActor(item));
Hooks.on("deleteItem", item => refreshIfItemActor(item));
Hooks.on("updateUser", (user, changes) => {
  if (user?.id !== game.user?.id) return;
  const settingsChange = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${BETTER_INV_USER_SETTINGS_FLAG}`);
  if (settingsChange === undefined) return;
  if (document.getElementById("betterinv-window")) renderBetterInvWindow();
});

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

function registerBetterInvSettings() {
  if (!game?.settings) return;
  // Legacy client setting from Phase 3.2. It stays registered so existing
  // choices can be migrated once into the per-user Foundry flag below.
  game.settings.register(MODULE_ID, "showItemValues", {
    name: "Itemwerte anzeigen (veraltet)",
    hint: "Diese ältere Einstellung wird automatisch in die persönlichen Inventareinstellungen übernommen.",
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });
}

function normalizeBetterInvUserSettings(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const normalized = { version: BETTER_INV_USER_SETTINGS_VERSION };
  for (const [key, defaultValue] of Object.entries(DEFAULT_BETTER_INV_USER_SETTINGS)) {
    if (key === "version") continue;
    normalized[key] = source[key] === undefined ? defaultValue : source[key] !== false;
  }
  return normalized;
}

function getBetterInvUserSettings() {
  try {
    return normalizeBetterInvUserSettings(game.user?.getFlag?.(MODULE_ID, BETTER_INV_USER_SETTINGS_FLAG));
  } catch (error) {
    console.warn("Better Inventory | Persönliche Einstellungen konnten nicht gelesen werden", error);
    return { ...DEFAULT_BETTER_INV_USER_SETTINGS };
  }
}

function getBetterInvFeaturePlan(settings = getBetterInvUserSettings()) {
  const enabled = settings?.moduleEnabled !== false;
  const items = enabled && settings?.showItems !== false;
  const containers = enabled && settings?.showContainers !== false;
  const categories = items && settings?.showCategories !== false;
  const subcategories = categories && settings?.showSubcategories !== false;
  const currency = enabled && settings?.showCurrency !== false;
  const currencyCalculator = currency && settings?.showCurrencyCalculator !== false;

  return {
    enabled,
    items,
    containers,
    categories,
    subcategories,
    favorites: items && settings?.showFavorites !== false,
    unknownItems: items && settings?.showUnknownItems !== false,
    categoryWeights: categories && settings?.showCategoryWeights !== false,
    itemValues: items && settings?.showItemValues !== false,
    quantityControls: items && settings?.showQuantityControls !== false,
    editButton: items && settings?.showEditButton !== false,
    addItemButton: items && settings?.showAddItemButton !== false,
    itemActionsMenu: items && settings?.showItemActionsMenu !== false,
    equipActions: items && settings?.showEquipActions !== false,
    categoryDropdown: categories && settings?.showCategoryDropdown !== false,
    containerCapacity: containers && settings?.showContainerCapacity !== false,
    encumbrance: enabled && settings?.showEncumbrance !== false,
    currency,
    currencyCalculator,
    search: enabled && settings?.showSearch !== false && (items || containers),
    needsInventoryCollection: items || containers,
    needsItemDocumentRefresh: items || containers || (enabled && settings?.showEncumbrance !== false),
    needsActorRefresh: currency || items || containers || (enabled && settings?.showEncumbrance !== false)
  };
}

async function saveBetterInvUserSettings(patch = {}) {
  if (!game.user?.setFlag) throw new Error("Kein angemeldeter Foundry-Nutzer verfügbar.");
  const current = getBetterInvUserSettings();
  const next = normalizeBetterInvUserSettings({ ...current, ...patch });
  await game.user.setFlag(MODULE_ID, BETTER_INV_USER_SETTINGS_FLAG, next);
  return next;
}

async function initializeBetterInvUserSettings() {
  if (!game.user?.getFlag || !game.user?.setFlag) return;
  const existing = game.user.getFlag(MODULE_ID, BETTER_INV_USER_SETTINGS_FLAG);
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    const normalized = normalizeBetterInvUserSettings(existing);
    const needsUpdate = JSON.stringify(existing) !== JSON.stringify(normalized);
    if (needsUpdate) await game.user.setFlag(MODULE_ID, BETTER_INV_USER_SETTINGS_FLAG, normalized);
    return;
  }

  let legacyShowItemValues = true;
  try {
    legacyShowItemValues = game.settings?.get?.(MODULE_ID, "showItemValues") !== false;
  } catch (_) {}
  await game.user.setFlag(MODULE_ID, BETTER_INV_USER_SETTINGS_FLAG, {
    ...DEFAULT_BETTER_INV_USER_SETTINGS,
    showItemValues: legacyShowItemValues
  });
}

function betterInvShowsItemValues() {
  return getBetterInvUserSettings().showItemValues;
}


function installBetterInvInputGuard() {
  if (document.body?.dataset?.betterInvInputGuard === "1") return;
  if (document.body?.dataset) document.body.dataset.betterInvInputGuard = "1";
  const guard = event => {
    const target = event.target;
    if (!target?.closest?.("#betterinv-window .betterinv-search, #betterinv-window .betterinv-currency-input, .betterinv-dialog-top input, .betterinv-dialog-top textarea")) return;
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
  const features = getBetterInvFeaturePlan();
  if (!features.needsActorRefresh) return;
  const current = getCurrentActor();
  if (current?.id === actor?.id && document.getElementById("betterinv-window")) renderBetterInvWindow();
}

function refreshIfItemActor(item) {
  const features = getBetterInvFeaturePlan();
  if (!features.needsItemDocumentRefresh) return;
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

function getContainerItems(actor, inventoryItems = null) {
  const items = Array.isArray(inventoryItems) ? inventoryItems : getInventoryItems(actor);
  return items.filter(item => isContainerLike(item));
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

function getVisibleItems(actor, container, inventoryItems = null) {
  const items = Array.isArray(inventoryItems) ? inventoryItems : getInventoryItems(actor);

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
  if (id === "__unknown") return "Unbekannt";
  if (id === "__unsorted") return "Unsortiert";
  const parsed = parseCategoryId(id);
  return parsed.sub ? parsed.sub : parsed.parent;
}

async function getCategoryOptions(actor, categories, containerId = null) {
  const options = ["__unknown", "__unsorted"];
  for (const category of categories) {
    options.push(category);
    const subs = await getSubcategories(actor, category, containerId);
    for (const sub of subs) options.push(makeSubcategoryId(category, sub));
  }
  return options;
}

function categoryOptionLabel(id) {
  if (id === "__unknown") return "Unbekannt";
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

function getItemIdentificationData(item) {
  if (!item) return { supported: false, identified: true };

  const direct = foundry.utils.getProperty(item, "system.identified");
  if (typeof direct === "boolean") return { supported: true, identified: direct };
  if (direct && typeof direct === "object" && typeof direct.value === "boolean") {
    return { supported: true, identified: direct.value };
  }

  const nested = foundry.utils.getProperty(item, "system.identification.identified");
  if (typeof nested === "boolean") return { supported: true, identified: nested };

  const status = String(foundry.utils.getProperty(item, "system.identification.status") ?? "").trim().toLowerCase();
  if (status) {
    if (["identified", "known", "revealed"].includes(status)) return { supported: true, identified: true };
    if (["unidentified", "unknown", "hidden"].includes(status)) return { supported: true, identified: false };
  }

  return { supported: false, identified: true };
}

function isBetterInvUnidentified(item) {
  const identification = getItemIdentificationData(item);
  return identification.supported && !identification.identified;
}

function itemCategory(item, containerId = null) {
  const all = item.getFlag(MODULE_ID, "categoryByContext") ?? {};
  const ctx = getContextKey(containerId);
  const explicit = all[ctx];
  if (explicit) return explicit;
  return isBetterInvUnidentified(item) ? "__unknown" : "__unsorted";
}

async function setItemCategory(item, category, containerId = null) {
  if (!item) return;
  const all = foundry.utils.deepClone(item.getFlag(MODULE_ID, "categoryByContext") ?? {});
  const ctx = getContextKey(containerId);

  // Unidentified items default to the virtual "Unbekannt" category. When a
  // user explicitly moves one to "Unsortiert", preserve that choice instead
  // of deleting the flag and immediately sending it back to "Unbekannt".
  if (!category) delete all[ctx];
  else if (category === "__unsorted" && !isBetterInvUnidentified(item)) delete all[ctx];
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
  if (existing) {
    closeBetterInvItemActionMenu();
    existing.remove();
    return;
  }
  betterInvState.containerId = null;
  renderBetterInvWindow();
}

async function renderBetterInvWindow({ preserveScroll = true } = {}) {
  closeBetterInvItemActionMenu();
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

  const userSettings = getBetterInvUserSettings();
  const features = getBetterInvFeaturePlan(userSettings);
  if (!features.enabled) {
    closeBetterInvSettingsWindow();
    windowEl.classList.add("betterinv-disabled-mode");
    windowEl.innerHTML = betterInvDisabledShellHtml();
    windowEl.querySelector(".betterinv-close")?.addEventListener("click", () => windowEl.remove());
    windowEl.querySelector(".betterinv-reactivate")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      if (button instanceof HTMLButtonElement) button.disabled = true;
      try {
        await saveBetterInvUserSettings({ moduleEnabled: true });
        await renderBetterInvWindow({ preserveScroll: false });
      } catch (error) {
        console.error("Better Inventory | Reaktivierung fehlgeschlagen", error);
        ui.notifications.error("Axon’s Inventory konnte nicht wieder aktiviert werden.");
        if (button instanceof HTMLButtonElement) button.disabled = false;
      }
    });
    makeBetterInvDraggable(windowEl);
    return;
  }

  windowEl.classList.remove("betterinv-disabled-mode");
  const actor = getCurrentActor();

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

  if (!features.containers) betterInvState.containerId = null;
  const currentContainer = features.containers && betterInvState.containerId
    ? actor.items.get(betterInvState.containerId)
    : null;
  if (betterInvState.containerId && !currentContainer) betterInvState.containerId = null;
  const activeContainer = features.containers && betterInvState.containerId ? currentContainer : null;
  const query = features.search ? String(betterInvState.search ?? "").trim().toLowerCase() : "";

  // Scan actor inventory documents only when items or containers are enabled.
  // The same array is reused for item rows, container detection, capacity and
  // encumbrance fallbacks instead of repeatedly traversing actor.items.
  const inventoryItems = features.needsInventoryCollection ? getInventoryItems(actor) : null;
  const allVisibleItems = features.items
    ? await sortItemsBySavedOrder(actor, getVisibleItems(actor, activeContainer, inventoryItems), activeContainer?.id ?? null)
    : [];
  const visibleItems = query && features.items
    ? allVisibleItems.filter(item => itemMatchesSearch(item, query))
    : allVisibleItems;
  const containers = features.containers
    ? await sortContainersBySavedOrder(actor, getContainerItems(actor, inventoryItems))
    : [];
  const categories = features.categories ? await getCategories(actor, activeContainer?.id ?? null) : [];
  let categoryOptions = features.categoryDropdown
    ? await getCategoryOptions(actor, categories, activeContainer?.id ?? null)
    : [];
  if (!features.unknownItems) categoryOptions = categoryOptions.filter(id => id !== "__unknown");
  if (!features.subcategories) categoryOptions = categoryOptions.filter(id => !String(id).includes("::"));

  const topContainerHtml = features.containers
    ? (!activeContainer
      ? await renderContainerCards(actor, containers, {
          showCapacity: features.containerCapacity,
          inventoryItems
        })
      : renderContainerBreadcrumb(actor, activeContainer, {
          showCapacity: features.containerCapacity,
          showCount: features.items,
          inventoryItems
        }))
    : "";
  const actorEncumbranceHtml = (!activeContainer && features.encumbrance)
    ? betterInvActorEncumbranceHtml(getBetterInvActorEncumbrance(actor, { inventoryItems }))
    : "";
  const actorCurrencyHtml = features.currency ? betterInvActorCurrencyHtml(
    getBetterInvActorCurrency(actor),
    features.currencyCalculator ? getBetterInvCurrencyDraft(actor) : {},
    {
      editable: actor.isOwner !== false && !isBetterInvCurrencyTransactionPending(actor),
      showCalculator: features.currencyCalculator
    }
  ) : "";
  const searchContainersHtml = (features.containers && features.search && !activeContainer && query)
    ? renderSearchContainerHits(actor, containers, query)
    : "";
  const contextContainerId = activeContainer?.id ?? null;
  const displayCategoryForItem = item => {
    const raw = itemCategory(item, contextContainerId);
    if (raw === "__unknown" && !features.unknownItems) return "__unsorted";
    if (!features.subcategories && String(raw).includes("::")) return parseCategoryId(raw).parent;
    return raw;
  };

  const unknownItems = features.unknownItems
    ? visibleItems.filter(item => itemCategory(item, contextContainerId) === "__unknown")
    : [];
  const regularItems = features.unknownItems
    ? visibleItems.filter(item => itemCategory(item, contextContainerId) !== "__unknown")
    : visibleItems;

  let sectionHtml = "";
  if (features.categories) {
    const order = await getCategoryOrder(actor, contextContainerId, categories);
    const sectionNames = new Map([["__unsorted", "Unsortiert"], ...categories.map(c => [c, c])]);
    const sections = order.map(id => ({ id, name: sectionNames.get(id) })).filter(s => s.name);
    const sectionHtmlParts = [];

    for (const section of sections) {
      const directItems = regularItems.filter(item => displayCategoryForItem(item) === section.id);
      const categoryItems = regularItems.filter(item => {
        const category = displayCategoryForItem(item);
        return category === section.id || (features.subcategories && section.id !== "__unsorted" && category.startsWith(`${section.id}::`));
      });
      const rows = directItems.length
        ? directItems.map(item => itemRowHtml(item, categoryOptions, contextContainerId, { settings: userSettings, features })).join("")
        : `<p class="betterinv-empty">Leer</p>`;

      let subcategoryHtml = "";
      if (features.subcategories && section.id !== "__unsorted") {
        const subs = await getSubcategories(actor, section.id, contextContainerId);
        subcategoryHtml = subs.map(sub => {
          const subId = makeSubcategoryId(section.id, sub);
          const subItems = regularItems.filter(item => displayCategoryForItem(item) === subId);
          const subRows = subItems.length
            ? subItems.map(item => itemRowHtml(item, categoryOptions, contextContainerId, { settings: userSettings, features })).join("")
            : `<p class="betterinv-empty">Leer</p>`;
          return `
            <details class="betterinv-subcategory" open draggable="true" data-parent-category="${escapeAttr(section.id)}" data-category="${escapeAttr(subId)}" data-subcategory="${escapeAttr(sub)}">
              <summary>
                <span class="betterinv-sub-grip" title="Unterkategorie verschieben">☰</span>
                <span class="betterinv-sub-indent">↳</span>
                <span class="betterinv-category-name">${escapeHtml(sub)}</span>
                ${features.categoryWeights ? betterInvCategoryWeightHtml(subItems, "Unterkategoriegewicht") : ""}
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
            ${features.categoryWeights ? betterInvCategoryWeightHtml(categoryItems) : ""}
            <span class="betterinv-category-count">${directItems.length}</span>
            ${features.subcategories && section.id !== "__unsorted" ? `<span class="betterinv-add-subcategory" title="Unterkategorie erstellen">+</span>` : ""}
            <span class="betterinv-category-settings" title="Kategorie bearbeiten">⚙</span>
          </summary>
          <div class="betterinv-items">${rows}</div>
          ${subcategoryHtml}
        </details>`);
    }
    sectionHtml = sectionHtmlParts.join("");
  } else if (features.items) {
    const flatRows = regularItems.length
      ? regularItems.map(item => itemRowHtml(item, categoryOptions, contextContainerId, { settings: userSettings, features })).join("")
      : `<p class="betterinv-empty">Keine Items vorhanden.</p>`;
    sectionHtml = `
      <section class="betterinv-system-category betterinv-flat-category">
        <div class="betterinv-unknown-header">
          <span class="betterinv-category-name">Items</span>
          ${features.categoryWeights ? betterInvCategoryWeightHtml(regularItems, "Gesamtgewicht der angezeigten Items") : ""}
          <span class="betterinv-category-count">${regularItems.length}</span>
        </div>
        <div class="betterinv-items">${flatRows}</div>
      </section>`;
  }

  const unknownHtml = unknownItems.length ? `
    <section class="betterinv-system-category betterinv-unknown-category" data-category="__unknown">
      <div class="betterinv-unknown-header">
        <span class="betterinv-unknown-icon" aria-hidden="true"><i class="fas fa-question-circle"></i></span>
        <span class="betterinv-category-name">Unbekannt</span>
        ${features.categoryWeights ? betterInvCategoryWeightHtml(unknownItems, "Gewicht unbekannter Items") : ""}
        <span class="betterinv-category-count">${unknownItems.length}</span>
      </div>
      <div class="betterinv-items betterinv-unknown-items">
        ${unknownItems.map(item => itemRowHtml(item, categoryOptions, contextContainerId, { settings: userSettings, features })).join("")}
      </div>
    </section>` : "";

  const favoriteItems = features.favorites ? visibleItems.filter(item => isBetterInvFavorite(item)) : [];
  const favoritesHtml = favoriteItems.length ? `
    <section class="betterinv-favorites">
      <div class="betterinv-favorites-header">
        <span class="betterinv-favorites-icon" aria-hidden="true">★</span>
        <span class="betterinv-category-name">Favoriten</span>
        <span class="betterinv-category-count">${favoriteItems.length}</span>
      </div>
      <div class="betterinv-items betterinv-favorite-items">
        ${favoriteItems.map(item => itemRowHtml(item, categoryOptions, contextContainerId, { favoriteView: true, settings: userSettings, features })).join("")}
      </div>
    </section>` : "";

  const showInventoryHeader = features.containers || features.items;
  const inventoryHeaderHtml = showInventoryHeader ? `
    <div class="betterinv-actor">
      <strong>${activeContainer
        ? escapeHtml(getContainerAlias(actor, activeContainer))
        : (features.containers ? "Rucksäcke" : "Inventar")}</strong>
      <div class="betterinv-actor-right">
        ${activeContainer ? `
          <span class="betterinv-actor-meta">
            ${features.items ? `Inhalt · ${visibleItems.length} Items` : "Rucksack geöffnet"}
            ${game.user.isGM ? `<button type="button" class="betterinv-change-actor" title="Anderen Spielercharakter öffnen">Spieler wechseln</button>` : ""}
            <button type="button" class="betterinv-active-container-rename" data-container-id="${activeContainer.id}" title="Rucksack-UI-Name ändern">✎</button>
          </span>` : `
          ${game.user.isGM ? `<button type="button" class="betterinv-change-actor" title="Anderen Spielercharakter öffnen">Spieler wechseln</button>` : ""}
          ${features.containers ? `
            <div class="betterinv-container-tools betterinv-container-tools-inline" aria-label="Rucksack-Layer einstellen">
              <span>Layer</span>
              <button type="button" class="betterinv-layer-minus" title="Layer entfernen">−</button>
              <button type="button" class="betterinv-layer-plus" title="Layer hinzufügen">+</button>
            </div>` : ""}`}
      </div>
    </div>` : "";

  const searchFieldHtml = features.search && (features.items || features.containers)
    ? `<input type="search" class="betterinv-search" value="${escapeAttr(betterInvState.search ?? "")}" placeholder="Suchen: Item, Pergament, Arrow, Bagpipes …">`
    : "";
  const addItemHtml = features.items && features.addItemButton
    ? `<button type="button" class="betterinv-add-item" title="Item hinzufügen: leer erstellen oder aus einem Kompendium übernehmen"><i class="fas fa-plus" aria-hidden="true"></i><span>Item</span></button>`
    : "";
  const addCategoryHtml = features.categories
    ? `<button type="button" class="betterinv-add-category">+ Kategorie</button>`
    : "";
  const toolbarClasses = [
    "betterinv-toolbar",
    searchFieldHtml ? "" : "betterinv-toolbar-no-search",
    !addItemHtml && !addCategoryHtml ? "betterinv-toolbar-search-only" : ""
  ].filter(Boolean).join(" ");
  const toolbarHtml = searchFieldHtml || addItemHtml || addCategoryHtml
    ? `<div class="${toolbarClasses}">${searchFieldHtml}${addItemHtml}${addCategoryHtml}</div>`
    : "";

  windowEl.innerHTML = baseShellHtml(`
    <div class="betterinv-content" style="zoom: ${escapeAttr(String(betterInvState.scale || 1))}">
      ${actorEncumbranceHtml}
      ${actorCurrencyHtml}
      ${inventoryHeaderHtml}
      ${topContainerHtml}
      ${toolbarHtml}
      ${searchContainersHtml}
      ${features.items ? favoritesHtml : ""}
      ${features.items ? unknownHtml : ""}
      ${features.items ? sectionHtml : ""}
    </div>
  `);

  activateWindowListeners(windowEl, actor, activeContainer, { settings: userSettings, features, inventoryItems });
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

function updateBetterInvSettingsButtonState() {
  const open = Boolean(document.getElementById("betterinv-settings-window"));
  betterInvState.settingsOpen = open;
  const button = document.querySelector("#betterinv-window .betterinv-settings");
  button?.setAttribute("aria-expanded", String(open));
  button?.classList.toggle("is-active", open);
}

function closeBetterInvSettingsWindow() {
  document.getElementById("betterinv-settings-window")?.remove();
  updateBetterInvSettingsButtonState();
}

function betterInvSettingsGroupsHtml(userSettings) {
  return BETTER_INV_SETTINGS_GROUPS.map(group => `
    <section class="betterinv-settings-group">
      <h3><i class="fas ${escapeAttr(group.icon ?? "fa-sliders-h")}" aria-hidden="true"></i>${escapeHtml(group.title)}</h3>
      ${group.settings.map(([key, label, description, options = {}]) => {
        if (options.disabled) {
          return `
            <label class="betterinv-settings-row betterinv-settings-row-disabled" aria-disabled="true">
              <span>
                <strong>${escapeHtml(label)}${options.badge ? ` <em class="betterinv-settings-badge">${escapeHtml(options.badge)}</em>` : ""}</strong>
                <small>${escapeHtml(description)}</small>
              </span>
              <input type="checkbox" disabled aria-label="${escapeAttr(`${label} – ${options.badge ?? "deaktiviert"}`)}">
            </label>`;
        }
        return `
          <label class="betterinv-settings-row">
            <span>
              <strong>${escapeHtml(label)}</strong>
              <small>${escapeHtml(description)}</small>
            </span>
            <input type="checkbox" class="betterinv-setting-toggle" data-setting-key="${escapeAttr(key)}" ${userSettings[key] !== false ? "checked" : ""}>
          </label>`;
      }).join("")}
    </section>`).join("");
}

function openBetterInvSettingsWindow() {
  const existing = document.getElementById("betterinv-settings-window");
  if (existing) {
    existing.style.zIndex = "20020";
    updateBetterInvSettingsButtonState();
    return existing;
  }

  const userSettings = getBetterInvUserSettings();
  const settingsWindow = document.createElement("section");
  settingsWindow.id = "betterinv-settings-window";
  settingsWindow.className = "betterinv-settings-window";
  settingsWindow.innerHTML = `
    <header class="betterinv-settings-window-header">
      <div>
        <strong>Inventar-Einstellungen</strong>
        <small>Persönlich für deinen Foundry-Nutzer</small>
      </div>
      <button type="button" class="betterinv-settings-close" title="Einstellungen schließen" aria-label="Einstellungen schließen">×</button>
    </header>
    <div class="betterinv-settings-window-scroll">
      <section class="betterinv-settings-master">
        <label class="betterinv-settings-row betterinv-settings-master-row">
          <span>
            <strong>Axon’s Inventory aktiv</strong>
            <small>Deaktiviert die Inventaransicht für deinen Nutzer. Beim Öffnen erscheint dann nur der Button zum Wiederaktivieren.</small>
          </span>
          <input type="checkbox" class="betterinv-setting-toggle" data-setting-key="moduleEnabled" ${userSettings.moduleEnabled !== false ? "checked" : ""}>
        </label>
      </section>
      ${betterInvSettingsGroupsHtml(userSettings)}
    </div>
    <footer class="betterinv-settings-window-footer">
      <i class="fas fa-user-check" aria-hidden="true"></i>
      <span>Änderungen werden sofort gespeichert und direkt im Inventar sichtbar.</span>
    </footer>`;

  const inventoryWindow = document.getElementById("betterinv-window");
  const inventoryRect = inventoryWindow?.getBoundingClientRect?.();
  const width = 370;
  const gap = 12;
  let left = inventoryRect ? inventoryRect.right + gap : Math.max(20, window.innerWidth - width - 30);
  if (left + width > window.innerWidth - 10 && inventoryRect) left = Math.max(10, inventoryRect.left - width - gap);
  settingsWindow.style.left = `${Math.max(10, left)}px`;
  settingsWindow.style.top = `${Math.max(10, inventoryRect?.top ?? 90)}px`;
  document.body.appendChild(settingsWindow);

  settingsWindow.querySelector(".betterinv-settings-close")?.addEventListener("click", closeBetterInvSettingsWindow);
  settingsWindow.querySelectorAll(".betterinv-setting-toggle").forEach(input => {
    input.addEventListener("change", async event => {
      const checkbox = event.currentTarget;
      if (!(checkbox instanceof HTMLInputElement)) return;
      const key = String(checkbox.dataset.settingKey ?? "");
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_BETTER_INV_USER_SETTINGS, key) || key === "version") return;
      const previous = getBetterInvUserSettings()[key] !== false;
      checkbox.disabled = true;
      try {
        const savedSettings = await saveBetterInvUserSettings({ [key]: checkbox.checked });
        if ((key === "showSearch" && !checkbox.checked) || (!savedSettings.showItems && !savedSettings.showContainers)) {
          betterInvState.search = "";
        }
        if (key === "showContainers" && !checkbox.checked) betterInvState.containerId = null;
        if (key === "moduleEnabled" && !checkbox.checked) {
          closeBetterInvSettingsWindow();
        } else {
          checkbox.disabled = false;
        }
        if (document.getElementById("betterinv-window")) await renderBetterInvWindow({ preserveScroll: true });
      } catch (error) {
        console.error("Better Inventory | Persönliche Einstellung konnte nicht gespeichert werden", error);
        ui.notifications.error("Deine persönliche Einstellung konnte nicht gespeichert werden.");
        checkbox.checked = previous;
        checkbox.disabled = false;
      }
    });
  });

  makeBetterInvSettingsDraggable(settingsWindow);
  updateBetterInvSettingsButtonState();
  return settingsWindow;
}

function toggleBetterInvSettingsWindow() {
  if (document.getElementById("betterinv-settings-window")) closeBetterInvSettingsWindow();
  else openBetterInvSettingsWindow();
}

function baseShellHtml(bodyHtml) {
  const settingsOpen = Boolean(document.getElementById("betterinv-settings-window"));
  return `
    <header class="betterinv-header">
      <h2>Better Inventory<small>by <a class="betterinv-author-link" href="https://discord.com/users/622739422332321792" target="_blank" rel="noopener noreferrer" title="Axon auf Discord öffnen">Axon</a></small></h2>
      <div class="betterinv-header-actions">
        <button type="button" class="betterinv-scale-down" title="UI kleiner">−</button>
        <button type="button" class="betterinv-scale-up" title="UI größer">+</button>
        <button type="button" class="betterinv-settings${settingsOpen ? " is-active" : ""}" title="Inventar-Einstellungen in eigenem Fenster öffnen" aria-label="Inventar-Einstellungen öffnen" aria-expanded="${settingsOpen}"><i class="fas fa-cog" aria-hidden="true"></i></button>
        <button type="button" class="betterinv-popout" title="Als Browser-Popup öffnen">⧉</button>
        <button type="button" class="betterinv-close" title="Schließen">×</button>
      </div>
    </header>
    <div class="betterinv-body">${bodyHtml}</div>
    <div class="betterinv-resize-hint">↘</div>`;
}

function betterInvDisabledShellHtml() {
  return `
    <header class="betterinv-header betterinv-disabled-header">
      <h2>Axon’s Inventory</h2>
      <div class="betterinv-header-actions">
        <button type="button" class="betterinv-close" title="Schließen">×</button>
      </div>
    </header>
    <div class="betterinv-body betterinv-disabled-body">
      <i class="fas fa-power-off" aria-hidden="true"></i>
      <strong>Axon’s Inventory ist deaktiviert.</strong>
      <button type="button" class="betterinv-reactivate">Wieder aktivieren</button>
    </div>`;
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


function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatBetterInvNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  const rounded = Math.round(parsed * 100) / 100;
  return new Intl.NumberFormat(game.i18n?.lang ?? "de-DE", {
    maximumFractionDigits: 2
  }).format(rounded);
}

function getBetterInvWeightUnit() {
  try {
    if (game.system?.id === "dnd5e" && game.settings?.get?.("dnd5e", "metricWeightUnits")) return "kg";
  } catch (_) {
    // The setting is not available in every system/version.
  }
  return game.system?.id === "dnd5e" ? "lb" : "Gewicht";
}

function getBetterInvCurrencyConfig() {
  const systemId = String(game.system?.id ?? "");
  const systemKey = systemId.toUpperCase();
  const roots = [
    CONFIG?.[systemKey]?.currencies,
    CONFIG?.[systemKey]?.currency
  ];
  if (systemId === "dnd5e") roots.push(CONFIG?.DND5E?.currencies, CONFIG?.DND5E?.currency);
  return roots.find(root => root && typeof root === "object") ?? {};
}

function getBetterInvCurrencyLabel(denomination) {
  const code = String(denomination ?? "").trim();
  if (!code) return "";
  const config = getBetterInvCurrencyConfig();
  const entry = config?.[code] ?? config?.[code.toLowerCase()] ?? config?.[code.toUpperCase()];
  const raw = entry && typeof entry === "object"
    ? (entry.abbreviation ?? entry.abbr ?? entry.short ?? entry.label ?? code)
    : (typeof entry === "string" ? entry : code);
  const localized = game.i18n?.localize?.(raw) ?? raw;
  if (localized && localized !== raw) return localized;
  return String(raw).length <= 5 ? String(raw).toUpperCase() : String(raw);
}

function parseBetterInvNumericValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBetterInvPrice(raw, depth = 0) {
  if (raw === null || raw === undefined || depth > 3) return null;

  const directNumber = parseBetterInvNumericValue(raw);
  if (directNumber !== null) return { parts: [{ value: directNumber, denomination: "" }], text: null };

  if (typeof raw === "string") {
    const clean = sanitizePlainText(raw, { max: 80 });
    return clean ? { parts: [], text: clean } : null;
  }

  if (typeof raw !== "object") return null;

  const denomination = raw.denomination ?? raw.currency ?? raw.unit ?? raw.type ?? raw.denom ?? "";
  const amount = firstFiniteNumber(raw.value, raw.amount, raw.cost, raw.price, raw.base);
  if (amount !== null && typeof raw.value !== "object") {
    return { parts: [{ value: amount, denomination: String(denomination ?? "") }], text: null };
  }

  const nestedCandidates = [raw.value, raw.amount, raw.cost, raw.price, raw.total];
  for (const nested of nestedCandidates) {
    if (!nested || typeof nested !== "object") continue;
    const parsed = parseBetterInvPrice(nested, depth + 1);
    if (parsed) return parsed;
  }

  const currencyConfig = getBetterInvCurrencyConfig();
  const knownKeys = new Set([
    ...Object.keys(currencyConfig ?? {}).map(key => key.toLowerCase()),
    "pp", "gp", "ep", "sp", "cp", "platinum", "gold", "electrum", "silver", "copper"
  ]);
  const parts = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!knownKeys.has(String(key).toLowerCase())) continue;
    const numeric = parseBetterInvNumericValue(value);
    if (numeric === null) continue;
    parts.push({ value: numeric, denomination: key });
  }
  if (parts.length) return { parts, text: null };

  return null;
}

function getBetterInvItemPrice(item) {
  if (!item) return null;
  const candidates = [
    foundry.utils.getProperty(item, "system.price"),
    foundry.utils.getProperty(item, "system.cost")
  ];
  for (const candidate of candidates) {
    const parsed = parseBetterInvPrice(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function formatBetterInvPrice(price, multiplier = 1) {
  if (!price) return "";
  if (price.text) return price.text;
  const parts = Array.from(price.parts ?? []);
  if (!parts.length) return "";
  return parts.map(part => {
    const amount = formatBetterInvNumber((Number(part.value) || 0) * multiplier);
    const label = getBetterInvCurrencyLabel(part.denomination);
    return label ? `${amount} ${label}` : amount;
  }).join(" · ");
}

function betterInvItemPriceHtml(item, { unidentified = false, enabled = betterInvShowsItemValues() } = {}) {
  if (!enabled || unidentified) return "";
  const price = getBetterInvItemPrice(item);
  const unitValue = formatBetterInvPrice(price);
  if (!unitValue) return "";
  const quantity = getItemQuantityData(item).value;
  const totalValue = quantity > 1 && !price?.text ? formatBetterInvPrice(price, quantity) : "";
  const title = totalValue
    ? `Stückwert: ${unitValue} · Gesamtwert bei ${quantity} Stück: ${totalValue}`
    : `Itemwert: ${unitValue}`;
  return `
    <span class="betterinv-item-price" title="${escapeAttr(title)}">
      <i class="fas fa-coins" aria-hidden="true"></i>
      <span>${escapeHtml(unitValue)}</span>
    </span>`;
}

const BETTER_INV_CURRENCIES = [
  { key: "pp", aliases: ["pp", "platinum", "platin"], name: "Platin", abbreviation: "PP", copperValue: 1000 },
  { key: "gp", aliases: ["gp", "gold"], name: "Gold", abbreviation: "GP", copperValue: 100 },
  { key: "ep", aliases: ["ep", "electrum", "elektrum"], name: "Elektrum", abbreviation: "EP", copperValue: 50 },
  { key: "sp", aliases: ["sp", "silver", "silber"], name: "Silber", abbreviation: "SP", copperValue: 10 },
  { key: "cp", aliases: ["cp", "copper", "kupfer"], name: "Kupfer", abbreviation: "CP", copperValue: 1 }
];

// The practical D&D coin ladder deliberately converts gold directly to silver.
// Electrum remains independently exchangeable to silver, so the common
// conversion 1 GP -> 10 SP does not unexpectedly produce 2 EP.
const BETTER_INV_CURRENCY_DOWN_TARGETS = {
  pp: "gp",
  gp: "sp",
  ep: "sp",
  sp: "cp"
};

// Upward exchange mirrors the practical downward ladder. Silver goes directly
// to gold, while electrum can still be exchanged independently at 2 EP -> 1 GP.
const BETTER_INV_CURRENCY_UP_TARGETS = {
  gp: "pp",
  ep: "gp",
  sp: "gp",
  cp: "sp"
};

const BETTER_INV_CURRENCY_SOURCE_PATHS = [
  "system.currency",
  "system.currencies",
  "system.attributes.currency",
  "system.details.currency"
];

function getBetterInvActorCurrencySourceInfo(actor) {
  if (!actor) return null;
  const candidates = BETTER_INV_CURRENCY_SOURCE_PATHS.map(path => ({
    path,
    source: foundry.utils.getProperty(actor, path)
  })).filter(entry => entry.source && typeof entry.source === "object" && !Array.isArray(entry.source));

  const hasKnownCurrency = source => {
    const keys = new Set(Object.keys(source ?? {}).map(key => String(key).toLowerCase()));
    return BETTER_INV_CURRENCIES.some(currency => currency.aliases.some(alias => keys.has(alias)));
  };

  const detected = candidates.find(entry => hasKnownCurrency(entry.source));
  if (detected) return detected;

  // D&D5e always stores the five standard denominations under system.currency.
  // Keep the path even when a new actor has not populated every denomination yet.
  if (game.system?.id === "dnd5e") {
    return candidates.find(entry => entry.path === "system.currency") ?? {
      path: "system.currency",
      source: foundry.utils.getProperty(actor, "system.currency") ?? {}
    };
  }
  return null;
}

function getBetterInvActorCurrencySource(actor) {
  return getBetterInvActorCurrencySourceInfo(actor)?.source ?? null;
}

function getBetterInvCurrencyAmount(source, aliases) {
  if (!source || typeof source !== "object") return 0;
  const entries = new Map(Object.entries(source).map(([key, value]) => [String(key).toLowerCase(), value]));

  for (const alias of aliases) {
    if (!entries.has(alias)) continue;
    const raw = entries.get(alias);
    const value = raw && typeof raw === "object"
      ? firstFiniteNumber(raw.value, raw.amount, raw.quantity, raw.current, raw.total)
      : firstFiniteNumber(raw);
    if (value !== null) return Math.max(0, value);
  }
  return 0;
}

function getBetterInvActorCurrency(actor) {
  const source = getBetterInvActorCurrencySource(actor);
  if (!source) return null;
  return BETTER_INV_CURRENCIES.map(currency => ({
    ...currency,
    value: getBetterInvCurrencyAmount(source, currency.aliases)
  }));
}

function normalizeBetterInvCurrencyDraftValue(value, { allowBlank = true } = {}) {
  const clean = String(value ?? "").replace(/\D+/g, "").slice(0, 12);
  if (!clean) return allowBlank ? "" : "0";
  const normalized = clean.replace(/^0+(?=\d)/, "");
  return normalized || "0";
}

function getBetterInvCurrencyDraft(actor) {
  const actorId = actor?.id ?? null;
  if (betterInvState.currencyDraftActorId !== actorId) {
    betterInvState.currencyDraftActorId = actorId;
    betterInvState.currencyDraft = {};
  }
  const draft = betterInvState.currencyDraft && typeof betterInvState.currencyDraft === "object"
    ? betterInvState.currencyDraft
    : {};
  return Object.fromEntries(BETTER_INV_CURRENCIES.map(currency => [
    currency.key,
    normalizeBetterInvCurrencyDraftValue(draft[currency.key], { allowBlank: true })
  ]));
}

function betterInvActorCurrencyHtml(currencies, draft = {}, { editable = true, showCalculator = true } = {}) {
  if (!Array.isArray(currencies) || !currencies.length) return "";
  const totalCoins = currencies.reduce((sum, currency) => sum + (Number(currency.value) || 0), 0);
  const calculatorClass = showCalculator ? "" : " betterinv-currency-display-only";
  return `
    <section class="betterinv-currency${calculatorClass}" aria-label="Währungen" title="Münzbestand: ${escapeAttr(formatBetterInvNumber(totalCoins))} Münzen">
      <div class="betterinv-currency-heading ${showCalculator ? "betterinv-currency-heading-actions" : "betterinv-currency-heading-label"}">
        ${showCalculator ? `
          <button
            type="button"
            class="betterinv-currency-action betterinv-currency-exchange-up"
            title="Gewünschte Zielmünzen aus niedrigeren Münzarten bilden, zum Beispiel bei Silber 2: 20 CP werden zu 2 SP"
            ${editable ? "" : "disabled"}
          >
            <i class="fas fa-arrow-up" aria-hidden="true"></i>
            <span>Aufrunden</span>
          </button>
          <button
            type="button"
            class="betterinv-currency-action betterinv-currency-exchange-down"
            title="Eingegebene Münzen jeweils eine Stufe nach unten wechseln, zum Beispiel 2 SP in 20 CP"
            ${editable ? "" : "disabled"}
          >
            <i class="fas fa-arrow-down" aria-hidden="true"></i>
            <span>Abrunden</span>
          </button>` : `
          <i class="fas fa-coins" aria-hidden="true"></i>
          <span>Währungen</span>`}
      </div>
      <div class="betterinv-currency-main">
        <div class="betterinv-currency-list">
          ${currencies.map(currency => `
            <div class="betterinv-currency-entry betterinv-currency-${escapeAttr(currency.key)}" title="${escapeAttr(`${currency.name}: ${formatBetterInvNumber(currency.value)} ${currency.abbreviation}`)}">
              <span class="betterinv-currency-name">${escapeHtml(currency.name)}</span>
              <strong>${escapeHtml(formatBetterInvNumber(currency.value))}</strong>
              <small>${escapeHtml(currency.abbreviation)}</small>
              ${showCalculator ? `
                <input
                  type="text"
                  class="betterinv-currency-input"
                  data-currency-key="${escapeAttr(currency.key)}"
                  value="${escapeAttr(draft[currency.key] ?? "")}"
                  placeholder="0"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength="12"
                  autocomplete="off"
                  aria-label="${escapeAttr(`${currency.name} eingeben`)}"
                  title="${escapeAttr(`Änderungsbetrag in ${currency.name} eingeben`)}"
                  ${editable ? "" : "disabled"}
                >` : ""}
            </div>`).join("")}
        </div>
        ${showCalculator ? `
          <div class="betterinv-currency-actions-row">
            <button
              type="button"
              class="betterinv-currency-action betterinv-currency-add"
              title="Eingegebene Münzen exakt in der jeweiligen Währung hinzufügen"
              ${editable ? "" : "disabled"}
            >
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>Hinzufügen</span>
            </button>
            <button
              type="button"
              class="betterinv-currency-action betterinv-currency-remove"
              title="Eingegebenen Gesamtwert bezahlen; passende Münzen werden automatisch verrechnet und höhere Münzen bei Bedarf aufgebrochen"
              ${editable ? "" : "disabled"}
            >
              <i class="fas fa-minus" aria-hidden="true"></i>
              <span>Bezahlen / Entfernen</span>
            </button>
          </div>` : ""}
      </div>
    </section>`;
}

function getBetterInvCurrencyStorage(actor, currency) {
  const info = getBetterInvActorCurrencySourceInfo(actor);
  if (!info || !currency) return null;

  const entries = Object.entries(info.source ?? {});
  const matchingEntry = entries.find(([key]) => currency.aliases.includes(String(key).toLowerCase()));
  const sourceKey = matchingEntry?.[0] ?? currency.key;
  const raw = matchingEntry?.[1];

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const numericKey = ["value", "amount", "quantity", "current", "total"]
      .find(key => Object.prototype.hasOwnProperty.call(raw, key));
    if (numericKey) {
      return {
        updatePath: `${info.path}.${sourceKey}.${numericKey}`,
        current: Math.max(0, firstFiniteNumber(raw[numericKey]) ?? 0)
      };
    }
  }

  return {
    updatePath: `${info.path}.${sourceKey}`,
    current: Math.max(0, firstFiniteNumber(raw) ?? 0)
  };
}

function getBetterInvCurrencyActorKey(actor) {
  return String(actor?.uuid ?? actor?.id ?? "");
}

function isBetterInvCurrencyTransactionPending(actor) {
  const actorKey = getBetterInvCurrencyActorKey(actor);
  return Boolean(actorKey && betterInvCurrencyTransactions.has(actorKey));
}

function getBetterInvCurrencyWallet(actor) {
  if (!actor) throw new Error("Der Charakter konnte nicht gelesen werden.");

  const seenPaths = new Set();
  return BETTER_INV_CURRENCIES.map(currency => {
    const storage = getBetterInvCurrencyStorage(actor, currency);
    if (!storage?.updatePath) {
      throw new Error(`Kein Speicherpfad für ${currency.key} gefunden.`);
    }
    if (seenPaths.has(storage.updatePath)) {
      throw new Error("Mehrere Währungen würden denselben Actor-Pfad verändern.");
    }
    seenPaths.add(storage.updatePath);

    const value = Number(storage.current);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Der Münzbestand für ${currency.name} ist ungültig.`);
    }
    return { ...currency, storage, value };
  });
}

function cloneBetterInvCurrencyBalances(wallet) {
  return new Map(Array.from(wallet ?? []).map(currency => [
    currency.key,
    { ...currency, value: currency.value }
  ]));
}

function buildBetterInvCurrencyUpdateData(wallet, balances) {
  const updateData = {};
  const expectedValues = new Map();

  for (const currency of Array.from(wallet ?? [])) {
    const balance = balances?.get?.(currency.key);
    const next = Number(balance?.value);
    if (!Number.isSafeInteger(next) || next < 0) {
      throw new Error(`Der neue Betrag für ${currency.name} ist ungültig.`);
    }
    if (!currency.storage?.updatePath) {
      throw new Error(`Kein Speicherpfad für ${currency.key} gefunden.`);
    }
    expectedValues.set(currency.key, next);
    if (next !== currency.value) updateData[currency.storage.updatePath] = next;
  }

  return { updateData, expectedValues };
}

async function commitBetterInvCurrencyBalances(
  actor,
  wallet,
  balances,
  { actionName = "Geldänderung", expectedTotalCopper = null } = {}
) {
  if (!actor || actor.isOwner === false) {
    ui.notifications.warn("Du darfst die Währungen dieses Charakters nicht ändern.");
    return false;
  }

  const actorKey = getBetterInvCurrencyActorKey(actor);
  if (!actorKey) throw new Error("Der Charakter besitzt keine eindeutige ID.");
  if (betterInvCurrencyTransactions.has(actorKey)) {
    ui.notifications.warn("Eine Geldänderung für diesen Charakter läuft bereits.");
    return false;
  }

  betterInvCurrencyTransactions.add(actorKey);
  const previousDraft = { ...(betterInvState.currencyDraft ?? {}) };
  const previousDraftActorId = betterInvState.currencyDraftActorId;
  let draftCleared = false;
  let updateMayHaveSucceeded = false;

  try {
    // Reject stale calculations before writing. This avoids overwriting a purse
    // that was changed by another hook, window or client after it was read.
    const freshWallet = getBetterInvCurrencyWallet(actor);
    for (const original of Array.from(wallet ?? [])) {
      const fresh = freshWallet.find(currency => currency.key === original.key);
      if (!fresh || fresh.storage.updatePath !== original.storage?.updatePath || fresh.value !== original.value) {
        const error = new Error(
          `${actionName} abgebrochen: Der Münzbestand wurde zwischenzeitlich geändert. Bitte erneut ausführen.`
        );
        error.betterInvUserMessage = `${error.message} Keine Münzen wurden verändert.`;
        throw error;
      }
    }

    const { updateData, expectedValues } = buildBetterInvCurrencyUpdateData(wallet, balances);
    const finalTotalCopper = getBetterInvCurrencyTotalInCopper([...balances.values()], "value");
    if (expectedTotalCopper !== null) {
      const expected = Number(expectedTotalCopper);
      if (!Number.isSafeInteger(expected) || expected < 0 || finalTotalCopper !== expected) {
        throw new Error(`${actionName} war nicht wertgleich und wurde abgebrochen.`);
      }
    }

    if (!Object.keys(updateData).length) {
      ui.notifications.info("Keine Münzänderung notwendig.");
      return false;
    }

    // Clear before the Actor update so updateActor-triggered re-renders cannot
    // display stale inputs. On a rejected update the original draft is restored.
    betterInvState.currencyDraft = {};
    betterInvState.currencyDraftActorId = actor.id;
    draftCleared = true;

    // Every affected denomination is sent in this single Actor update. Foundry
    // therefore stores the complete money action as one document change.
    await actor.update(updateData);
    updateMayHaveSucceeded = true;

    // Verify the local Actor document after Foundry resolved the update. A
    // mismatch is reported without automatically retrying or overwriting data.
    const verifiedWallet = getBetterInvCurrencyWallet(actor);
    const mismatch = verifiedWallet.find(currency => expectedValues.get(currency.key) !== currency.value);
    if (mismatch) {
      const error = new Error(
        `${actionName} wurde gesendet, aber der gespeicherte Münzbestand konnte nicht eindeutig bestätigt werden. ` +
        "Bitte den Charakterbogen prüfen, bevor du die Aktion wiederholst."
      );
      error.betterInvUserMessage = error.message;
      error.betterInvUpdateMayHaveSucceeded = true;
      throw error;
    }

    return true;
  } catch (error) {
    const mayHaveSucceeded = updateMayHaveSucceeded || error?.betterInvUpdateMayHaveSucceeded;
    if (draftCleared && !mayHaveSucceeded && betterInvState.currencyDraftActorId === actor.id) {
      betterInvState.currencyDraft = previousDraft;
      betterInvState.currencyDraftActorId = previousDraftActorId;
    }
    if (mayHaveSucceeded && !error?.betterInvUserMessage) {
      error.betterInvUserMessage =
        `${actionName} wurde gesendet, aber das Ergebnis konnte nicht sicher bestätigt werden. ` +
        "Bitte den Charakterbogen prüfen, bevor du die Aktion wiederholst.";
      error.betterInvUpdateMayHaveSucceeded = true;
    }
    throw error;
  } finally {
    betterInvCurrencyTransactions.delete(actorKey);
  }
}

function getBetterInvCurrencyAdditionDraft() {
  const draft = betterInvState.currencyDraft && typeof betterInvState.currencyDraft === "object"
    ? betterInvState.currencyDraft
    : {};
  return BETTER_INV_CURRENCIES.map(currency => {
    const normalized = normalizeBetterInvCurrencyDraftValue(draft[currency.key], { allowBlank: true });
    const amount = normalized ? Number(normalized) : 0;
    return { ...currency, amount: Number.isSafeInteger(amount) && amount > 0 ? amount : 0 };
  }).filter(currency => currency.amount > 0);
}

function getBetterInvCurrencyTotalInCopper(currencies, amountProperty = "value") {
  let total = 0;
  for (const currency of Array.from(currencies ?? [])) {
    const rawAmount = Number(currency?.[amountProperty] ?? 0);
    const amount = Number.isFinite(rawAmount) ? Math.max(0, Math.trunc(rawAmount)) : 0;
    const copperValue = Number(currency?.copperValue ?? 0);
    const part = amount * copperValue;
    if (!Number.isSafeInteger(part) || !Number.isSafeInteger(total + part)) {
      throw new Error("Der berechnete Gesamtwert der Münzen ist zu groß.");
    }
    total += part;
  }
  return total;
}

function formatBetterInvCopperTotal(totalCopper) {
  let remaining = Math.max(0, Math.trunc(Number(totalCopper) || 0));
  if (!remaining) return "0 CP";

  const parts = [];
  for (const currency of BETTER_INV_CURRENCIES) {
    const copperValue = Number(currency.copperValue) || 1;
    const amount = Math.floor(remaining / copperValue);
    if (!amount) continue;
    parts.push(`${formatBetterInvNumber(amount)} ${currency.abbreviation}`);
    remaining -= amount * copperValue;
  }
  return parts.join(" · ");
}

function notifyBetterInvCurrencyError(message) {
  const cleanMessage = String(message ?? "Die Geldaktion ist nicht möglich.").trim();
  const suffix = /keine münzen (?:wurden|werden) verändert/i.test(cleanMessage)
    ? ""
    : " Keine Münzen wurden verändert.";
  ui.notifications.error(`${cleanMessage}${suffix}`);
}

function notifyBetterInvCurrencyValueShortage(action, requiredCopper, availableCopper, detail = "") {
  const required = Math.max(0, Math.trunc(Number(requiredCopper) || 0));
  const available = Math.max(0, Math.trunc(Number(availableCopper) || 0));
  const missing = Math.max(0, required - available);
  const prefix = detail ? `${detail} ` : "";
  notifyBetterInvCurrencyError(
    `${action} nicht möglich: ${prefix}` +
    `Benötigt: ${formatBetterInvCopperTotal(required)} · ` +
    `vorhanden: ${formatBetterInvCopperTotal(available)} · ` +
    `es fehlen: ${formatBetterInvCopperTotal(missing)}.`
  );
}

function notifyBetterInvCurrencyAmountShortage(action, currency, requiredAmount, availableAmount) {
  const required = Math.max(0, Math.trunc(Number(requiredAmount) || 0));
  const available = Math.max(0, Math.trunc(Number(availableAmount) || 0));
  const missing = Math.max(0, required - available);
  notifyBetterInvCurrencyError(
    `${action} nicht möglich: ` +
    `${formatBetterInvNumber(required)} ${currency.abbreviation} benötigt · ` +
    `${formatBetterInvNumber(available)} ${currency.abbreviation} vorhanden · ` +
    `${formatBetterInvNumber(missing)} ${currency.abbreviation} fehlen.`
  );
}

async function addBetterInvCurrency(actor) {
  if (!actor || actor.isOwner === false) {
    ui.notifications.warn("Du darfst die Währungen dieses Charakters nicht ändern.");
    return false;
  }
  if (isBetterInvCurrencyTransactionPending(actor)) {
    ui.notifications.warn("Eine Geldänderung für diesen Charakter läuft bereits.");
    return false;
  }

  const additions = getBetterInvCurrencyAdditionDraft();
  if (!additions.length) {
    ui.notifications.warn("Gib mindestens bei einer Währung einen Betrag größer als 0 ein.");
    return false;
  }

  const wallet = getBetterInvCurrencyWallet(actor);
  const balances = cloneBetterInvCurrencyBalances(wallet);
  for (const addition of additions) {
    const balance = balances.get(addition.key);
    if (!balance) throw new Error(`Kein Münzspeicher für ${addition.key} gefunden.`);
    const next = balance.value + addition.amount;
    if (!Number.isSafeInteger(next)) {
      throw new Error(`Der neue Betrag für ${addition.name} ist zu groß.`);
    }
    balance.value = next;
  }

  const initialCopper = getBetterInvCurrencyTotalInCopper(wallet, "value");
  const addedCopper = getBetterInvCurrencyTotalInCopper(additions, "amount");
  if (!Number.isSafeInteger(initialCopper + addedCopper)) {
    throw new Error("Der neue Gesamtwert der Münzen ist zu groß.");
  }

  const committed = await commitBetterInvCurrencyBalances(actor, wallet, balances, {
    actionName: "Münzen hinzufügen",
    expectedTotalCopper: initialCopper + addedCopper
  });
  if (!committed) return false;

  const summary = additions.map(currency => `${formatBetterInvNumber(currency.amount)} ${currency.abbreviation}`).join(" · ");
  ui.notifications.info(`Hinzugefügt: ${summary}`);
  return true;
}

function addBetterInvCurrencyChange(balances, totalCopper) {
  let remaining = Math.max(0, Math.trunc(Number(totalCopper) || 0));
  if (!Number.isSafeInteger(remaining)) {
    throw new Error("Das berechnete Rückgeld ist zu groß.");
  }

  const change = [];
  for (const currency of BETTER_INV_CURRENCIES) {
    if (remaining < currency.copperValue) continue;
    const amount = Math.floor(remaining / currency.copperValue);
    if (!amount) continue;

    const balance = balances.get(currency.key);
    if (!balance) {
      throw new Error(`Kein Münzspeicher für ${currency.key} gefunden.`);
    }
    const next = balance.value + amount;
    if (!Number.isSafeInteger(next)) {
      throw new Error(`Das berechnete Rückgeld für ${currency.key} ist zu groß.`);
    }

    balance.value = next;
    remaining -= amount * currency.copperValue;
    change.push({ ...currency, amount });
  }

  if (remaining !== 0) {
    throw new Error("Das Rückgeld konnte nicht vollständig aufgeteilt werden.");
  }
  return change;
}

function calculateBetterInvCurrencyPayment(wallet, requestedCopper) {
  const requested = Math.max(0, Math.trunc(Number(requestedCopper) || 0));
  if (!Number.isSafeInteger(requested) || requested <= 0) {
    throw new Error("Der zu zahlende Münzwert ist ungültig.");
  }

  const balances = new Map();
  for (const currency of Array.from(wallet ?? [])) {
    const value = Math.max(0, Math.trunc(Number(currency?.value) || 0));
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Der Münzbestand für ${currency?.key ?? "eine Währung"} ist zu groß.`);
    }
    balances.set(currency.key, { ...currency, value });
  }

  let remaining = requested;
  const spent = [];

  // First pay with existing coins without exceeding the requested value. The
  // entered denominations describe the price; the purse may settle that value
  // with any equivalent combination of coins.
  for (const currency of BETTER_INV_CURRENCIES) {
    const balance = balances.get(currency.key);
    if (!balance?.value || remaining < currency.copperValue) continue;
    const amount = Math.min(balance.value, Math.floor(remaining / currency.copperValue));
    if (!amount) continue;
    balance.value -= amount;
    remaining -= amount * currency.copperValue;
    spent.push({ ...currency, amount });
  }

  let breakage = null;
  if (remaining > 0) {
    // No exact combination was available. Break the smallest remaining coin
    // which is worth more than the outstanding amount. The difference is then
    // returned greedily from the highest possible denomination down to copper.
    const sourceCurrency = [...BETTER_INV_CURRENCIES]
      .reverse()
      .find(currency => currency.copperValue > remaining && (balances.get(currency.key)?.value ?? 0) > 0);

    if (!sourceCurrency) {
      throw new Error("Der Münzwert reicht aus, konnte aber nicht sicher verrechnet werden.");
    }

    const sourceBalance = balances.get(sourceCurrency.key);
    sourceBalance.value -= 1;
    const changeCopper = sourceCurrency.copperValue - remaining;
    const change = addBetterInvCurrencyChange(balances, changeCopper);
    breakage = {
      source: sourceCurrency,
      sourceAmount: 1,
      paidCopper: remaining,
      changeCopper,
      change
    };
    remaining = 0;
  }

  const finalCopper = getBetterInvCurrencyTotalInCopper([...balances.values()], "value");
  const initialCopper = getBetterInvCurrencyTotalInCopper(wallet, "value");
  if (finalCopper !== initialCopper - requested) {
    throw new Error("Die Münzberechnung war nicht wertgleich und wurde abgebrochen.");
  }

  return { balances, spent, breakage };
}

function calculateBetterInvCurrencyDownExchange(wallet, exchanges) {
  const balances = new Map();
  for (const currency of Array.from(wallet ?? [])) {
    const value = Math.max(0, Math.trunc(Number(currency?.value) || 0));
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Der Münzbestand für ${currency?.key ?? "eine Währung"} ist zu groß.`);
    }
    balances.set(currency.key, { ...currency, value });
  }

  // Build and validate every conversion against the original purse before any
  // balance is changed. Coins created by one entry therefore cannot be reused
  // as the source of a second entry during the same click.
  const conversions = [];
  for (const exchange of Array.from(exchanges ?? [])) {
    const amount = Math.max(0, Math.trunc(Number(exchange?.amount) || 0));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Der Wechselbetrag ist ungültig.");
    }

    const source = BETTER_INV_CURRENCIES.find(currency => currency.key === exchange.key);
    const targetKey = source ? BETTER_INV_CURRENCY_DOWN_TARGETS[source.key] : null;
    const target = BETTER_INV_CURRENCIES.find(currency => currency.key === targetKey);
    if (!source || !target) {
      throw new Error(`${source?.name ?? "Diese Währung"} kann nicht weiter nach unten gewechselt werden.`);
    }

    const sourceBalance = balances.get(source.key);
    const targetBalance = balances.get(target.key);
    if (!sourceBalance || !targetBalance) {
      throw new Error("Der Münzbestand konnte nicht vollständig gelesen werden.");
    }
    if (sourceBalance.value < amount) {
      throw new Error(
        `Nicht genug ${source.name}. Benötigt: ${formatBetterInvNumber(amount)} ${source.abbreviation} · ` +
        `Vorhanden: ${formatBetterInvNumber(sourceBalance.value)} ${source.abbreviation}`
      );
    }

    const rate = source.copperValue / target.copperValue;
    const receivedAmount = amount * rate;
    if (!Number.isSafeInteger(rate) || rate <= 1 || !Number.isSafeInteger(receivedAmount)) {
      throw new Error(`Für ${source.name} wurde kein gültiger Wechselkurs gefunden.`);
    }
    conversions.push({ source, target, amount, receivedAmount, rate });
  }

  for (const conversion of conversions) {
    const sourceBalance = balances.get(conversion.source.key);
    const targetBalance = balances.get(conversion.target.key);
    sourceBalance.value -= conversion.amount;
    const nextTarget = targetBalance.value + conversion.receivedAmount;
    if (!Number.isSafeInteger(nextTarget)) {
      throw new Error(`Der neue Betrag für ${conversion.target.name} ist zu groß.`);
    }
    targetBalance.value = nextTarget;
  }

  const initialCopper = getBetterInvCurrencyTotalInCopper(wallet, "value");
  const finalCopper = getBetterInvCurrencyTotalInCopper([...balances.values()], "value");
  if (finalCopper !== initialCopper) {
    throw new Error("Der Münzwechsel war nicht wertgleich und wurde abgebrochen.");
  }

  return { balances, conversions };
}

async function exchangeBetterInvCurrencyDown(actor) {
  if (!actor || actor.isOwner === false) {
    ui.notifications.warn("Du darfst die Währungen dieses Charakters nicht ändern.");
    return false;
  }
  if (isBetterInvCurrencyTransactionPending(actor)) {
    ui.notifications.warn("Eine Geldänderung für diesen Charakter läuft bereits.");
    return false;
  }

  const exchanges = getBetterInvCurrencyAdditionDraft();
  if (!exchanges.length) {
    ui.notifications.warn("Gib bei der Münzart, die du wechseln möchtest, einen Betrag größer als 0 ein.");
    return false;
  }

  const unsupported = exchanges.find(exchange => !BETTER_INV_CURRENCY_DOWN_TARGETS[exchange.key]);
  if (unsupported) {
    ui.notifications.warn(`${unsupported.name} kann nicht weiter nach unten gewechselt werden.`);
    return false;
  }

  const wallet = getBetterInvCurrencyWallet(actor);

  // Validate every requested source against the original purse. This keeps a
  // multi-denomination exchange predictable: newly created lower coins are not
  // silently reused by another entry in the same click.
  for (const exchange of exchanges) {
    const current = wallet.find(currency => currency.key === exchange.key)?.value ?? 0;
    if (!Number.isSafeInteger(current) || current < exchange.amount) {
      notifyBetterInvCurrencyAmountShortage(
        "Abrunden",
        exchange,
        exchange.amount,
        Math.max(0, Number(current) || 0)
      );
      return false;
    }
  }

  const result = calculateBetterInvCurrencyDownExchange(wallet, exchanges);
  const initialCopper = getBetterInvCurrencyTotalInCopper(wallet, "value");
  const committed = await commitBetterInvCurrencyBalances(actor, wallet, result.balances, {
    actionName: "Münzen abrunden",
    expectedTotalCopper: initialCopper
  });
  if (!committed) return false;

  const summary = result.conversions.map(conversion =>
    `${formatBetterInvNumber(conversion.amount)} ${conversion.source.abbreviation} → ` +
    `${formatBetterInvNumber(conversion.receivedAmount)} ${conversion.target.abbreviation}`
  ).join(" · ");
  ui.notifications.info(`Abgerundet: ${summary}`);
  return true;
}

/*
 * LEGACY UPWARD EXCHANGE MODE (source-based) — intentionally kept for the
 * future per-user setting requested for Phase 5.
 *
 * In this older mode the entered number describes the SOURCE coins:
 * 20 CP entered -> 2 SP received.
 *
 * The implementation remains here, commented out, so it can later be exposed
 * as an alternative without rebuilding the original behaviour from scratch.
 *
function calculateBetterInvCurrencyUpExchange(wallet, exchanges) {
  const balances = new Map();
  for (const currency of Array.from(wallet ?? [])) {
    const value = Math.max(0, Math.trunc(Number(currency?.value) || 0));
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Der Münzbestand für ${currency?.key ?? "eine Währung"} ist zu groß.`);
    }
    balances.set(currency.key, { ...currency, value });
  }

  // Every requested source is validated against the original purse. Coins made
  // by one conversion are not silently consumed by another conversion during
  // the same click, which keeps multi-denomination exchanges predictable.
  const conversions = [];
  for (const exchange of Array.from(exchanges ?? [])) {
    const amount = Math.max(0, Math.trunc(Number(exchange?.amount) || 0));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Der Wechselbetrag ist ungültig.");
    }

    const source = BETTER_INV_CURRENCIES.find(currency => currency.key === exchange.key);
    const targetKey = source ? BETTER_INV_CURRENCY_UP_TARGETS[source.key] : null;
    const target = BETTER_INV_CURRENCIES.find(currency => currency.key === targetKey);
    if (!source || !target) {
      throw new Error(`${source?.name ?? "Diese Währung"} kann nicht weiter nach oben gewechselt werden.`);
    }

    const sourceBalance = balances.get(source.key);
    const targetBalance = balances.get(target.key);
    if (!sourceBalance || !targetBalance) {
      throw new Error("Der Münzbestand konnte nicht vollständig gelesen werden.");
    }
    if (sourceBalance.value < amount) {
      throw new Error(
        `Nicht genug ${source.name}. Benötigt: ${formatBetterInvNumber(amount)} ${source.abbreviation} · ` +
        `Vorhanden: ${formatBetterInvNumber(sourceBalance.value)} ${source.abbreviation}`
      );
    }

    const rate = target.copperValue / source.copperValue;
    if (!Number.isSafeInteger(rate) || rate <= 1) {
      throw new Error(`Für ${source.name} wurde kein gültiger Wechselkurs gefunden.`);
    }
    if (amount % rate !== 0) {
      throw new Error(
        `${source.name} kann nur in Gruppen von ${formatBetterInvNumber(rate)} ${source.abbreviation} ` +
        `nach oben gewechselt werden.`
      );
    }

    const receivedAmount = amount / rate;
    if (!Number.isSafeInteger(receivedAmount) || receivedAmount <= 0) {
      throw new Error(`Der Wechselbetrag für ${target.name} ist ungültig.`);
    }
    conversions.push({ source, target, amount, receivedAmount, rate });
  }

  for (const conversion of conversions) {
    const sourceBalance = balances.get(conversion.source.key);
    const targetBalance = balances.get(conversion.target.key);
    sourceBalance.value -= conversion.amount;
    const nextTarget = targetBalance.value + conversion.receivedAmount;
    if (!Number.isSafeInteger(nextTarget)) {
      throw new Error(`Der neue Betrag für ${conversion.target.name} ist zu groß.`);
    }
    targetBalance.value = nextTarget;
  }

  const initialCopper = getBetterInvCurrencyTotalInCopper(wallet, "value");
  const finalCopper = getBetterInvCurrencyTotalInCopper([...balances.values()], "value");
  if (finalCopper !== initialCopper) {
    throw new Error("Der Münzwechsel war nicht wertgleich und wurde abgebrochen.");
  }

  return { balances, conversions };
}

async function exchangeBetterInvCurrencyUp(actor) {
  if (!actor || actor.isOwner === false) {
    ui.notifications.warn("Du darfst die Währungen dieses Charakters nicht ändern.");
    return false;
  }

  const exchanges = getBetterInvCurrencyAdditionDraft();
  if (!exchanges.length) {
    ui.notifications.warn("Gib bei der Münzart, die du wechseln möchtest, einen Betrag größer als 0 ein.");
    return false;
  }

  const unsupported = exchanges.find(exchange => !BETTER_INV_CURRENCY_UP_TARGETS[exchange.key]);
  if (unsupported) {
    ui.notifications.warn(`${unsupported.name} kann nicht weiter nach oben gewechselt werden.`);
    return false;
  }

  const wallet = BETTER_INV_CURRENCIES.map(currency => {
    const storage = getBetterInvCurrencyStorage(actor, currency);
    if (!storage?.updatePath) {
      throw new Error(`Kein Speicherpfad für ${currency.key} gefunden.`);
    }
    return { ...currency, storage, value: storage.current };
  });

  for (const exchange of exchanges) {
    const source = BETTER_INV_CURRENCIES.find(currency => currency.key === exchange.key);
    const target = BETTER_INV_CURRENCIES.find(currency => currency.key === BETTER_INV_CURRENCY_UP_TARGETS[exchange.key]);
    const current = wallet.find(currency => currency.key === exchange.key)?.value ?? 0;
    if (!Number.isSafeInteger(current) || current < exchange.amount) {
      ui.notifications.warn(
        `Nicht genug ${exchange.name}. Benötigt: ${formatBetterInvNumber(exchange.amount)} ${exchange.abbreviation} · ` +
        `Vorhanden: ${formatBetterInvNumber(Math.max(0, Number(current) || 0))} ${exchange.abbreviation}`
      );
      return false;
    }

    const rate = target?.copperValue / source?.copperValue;
    if (!Number.isSafeInteger(rate) || rate <= 1 || exchange.amount % rate !== 0) {
      ui.notifications.warn(
        `${exchange.name} kann nur in Gruppen von ${formatBetterInvNumber(rate || 0)} ${exchange.abbreviation} ` +
        `nach ${target?.name ?? "oben"} gewechselt werden.`
      );
      return false;
    }
  }

  const result = calculateBetterInvCurrencyUpExchange(wallet, exchanges);
  const updateData = {};
  for (const currency of wallet) {
    const next = result.balances.get(currency.key)?.value;
    if (!Number.isSafeInteger(next) || next < 0) {
      throw new Error(`Der neue Betrag für ${currency.key} ist ungültig.`);
    }
    if (next !== currency.value) updateData[currency.storage.updatePath] = next;
  }

  const previousDraft = { ...(betterInvState.currencyDraft ?? {}) };
  betterInvState.currencyDraft = {};
  betterInvState.currencyDraftActorId = actor.id;
  try {
    // Source and target denominations are committed together so an update can
    // never leave only half of an exchange in the actor data.
    await actor.update(updateData);
  } catch (error) {
    betterInvState.currencyDraft = previousDraft;
    throw error;
  }

  const summary = result.conversions.map(conversion =>
    `${formatBetterInvNumber(conversion.amount)} ${conversion.source.abbreviation} → ` +
    `${formatBetterInvNumber(conversion.receivedAmount)} ${conversion.target.abbreviation}`
  ).join(" · ");
  ui.notifications.info(`Gewechselt: ${summary}`);
  return true;
}
*/

function calculateBetterInvCurrencyUpExchange(wallet, requests) {
  const balances = new Map();
  for (const currency of Array.from(wallet ?? [])) {
    const value = Math.max(0, Math.trunc(Number(currency?.value) || 0));
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Der Münzbestand für ${currency?.key ?? "eine Währung"} ist zu groß.`);
    }
    balances.set(currency.key, { ...currency, value });
  }

  const normalizedRequests = Array.from(requests ?? []).map(request => {
    const amount = Math.max(0, Math.trunc(Number(request?.amount) || 0));
    const target = BETTER_INV_CURRENCIES.find(currency => currency.key === request?.key);
    if (!target || !Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Der gewünschte Aufrundungsbetrag ist ungültig.");
    }
    if (target.key === "cp") {
      throw new Error("Kupfer kann nicht aus einer niedrigeren Münzart aufgerundet werden.");
    }
    return { ...request, amount, target };
  }).sort((a, b) => b.target.copperValue - a.target.copperValue);

  const conversions = [];

  // Requests are handled from the highest target denomination downwards.
  // For every target we consume the closest lower denomination first, then
  // continue down the ladder. Example: 2 GP use EP first, then SP, then CP.
  for (const request of normalizedRequests) {
    const target = request.target;
    const targetIndex = BETTER_INV_CURRENCIES.findIndex(currency => currency.key === target.key);
    const lowerCurrencies = BETTER_INV_CURRENCIES.slice(targetIndex + 1);
    const requiredCopper = request.amount * target.copperValue;
    if (!Number.isSafeInteger(requiredCopper) || requiredCopper <= 0) {
      throw new Error(`Der Gegenwert für ${target.name} ist zu groß.`);
    }

    const availableLowerCopper = lowerCurrencies.reduce((sum, source) => {
      const balance = balances.get(source.key)?.value ?? 0;
      const part = balance * source.copperValue;
      if (!Number.isSafeInteger(part) || !Number.isSafeInteger(sum + part)) {
        throw new Error("Der verfügbare Gegenwert der niedrigeren Münzen ist zu groß.");
      }
      return sum + part;
    }, 0);

    if (availableLowerCopper < requiredCopper) {
      const error = new Error("INSUFFICIENT_LOWER_CURRENCY");
      error.betterInvCurrencyShortage = {
        action: "Aufrunden",
        requiredCopper,
        availableCopper: availableLowerCopper,
        detail: `Für ${formatBetterInvNumber(request.amount)} ${target.abbreviation} reicht der Gegenwert der niedrigeren Münzen nicht.`
      };
      throw error;
    }

    let remainingCopper = requiredCopper;
    const sources = [];
    for (const source of lowerCurrencies) {
      if (remainingCopper <= 0) break;
      const sourceBalance = balances.get(source.key);
      if (!sourceBalance) {
        throw new Error("Der Münzbestand konnte nicht vollständig gelesen werden.");
      }

      const usableCoins = Math.min(
        sourceBalance.value,
        Math.floor(remainingCopper / source.copperValue)
      );
      if (usableCoins <= 0) continue;

      sourceBalance.value -= usableCoins;
      remainingCopper -= usableCoins * source.copperValue;
      sources.push({ source, amount: usableCoins });
    }

    if (remainingCopper !== 0) {
      throw new Error(
        `Der Gegenwert für ${formatBetterInvNumber(request.amount)} ${target.abbreviation} ` +
        `konnte aus den vorhandenen niedrigeren Münzen nicht exakt gebildet werden.`
      );
    }

    const targetBalance = balances.get(target.key);
    if (!targetBalance) {
      throw new Error("Der Ziel-Münzbestand konnte nicht gelesen werden.");
    }
    const nextTarget = targetBalance.value + request.amount;
    if (!Number.isSafeInteger(nextTarget)) {
      throw new Error(`Der neue Betrag für ${target.name} ist zu groß.`);
    }
    targetBalance.value = nextTarget;
    conversions.push({ target, receivedAmount: request.amount, sources, requiredCopper });
  }

  const initialCopper = getBetterInvCurrencyTotalInCopper(wallet, "value");
  const finalCopper = getBetterInvCurrencyTotalInCopper([...balances.values()], "value");
  if (finalCopper !== initialCopper) {
    throw new Error("Der Münzwechsel war nicht wertgleich und wurde abgebrochen.");
  }

  return { balances, conversions };
}

async function exchangeBetterInvCurrencyUp(actor) {
  if (!actor || actor.isOwner === false) {
    ui.notifications.warn("Du darfst die Währungen dieses Charakters nicht ändern.");
    return false;
  }
  if (isBetterInvCurrencyTransactionPending(actor)) {
    ui.notifications.warn("Eine Geldänderung für diesen Charakter läuft bereits.");
    return false;
  }

  const requests = getBetterInvCurrencyAdditionDraft();
  if (!requests.length) {
    ui.notifications.warn("Gib bei der Zielwährung ein, wie viele Münzen du erhalten möchtest.");
    return false;
  }

  const copperRequest = requests.find(request => request.key === "cp");
  if (copperRequest) {
    ui.notifications.warn("Kupfer kann nicht aus einer niedrigeren Münzart aufgerundet werden.");
    return false;
  }

  const wallet = getBetterInvCurrencyWallet(actor);

  let result;
  try {
    result = calculateBetterInvCurrencyUpExchange(wallet, requests);
  } catch (error) {
    const shortage = error?.betterInvCurrencyShortage;
    if (shortage) {
      notifyBetterInvCurrencyValueShortage(
        shortage.action,
        shortage.requiredCopper,
        shortage.availableCopper,
        shortage.detail
      );
    } else {
      notifyBetterInvCurrencyError(error?.message || "Die gewünschte Aufrundung ist nicht möglich.");
    }
    return false;
  }

  const initialCopper = getBetterInvCurrencyTotalInCopper(wallet, "value");
  const committed = await commitBetterInvCurrencyBalances(actor, wallet, result.balances, {
    actionName: "Münzen aufrunden",
    expectedTotalCopper: initialCopper
  });
  if (!committed) return false;

  const summary = result.conversions.map(conversion => {
    const paid = conversion.sources
      .map(source => `${formatBetterInvNumber(source.amount)} ${source.source.abbreviation}`)
      .join(" + ");
    return `${paid} → ${formatBetterInvNumber(conversion.receivedAmount)} ${conversion.target.abbreviation}`;
  }).join(" · ");
  ui.notifications.info(`Aufgerundet: ${summary}`);
  return true;
}

async function removeBetterInvCurrency(actor) {
  if (!actor || actor.isOwner === false) {
    ui.notifications.warn("Du darfst die Währungen dieses Charakters nicht ändern.");
    return false;
  }
  if (isBetterInvCurrencyTransactionPending(actor)) {
    ui.notifications.warn("Eine Geldänderung für diesen Charakter läuft bereits.");
    return false;
  }

  const removals = getBetterInvCurrencyAdditionDraft();
  if (!removals.length) {
    ui.notifications.warn("Gib mindestens bei einer Währung einen Betrag größer als 0 ein.");
    return false;
  }

  const wallet = getBetterInvCurrencyWallet(actor);
  const availableCopper = getBetterInvCurrencyTotalInCopper(wallet, "value");
  const requestedCopper = getBetterInvCurrencyTotalInCopper(removals, "amount");
  if (availableCopper < requestedCopper) {
    notifyBetterInvCurrencyValueShortage("Bezahlen / Entfernen", requestedCopper, availableCopper);
    return false;
  }

  // The entered price is settled by total value. Existing lower coins can pay a
  // higher denomination, while larger coins are broken and their change is
  // returned in the highest possible denominations.
  let payment;
  try {
    payment = calculateBetterInvCurrencyPayment(wallet, requestedCopper);
  } catch (error) {
    notifyBetterInvCurrencyError(error?.message || "Die Zahlung konnte nicht sicher verrechnet werden.");
    return false;
  }

  const committed = await commitBetterInvCurrencyBalances(actor, wallet, payment.balances, {
    actionName: "Bezahlen / Entfernen",
    expectedTotalCopper: availableCopper - requestedCopper
  });
  if (!committed) return false;

  const summary = removals.map(currency => `${formatBetterInvNumber(currency.amount)} ${currency.abbreviation}`).join(" · ");
  if (payment.breakage) {
    const source = payment.breakage.source;
    const change = payment.breakage.change
      .map(currency => `${formatBetterInvNumber(currency.amount)} ${currency.abbreviation}`)
      .join(" · ");
    ui.notifications.info(
      `Bezahlt / entfernt: ${summary} · ${source.abbreviation} automatisch aufgebrochen` +
      (change ? ` · Rückgeld: ${change}` : "")
    );
  } else {
    ui.notifications.info(`Bezahlt / entfernt: ${summary}`);
  }
  return true;
}

function getBetterInvItemWeight(item) {
  if (!item) return 0;

  // Prefer values which are already calculated for the complete stack.
  const completeStack = firstFiniteNumber(
    foundry.utils.getProperty(item, "system.totalWeight"),
    foundry.utils.getProperty(item, "system.weight.total"),
    foundry.utils.getProperty(item, "system.weight.computed")
  );
  if (completeStack !== null) return Math.max(0, completeStack);

  const rawWeight = foundry.utils.getProperty(item, "system.weight");
  const unitWeight = firstFiniteNumber(
    typeof rawWeight === "object" && rawWeight !== null ? rawWeight.value : rawWeight,
    foundry.utils.getProperty(item, "system.weight.value")
  ) ?? 0;
  return Math.max(0, unitWeight) * getItemQuantityData(item).value;
}

function getBetterInvItemsWeight(items) {
  return Array.from(items ?? []).reduce((sum, item) => sum + getBetterInvItemWeight(item), 0);
}

function betterInvCategoryWeightHtml(items, label = "Kategoriegewicht") {
  const weight = getBetterInvItemsWeight(items);
  const unit = getBetterInvWeightUnit();
  const amount = `${formatBetterInvNumber(weight)} ${unit}`;
  return `
    <span class="betterinv-category-weight" title="${escapeAttr(`${label}: ${amount}`)}">
      <i class="fas fa-weight-hanging" aria-hidden="true"></i>
      <span>${escapeHtml(amount)}</span>
    </span>`;
}

function getBetterInvContainerCapacity(actor, container, inventoryItems = null) {
  if (!actor || !container) return null;

  const capacity = foundry.utils.getProperty(container, "system.capacity");
  const capacityObject = capacity && typeof capacity === "object" ? capacity : {};
  const contents = getVisibleItems(actor, container, inventoryItems);

  // D&D5e 5.x / Foundry V14 stores container limits in nested fields:
  // capacity.count, capacity.weight.value and capacity.volume.value.
  // Older system versions used capacity.type + capacity.value, so both
  // formats remain supported here.
  const countMaximum = firstFiniteNumber(capacityObject.count);
  const weightMaximum = firstFiniteNumber(
    foundry.utils.getProperty(capacityObject, "weight.value"),
    typeof capacityObject.weight !== "object" ? capacityObject.weight : null
  );
  const volumeMaximum = firstFiniteNumber(
    foundry.utils.getProperty(capacityObject, "volume.value"),
    typeof capacityObject.volume !== "object" ? capacityObject.volume : null
  );
  const legacyMaximum = firstFiniteNumber(
    capacityObject.value,
    capacityObject.max,
    capacityObject.maximum
  );

  let type = "weight";
  let maximum = null;
  let unit = "";

  if (countMaximum !== null && countMaximum > 0) {
    type = "items";
    maximum = countMaximum;
    unit = game.i18n?.localize?.("DND5E.Items") ?? "Items";
  } else if (weightMaximum !== null && weightMaximum > 0) {
    type = "weight";
    maximum = weightMaximum;
    const unitKey = String(foundry.utils.getProperty(capacityObject, "weight.units") ?? "").trim();
    const unitConfig = CONFIG?.DND5E?.weightUnits?.[unitKey];
    const unitLabel = unitConfig?.abbreviation ?? unitConfig?.label ?? unitKey;
    unit = unitLabel ? (game.i18n?.localize?.(unitLabel) ?? unitLabel) : getBetterInvWeightUnit();
  } else if (volumeMaximum !== null && volumeMaximum > 0) {
    type = "volume";
    maximum = volumeMaximum;
    const unitKey = String(foundry.utils.getProperty(capacityObject, "volume.units") ?? "").trim();
    const unitConfig = CONFIG?.DND5E?.volumeUnits?.[unitKey];
    const unitLabel = unitConfig?.abbreviation ?? unitConfig?.label ?? unitKey;
    unit = unitLabel ? (game.i18n?.localize?.(unitLabel) ?? unitLabel) : "Vol.";
  } else if (legacyMaximum !== null && legacyMaximum > 0) {
    const rawType = String(capacityObject.type ?? "weight").toLowerCase();
    type = ["items", "item", "count", "quantity"].includes(rawType) ? "items" : rawType;
    maximum = legacyMaximum;
    unit = String(capacityObject.units ?? capacityObject.unit ?? "").trim();
  }

  if (maximum === null || maximum <= 0) return {
    current: 0,
    maximum: null,
    unit: unit || getBetterInvWeightUnit(),
    percentage: 0,
    overCapacity: false,
    contentCount: contents.length,
    hasCapacity: false
  };

  let current = null;
  if (type === "items") {
    current = firstFiniteNumber(
      foundry.utils.getProperty(container, "system.contentsCount"),
      foundry.utils.getProperty(container, "system.capacity.used"),
      foundry.utils.getProperty(container, "system.capacity.current")
    );
    if (current === null) current = contents.reduce((sum, item) => sum + getItemQuantityData(item).value, 0);
    if (!unit) unit = game.i18n?.localize?.("DND5E.Items") ?? "Items";
  } else if (type === "volume") {
    current = firstFiniteNumber(
      foundry.utils.getProperty(container, "system.contentsVolume"),
      foundry.utils.getProperty(container, "system.volume.contents"),
      foundry.utils.getProperty(container, "system.capacity.used"),
      foundry.utils.getProperty(container, "system.capacity.current")
    );
    if (current === null) current = 0;
    if (!unit) unit = "Vol.";
  } else {
    current = firstFiniteNumber(
      foundry.utils.getProperty(container, "system.contentsWeight"),
      foundry.utils.getProperty(container, "system.weight.contents"),
      foundry.utils.getProperty(container, "system.weight.contentsWeight"),
      foundry.utils.getProperty(container, "system.capacity.used"),
      foundry.utils.getProperty(container, "system.capacity.current"),
      foundry.utils.getProperty(container, "system.capacity.valueUsed")
    );
    if (current === null) current = contents.reduce((sum, item) => sum + getBetterInvItemWeight(item), 0);
    if (!unit) unit = getBetterInvWeightUnit();
  }

  const safeCurrent = Math.max(0, Number(current) || 0);
  const percentage = Math.max(0, Math.min(100, (safeCurrent / maximum) * 100));

  return {
    current: safeCurrent,
    maximum,
    unit,
    percentage,
    overCapacity: safeCurrent > maximum,
    contentCount: contents.length,
    hasCapacity: true
  };
}

function betterInvContainerCapacityHtml(capacity, { compact = false } = {}) {
  if (!capacity?.hasCapacity) return "";
  const current = formatBetterInvNumber(capacity.current);
  const maximum = formatBetterInvNumber(capacity.maximum);
  const stateClass = capacity.overCapacity ? " betterinv-container-capacity-over" : "";
  const title = `Kapazität: ${current} / ${maximum} ${capacity.unit}`;

  return `
    <div class="betterinv-container-capacity${compact ? " betterinv-container-capacity-compact" : ""}${stateClass}" title="${escapeAttr(title)}">
      <div class="betterinv-container-capacity-line">
        <span>Kapazität</span>
        <strong>${escapeHtml(current)} / ${escapeHtml(maximum)} ${escapeHtml(capacity.unit)}</strong>
      </div>
      <span class="betterinv-container-capacity-bar" aria-hidden="true">
        <span style="width:${Math.round(capacity.percentage)}%"></span>
      </span>
    </div>`;
}

function getBetterInvActorEncumbrance(actor, { inventoryItems = null } = {}) {
  if (!actor) return null;

  const encumbrance = foundry.utils.getProperty(actor, "system.attributes.encumbrance");
  const data = encumbrance && typeof encumbrance === "object" ? encumbrance : {};

  // Prefer the system-calculated value. D&D5e already accounts for equipped
  // items, item quantities, containers, container weight rules and the
  // backpack's own weight in this value.
  let current = firstFiniteNumber(
    data.value,
    data.current,
    data.total,
    data.weight,
    foundry.utils.getProperty(actor, "system.attributes.carrying.value")
  );
  let maximum = firstFiniteNumber(
    data.max,
    data.maximum,
    data.capacity,
    foundry.utils.getProperty(actor, "system.attributes.carrying.max")
  );

  // Safe fallback for systems which do not expose a prepared encumbrance
  // object: sum only top-level stacks. This avoids counting container contents
  // twice when a prepared container total is available.
  if (current === null) {
    const items = Array.isArray(inventoryItems) ? inventoryItems : getInventoryItems(actor);
    current = items
      .filter(item => !getItemContainerId(item))
      .reduce((sum, item) => sum + getBetterInvItemWeight(item), 0);
  }

  // D&D5e fallback only. Custom/system-prepared maximums always win above.
  if ((maximum === null || maximum <= 0) && game.system?.id === "dnd5e") {
    const strength = firstFiniteNumber(
      foundry.utils.getProperty(actor, "system.abilities.str.value"),
      foundry.utils.getProperty(actor, "system.abilities.str.total")
    );
    if (strength !== null && strength > 0) maximum = strength * 15;
  }

  const safeCurrent = Math.max(0, Number(current) || 0);
  const safeMaximum = maximum !== null && Number(maximum) > 0 ? Number(maximum) : null;
  const rawPercentage = firstFiniteNumber(data.pct, data.percentage);
  const percentage = safeMaximum
    ? Math.max(0, Math.min(100, rawPercentage ?? ((safeCurrent / safeMaximum) * 100)))
    : 0;

  const unitKey = String(data.units ?? data.unit ?? "").trim();
  const unitConfig = CONFIG?.DND5E?.weightUnits?.[unitKey];
  const unitLabel = unitConfig?.abbreviation ?? unitConfig?.label ?? unitKey;
  const unit = unitLabel ? (game.i18n?.localize?.(unitLabel) ?? unitLabel) : getBetterInvWeightUnit();

  return {
    current: safeCurrent,
    maximum: safeMaximum,
    unit,
    percentage,
    overCapacity: safeMaximum !== null && safeCurrent > safeMaximum,
    hasCapacity: safeMaximum !== null
  };
}

function betterInvActorEncumbranceHtml(encumbrance) {
  if (!encumbrance) return "";
  const current = formatBetterInvNumber(encumbrance.current);
  const maximum = encumbrance.hasCapacity ? formatBetterInvNumber(encumbrance.maximum) : null;
  const amount = maximum
    ? `${current} / ${maximum} ${encumbrance.unit}`
    : `${current} ${encumbrance.unit}`;
  const stateClass = encumbrance.overCapacity ? " betterinv-actor-encumbrance-over" : "";
  const title = `Gesamttraglast inklusive der Rucksäcke: ${amount}`;

  return `
    <section class="betterinv-actor-encumbrance${stateClass}" title="${escapeAttr(title)}">
      <div class="betterinv-actor-encumbrance-line">
        <span><i class="fas fa-weight-hanging" aria-hidden="true"></i> Traglast</span>
        <strong>${escapeHtml(amount)}</strong>
      </div>
      ${encumbrance.hasCapacity ? `
        <span class="betterinv-actor-encumbrance-bar" aria-hidden="true">
          <span style="width:${Math.round(encumbrance.percentage)}%"></span>
        </span>` : ""}
    </section>`;
}

async function renderContainerCards(actor, containers, { showCapacity = true, inventoryItems = null } = {}) {
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
    <div class="betterinv-containers" data-layer-count="${layerCount}">
      ${rows.map((row, rowIndex) => `
        <div class="betterinv-container-row ${row.length ? "" : "betterinv-container-row-empty"}" data-row-index="${rowIndex}">
          ${row.map(container => {
            const alias = getContainerAlias(actor, container);
            const capacity = showCapacity ? getBetterInvContainerCapacity(actor, container, inventoryItems) : null;
            return `
              <div class="betterinv-container-card" role="button" tabindex="0" draggable="true" data-container-id="${container.id}" title="${escapeAttr(alias)} öffnen">
                <img src="${escapeAttr(container.img || "icons/svg/item-bag.svg")}" alt="">
                <span>${escapeHtml(alias)}</span>
                ${alias !== container.name ? `<small>${escapeHtml(container.name)}</small>` : ""}
                ${showCapacity ? betterInvContainerCapacityHtml(capacity, { compact: true }) : ""}
              </div>`;
          }).join("")}
        </div>
      `).join("")}
    </div>`;
}

function renderContainerBreadcrumb(actor, container, { showCapacity = true, showCount = true, inventoryItems = null } = {}) {
  const count = showCount ? getVisibleItems(actor, container, inventoryItems).length : null;
  const capacity = showCapacity ? getBetterInvContainerCapacity(actor, container, inventoryItems) : null;
  return `
    <div class="betterinv-container-view">
      <button type="button" class="betterinv-back">← Alle Rucksäcke</button>
      <div class="betterinv-container-main">
        <div class="betterinv-container-title">
          <img src="${escapeAttr(container.img || "icons/svg/item-bag.svg")}" alt="">
          <div class="betterinv-container-title-copy">
            <strong>${escapeHtml(getContainerAlias(actor, container))}</strong>
            ${showCount ? `<small>${count} Inhalt(e)</small>` : ""}
          </div>
        </div>
        ${showCapacity ? betterInvContainerCapacityHtml(capacity) : ""}
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

function isBetterInvFavorite(item) {
  return item?.getFlag?.(MODULE_ID, "favorite") === true;
}

async function toggleBetterInvFavorite(item) {
  if (!item) return;
  const next = !isBetterInvFavorite(item);
  await item.setFlag(MODULE_ID, "favorite", next);
  ui.notifications.info(`${item.name} wurde ${next ? "zu den Favoriten hinzugefügt" : "aus den Favoriten entfernt"}.`);
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

async function promptBetterInvItemSource() {
  return await new Promise(resolve => {
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const dialog = new Dialog({
      title: "Item hinzufügen",
      content: `
        <div class="betterinv-item-source-choice">
          <p class="betterinv-item-source-intro">Wie möchtest du das Item hinzufügen?</p>
          <div class="betterinv-item-source-preview">
            <div class="betterinv-item-source-preview-card">
              <i class="fas fa-file" aria-hidden="true"></i>
              <div>
                <strong>Leeres Item</strong>
                <span>Name und Itemtyp selbst festlegen.</span>
              </div>
            </div>
            <div class="betterinv-item-source-preview-card">
              <i class="fas fa-book-open" aria-hidden="true"></i>
              <div>
                <strong>Aus Kompendium</strong>
                <span>Ein vorhandenes Item aus einem zugänglichen Kompendium übernehmen.</span>
              </div>
            </div>
          </div>
        </div>`,
      buttons: {
        empty: {
          icon: '<i class="fas fa-file"></i>',
          label: "Leeres Item",
          callback: () => done("empty")
        },
        compendium: {
          icon: '<i class="fas fa-book-open"></i>',
          label: "Aus Kompendium",
          callback: () => done("compendium")
        },
        cancel: {
          icon: '<i class="fas fa-xmark"></i>',
          label: "Abbrechen",
          callback: () => done(null)
        }
      },
      default: "empty",
      close: () => done(null)
    });

    dialog.render(true);
    setTimeout(() => bringFoundryDialogsToFront({ avoidOverlap: false }), 50);
  });
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

  const source = await promptBetterInvItemSource();
  if (!source) return null;
  if (source === "compendium") {
    ui.notifications.info("Die Kompendiumauswahl ist vorbereitet. Zugängliche Kompendien werden im nächsten Schritt eingebunden.");
    return null;
  }

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
  const existingMenu = document.getElementById("betterinv-item-action-menu");
  if (existingMenu && betterInvActionMenuButton === button) {
    closeBetterInvItemActionMenu();
    return;
  }

  closeBetterInvItemActionMenu();
  if (!button || !actor || !item) return;
  betterInvActionMenuButton = button;

  const menu = document.createElement("div");
  menu.id = "betterinv-item-action-menu";
  menu.className = "betterinv-item-actions-menu";
  menu.setAttribute("role", "menu");
  const userSettings = getBetterInvUserSettings();
  const features = getBetterInvFeaturePlan(userSettings);
  const equipped = features.equipActions ? getItemEquippedData(item) : { supported: false, value: false };
  const favorite = features.favorites ? isBetterInvFavorite(item) : false;
  menu.innerHTML = `
    ${features.equipActions && equipped.supported ? `<button type="button" class="betterinv-item-action-equipped" role="menuitem"><i class="fas ${equipped.value ? "fa-box-open" : "fa-shield-alt"}"></i><span>${equipped.value ? "Ablegen" : "Ausrüsten"}</span></button>` : ""}
    ${features.favorites ? `<button type="button" class="betterinv-item-action-favorite" role="menuitem"><i class="${favorite ? "fas" : "far"} fa-star"></i><span>${favorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}</span></button>` : ""}
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
    if (betterInvActionMenuButton === button) betterInvActionMenuButton = null;
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

  menu.querySelector(".betterinv-item-action-favorite")?.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    close();
    try {
      await toggleBetterInvFavorite(item);
    } catch (error) {
      console.error("Better Inventory | Favoritenstatus konnte nicht geändert werden", error);
      ui.notifications.error("Der Favoritenstatus konnte nicht geändert werden.");
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

function itemRowHtml(item, categoryOptions, containerId, { favoriteView = false, settings = null, features = null } = {}) {
  const userSettings = settings ?? getBetterInvUserSettings();
  const featurePlan = features ?? getBetterInvFeaturePlan(userSettings);
  const img = item.img || "icons/svg/item-bag.svg";
  const qty = featurePlan.quantityControls ? getItemQuantityData(item).value : null;
  const equipped = getItemEquippedData(item);
  const unidentified = isBetterInvUnidentified(item);
  const weightRaw = foundry.utils.getProperty(item, "system.weight") ?? foundry.utils.getProperty(item, "system.weight.value") ?? "–";
  const weight = typeof weightRaw === "object" ? (weightRaw.value ?? weightRaw.total ?? "–") : weightRaw;
  const current = itemCategory(item, containerId);
  const showCategoryPicker = featurePlan.categoryDropdown;
  const options = showCategoryPicker
    ? (categoryOptions ?? ["__unsorted"]).map(cat =>
        `<option value="${escapeAttr(cat)}" ${current === cat ? "selected" : ""}>${escapeHtml(categoryOptionLabel(cat))}</option>`
      ).join("")
    : "";
  const priceHtml = featurePlan.itemValues ? betterInvItemPriceHtml(item, { unidentified, enabled: true }) : "";

  return `
    <article class="betterinv-item ${equipped.supported && equipped.value ? "betterinv-item-equipped" : ""} ${unidentified ? "betterinv-item-unidentified" : ""} ${favoriteView ? "betterinv-favorite-view" : ""}" data-item-id="${item.id}" data-category="${escapeAttr(current)}" draggable="${favoriteView ? "false" : "true"}">
      <span class="betterinv-item-grip" title="${favoriteView ? "Favorit – das Original bleibt in seiner Kategorie" : "Gedrückt halten und Item verschieben"}">${favoriteView ? "★" : "☰"}</span>
      <img src="${escapeAttr(img)}" alt="">
      <div class="betterinv-item-main">
        <button type="button" class="betterinv-open-item" title="Item öffnen">${escapeHtml(item.name)}</button>
        <div class="betterinv-item-meta-row">
          <small>${escapeHtml(item.type)} · Gewicht: ${escapeHtml(String(weight))}${unidentified ? ` · <span class="betterinv-unidentified-label">Unbekannt</span>` : ""}${equipped.supported && equipped.value ? ` · <span class="betterinv-equipped-label">Ausgerüstet</span>` : ""}</small>
          ${priceHtml}
        </div>
      </div>
      ${featurePlan.quantityControls ? `
        <div class="betterinv-item-resources">
          <div class="betterinv-resource-block betterinv-quantity-resource" aria-label="Anzahl ändern">
            <span class="betterinv-resource-label">Anzahl</span>
            <div class="betterinv-quantity-controls">
              <button type="button" class="betterinv-quantity-plus" title="Anzahl um 1 erhöhen" aria-label="Anzahl erhöhen"><i class="fas fa-chevron-up" aria-hidden="true"></i></button>
              <input type="number" class="betterinv-quantity-value" min="0" step="1" inputmode="numeric" value="${escapeAttr(String(qty))}" data-original-value="${escapeAttr(String(qty))}" title="Anklicken und Anzahl direkt eingeben" aria-label="Aktuelle Anzahl direkt ändern">
              <button type="button" class="betterinv-quantity-minus" title="Anzahl um 1 verringern" aria-label="Anzahl verringern"><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
            </div>
          </div>
        </div>` : ""}
      ${featurePlan.editButton ? `<button type="button" class="betterinv-edit-item" title="Item bearbeiten" aria-label="Item bearbeiten"><i class="fas fa-pen"></i></button>` : ""}
      ${showCategoryPicker ? `
        <span class="betterinv-category-picker" title="Kategorie ändern">
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
          <select class="betterinv-category-select" aria-label="Kategorie wählen">${options}</select>
        </span>` : ""}
      ${featurePlan.itemActionsMenu ? `<button type="button" class="betterinv-item-actions-button" title="Weitere Item-Aktionen" aria-label="Weitere Item-Aktionen"><i class="fas fa-ellipsis-v"></i></button>` : ""}
    </article>`;
}

function activateWindowListeners(windowEl, actor, activeContainer, { settings = null, features = null, inventoryItems = null } = {}) {
  const userSettings = settings ?? getBetterInvUserSettings();
  const featurePlan = features ?? getBetterInvFeaturePlan(userSettings);
  windowEl.querySelector(".betterinv-close")?.addEventListener("click", () => {
    closeBetterInvItemActionMenu();
    windowEl.remove();
  });
  windowEl.querySelector(".betterinv-popout")?.addEventListener("pointerdown", event => { event.preventDefault(); openBetterInvPopup(windowEl); });
  windowEl.querySelector(".betterinv-scale-down")?.addEventListener("click", () => { betterInvState.scale = Math.max(0.65, Math.round(((betterInvState.scale || 1) - 0.1) * 10) / 10); renderBetterInvWindow(); });
  windowEl.querySelector(".betterinv-scale-up")?.addEventListener("click", () => { betterInvState.scale = Math.min(1.35, Math.round(((betterInvState.scale || 1) + 0.1) * 10) / 10); renderBetterInvWindow(); });

  const settingsButton = windowEl.querySelector(".betterinv-settings");
  settingsButton?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleBetterInvSettingsWindow();
  });
  updateBetterInvSettingsButtonState();
  makeBetterInvDraggable(windowEl);

  windowEl.querySelector(".betterinv-layer-plus")?.addEventListener("click", async () => {
    const current = await getContainerLayerCount(actor) ?? Math.max(1, Math.ceil(getContainerItems(actor, inventoryItems).length / 4));
    await setContainerLayerCount(actor, current + 1);
    // Keep all existing backpack layer assignments exactly where they are.
    renderBetterInvWindow();
  });
  windowEl.querySelector(".betterinv-layer-minus")?.addEventListener("click", async () => {
    const current = await getContainerLayerCount(actor) ?? Math.max(1, Math.ceil(getContainerItems(actor, inventoryItems).length / 4));
    const next = Math.max(1, current - 1);
    const containers = await sortContainersBySavedOrder(actor, getContainerItems(actor, inventoryItems));
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

  if (featurePlan.containers) enableContainerDragSorting(windowEl, actor, activeContainer);
  if (featurePlan.items && featurePlan.containers) enableItemToContainerDrop(windowEl, actor, activeContainer);

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

  if (featurePlan.subcategories) enableSubcategoryDragSorting(windowEl, actor, activeContainer?.id ?? null);
  if (featurePlan.categories) enableCategoryDragSorting(windowEl, actor, activeContainer?.id ?? null);
  if (featurePlan.items) enableItemDragSorting(windowEl, actor, activeContainer?.id ?? null);

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

  if (featurePlan.quantityControls) {
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
  }

  if (featurePlan.currencyCalculator) {
    const runCurrencyAction = async (button, action, { logMessage, errorMessage } = {}) => {
      if (!button || button.disabled) return;
      const actionButtons = Array.from(windowEl.querySelectorAll(".betterinv-currency-action"));
      const currencyInputs = Array.from(windowEl.querySelectorAll(".betterinv-currency-input"));
      actionButtons.forEach(actionButton => { actionButton.disabled = true; });
      currencyInputs.forEach(input => { input.disabled = true; });
      button.classList.add("betterinv-currency-action-busy");
      try {
        const changed = await action(actor);
        if (changed) renderBetterInvWindow();
      } catch (error) {
        console.error(logMessage, error);
        if (error?.betterInvUserMessage) ui.notifications.error(error.betterInvUserMessage);
        else notifyBetterInvCurrencyError(errorMessage);
      } finally {
        const disabled = actor?.isOwner === false || isBetterInvCurrencyTransactionPending(actor);
        actionButtons.forEach(actionButton => { actionButton.disabled = disabled; });
        currencyInputs.forEach(input => { input.disabled = disabled; });
        button.classList.remove("betterinv-currency-action-busy");
      }
    };

    windowEl.querySelector(".betterinv-currency-add")?.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      await runCurrencyAction(event.currentTarget, addBetterInvCurrency, {
        logMessage: "Better Inventory | Währung konnte nicht hinzugefügt werden",
        errorMessage: "Die Münzen konnten nicht hinzugefügt werden."
      });
    });

    windowEl.querySelector(".betterinv-currency-remove")?.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      await runCurrencyAction(event.currentTarget, removeBetterInvCurrency, {
        logMessage: "Better Inventory | Währung konnte nicht entfernt werden",
        errorMessage: "Die Münzen konnten nicht bezahlt oder entfernt werden."
      });
    });

    windowEl.querySelector(".betterinv-currency-exchange-down")?.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      await runCurrencyAction(event.currentTarget, exchangeBetterInvCurrencyDown, {
        logMessage: "Better Inventory | Münzen konnten nicht abgerundet werden",
        errorMessage: "Die Münzen konnten nicht abgerundet werden."
      });
    });

    windowEl.querySelector(".betterinv-currency-exchange-up")?.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      await runCurrencyAction(event.currentTarget, exchangeBetterInvCurrencyUp, {
        logMessage: "Better Inventory | Münzen konnten nicht aufgerundet werden",
        errorMessage: "Die Münzen konnten nicht aufgerundet werden."
      });
    });

    windowEl.querySelectorAll(".betterinv-currency-input").forEach(input => {
      input.addEventListener("click", event => event.stopPropagation());
      input.addEventListener("focus", event => {
        event.stopPropagation();
        event.currentTarget.select();
      });
      input.addEventListener("keydown", event => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      });
      input.addEventListener("input", event => {
        event.stopPropagation();
        const field = event.currentTarget;
        const key = String(field.dataset.currencyKey ?? "");
        if (!BETTER_INV_CURRENCIES.some(currency => currency.key === key)) return;
        const next = normalizeBetterInvCurrencyDraftValue(field.value, { allowBlank: true });
        if (field.value !== next) field.value = next;
        betterInvState.currencyDraft[key] = next;
      });
    });
  }

  if (featurePlan.quantityControls) {
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
  const rows = Array.from(windowEl.querySelectorAll(".betterinv-item:not(.betterinv-favorite-view)"));
  rows.forEach(row => {
    row.addEventListener("dragstart", event => {
      if (event.target.closest("select, input, textarea, a, button, .betterinv-edit-item, .betterinv-open-item, .betterinv-item-resources")) {
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
      const targetCategory = targetList?.closest(".betterinv-subcategory, .betterinv-category, .betterinv-system-category")?.dataset.category;
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
      const order = Array.from(windowEl.querySelectorAll(".betterinv-item:not(.betterinv-favorite-view)")).map(el => el.dataset.itemId).filter(Boolean);
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

  windowEl.querySelectorAll(".betterinv-items:not(.betterinv-favorite-items)").forEach(list => {
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
  windowEl.querySelectorAll(".betterinv-category, .betterinv-subcategory, .betterinv-system-category").forEach(categoryEl => {
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
  const draggableElements = [...list.querySelectorAll(".betterinv-item:not(.betterinv-item-dragging):not(.betterinv-favorite-view)")];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function useOrOpenItem(item, event) {
  if (!item) return;

  // Use Foundry's native item workflow. Axon's Inventory does not alter
  // charges, uses, consumption or automatic item deletion.
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

function makeBetterInvSettingsDraggable(windowEl) {
  const header = windowEl.querySelector(".betterinv-settings-window-header");
  if (!header || header.dataset.dragReady === "1") return;
  header.dataset.dragReady = "1";
  header.addEventListener("mousedown", event => {
    if (event.button !== 0) return;
    if (event.target.closest("button, input, select, textarea, a, label")) return;
    event.preventDefault();
    const rect = windowEl.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    windowEl.style.zIndex = "20020";
    function onMove(moveEvent) {
      const maxLeft = Math.max(0, window.innerWidth - 80);
      const maxTop = Math.max(0, window.innerHeight - 50);
      windowEl.style.left = `${Math.max(0, Math.min(maxLeft, moveEvent.clientX - offsetX))}px`;
      windowEl.style.top = `${Math.max(0, Math.min(maxTop, moveEvent.clientY - offsetY))}px`;
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
