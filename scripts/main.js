/* Better Inventory - Foundry VTT v14 lightweight module */

const MODULE_ID = "betterinv";
const DEFAULT_CATEGORIES = [];
const BETTER_INV_USER_SETTINGS_FLAG = "userSettings";
const BETTER_INV_USER_SETTINGS_VERSION = 4;
const DEFAULT_BETTER_INV_USER_SETTINGS = Object.freeze({
  version: BETTER_INV_USER_SETTINGS_VERSION,
  moduleEnabled: true,
  showCurrency: true,
  showCurrencyCalculator: true,
  showCurrencyTransfer: true,
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
  showItemTransfer: true,
  showEquipActions: true,
  showCategoryDropdown: true,
  showContainers: true,
  showContainerCapacity: true,
  showEncumbrance: true
});

const BETTER_INV_SETTINGS_GROUPS = [
  {
    id: "currency",
    title: "Geld",
    icon: "fa-coins",
    settings: [
      ["showCurrency", "Geldanzeige", "Zeigt Platin, Gold, Elektrum, Silber und Kupfer."],
      ["showCurrencyCalculator", "Geldrechner", "Zeigt Eingaben sowie Hinzufügen, Bezahlen, Aufrunden und Abrunden."],
      ["showCurrencyTransfer", "Geld handeln", "Zeigt den Handeln-Button für den direkten Münztransfer an andere Spielercharaktere."]
    ]
  },
  {
    id: "items",
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
      ["showItemTransfer", "Item handeln / übertragen", "Zeigt Übertragen im Drei-Punkte-Menü und erlaubt die Übergabe per Drag-and-drop auf Spieler-Tokens."],
      ["showEquipActions", "Ausrüsten / Ablegen", "Zeigt die Ausrüstungsaktion im Drei-Punkte-Menü."],
      [null, "Einstimmung", "Unterstützung für eingestimmte Gegenstände folgt in einer späteren Version.", { disabled: true, badge: "Coming soon" }],
      ["showCategoryDropdown", "Kategorie-Dropdown", "Zeigt die kleine Kategorienauswahl direkt am Item."]
    ]
  },
  {
    id: "containers",
    title: "Container",
    icon: "fa-box-open",
    settings: [
      ["showContainers", "Rucksäcke anzeigen", "Blendet Rucksackkarten und Containeransicht vollständig ein oder aus."],
      ["showContainerCapacity", "Containerkapazität", "Zeigt Kapazität und Balken auf Rucksäcken."]
    ]
  },
  {
    id: "character",
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
let betterInvCategoryMenuCleanup = null;
let betterInvCategoryMenuButton = null;
let betterInvActiveItemDrag = null;
let betterInvTokenDropOverlay = null;
let betterInvTokenDropTargetId = null;
let betterInvTokenDropFeedbackInstalled = false;
let betterInvButtonRetryTimer = null;
let betterInvRefreshFrame = null;
let betterInvRefreshPreserveScroll = true;
let betterInvRefreshBatchDepth = 0;
let betterInvRefreshBatchRequested = false;
let betterInvRefreshBatchPreserveScroll = true;
let betterInvRenderSequence = 0;
let betterInvRenderPromise = null;
let betterInvQueuedRenderOptions = null;
let betterInvDialogMutationFrame = null;
const betterInvPendingDialogElements = new Set();

// Phase 7.8: derived actor data can safely survive several UI-only renders.
// The cache is deliberately small and is invalidated by Actor/Item hooks so it
// never becomes a second source of truth beside Foundry's documents.
const BETTER_INV_ACTOR_CACHE_LIMIT = 8;
const betterInvActorDataCaches = new Map();

// Phase 7.6: lightweight runtime diagnostics. Measurements stay local to the
// current browser session and are never transmitted or persisted.
const BETTER_INV_PERFORMANCE_SAMPLE_LIMIT = 60;
const BETTER_INV_EVENT_LOOP_SAMPLE_LIMIT = 120;
const betterInvPerformanceState = {
  renders: [],
  refreshRequests: 0,
  refreshFrames: 0,
  coalescedRefreshRequests: 0,
  discardedRenders: 0,
  activeDelegatedListeners: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheInvalidations: 0,
  eventLoopLag: [],
  monitorTimer: null,
  monitorLastTick: null
};

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
  installBetterInvTokenDropFeedback();
});

Hooks.on("renderHotbar", () => ensureBetterInvButton());
Hooks.on("controlToken", () => {
  if (!isBetterInvWindowOpen()) return;
  if (getBetterInvUserSettings().moduleEnabled === false) return;
  scheduleBetterInvRefresh({ preserveScroll: false });
});
Hooks.on("updateActor", (actor, changes, options) => {
  refreshIfCurrentActor(actor, changes, options);
});
Hooks.on("createItem", (item, options) => {
  refreshIfItemActor(item, null, options, { lifecycle: "create" });
});
Hooks.on("updateItem", (item, changes, options) => {
  refreshIfItemActor(item, changes, options, { lifecycle: "update" });
});
Hooks.on("deleteItem", (item, options) => {
  refreshIfItemActor(item, null, options, { lifecycle: "delete" });
});
Hooks.on("deleteActor", actor => {
  invalidateBetterInvActorDataCache(actor, { all: true });
});
Hooks.on("dropCanvasData", async (canvasInstance, data, event) => {
  // Canvas drops happen frequently for many document types. Ignore everything
  // except Axon's own token-transfer payload before creating an async workflow.
  if (String(data?.type ?? "") !== "BetterInventoryItemTransfer") return;
  if (!getBetterInvFeaturePlan().itemTransfer) return;
  try {
    await handleBetterInvCanvasItemDrop(canvasInstance, data, event);
  } catch (error) {
    console.error("Better Inventory | Item konnte nicht auf den Token übertragen werden", error);
    ui.notifications.error(error?.betterInvUserMessage || error?.message || "Das Item konnte nicht auf den Token übertragen werden.");
  }
});
Hooks.on("updateUser", (user, changes, options) => {
  if (user?.id !== game.user?.id || !isBetterInvWindowOpen()) return;
  if (shouldBetterInvSkipHookRefresh(options)) return;
  const changedPaths = getBetterInvChangedPaths(changes);
  const settingsPath = `flags.${MODULE_ID}.${BETTER_INV_USER_SETTINGS_FLAG}`;
  const settingsChanged = betterInvPathsTouch(changedPaths, [settingsPath]);
  const assignedCharacterChanged = betterInvPathsTouch(changedPaths, ["character", "characterId"]);
  if (!settingsChanged && !assignedCharacterChanged) return;
  scheduleBetterInvRefresh({ preserveScroll: !assignedCharacterChanged });
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
    itemTransfer: items && settings?.showItemTransfer !== false,
    equipActions: items && settings?.showEquipActions !== false,
    categoryDropdown: categories && settings?.showCategoryDropdown !== false,
    containerCapacity: containers && settings?.showContainerCapacity !== false,
    encumbrance: enabled && settings?.showEncumbrance !== false,
    currency,
    currencyCalculator,
    currencyTransfer: currencyCalculator && settings?.showCurrencyTransfer !== false,
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

const BETTER_INV_FOUNDRY_APP_SELECTOR = [
  ".dialog.app.window-app",
  ".application.dialog",
  ".dnd5e2.dialog",
  ".dnd5e.dialog",
  ".app.window-app",
  ".application",
  "[role='dialog']"
].join(",");

function elevateBetterInvFoundryElement(el, { avoidOverlap = false } = {}) {
  if (!(el instanceof Element)) return;
  if (el.id === "betterinv-window" || el.closest?.("#betterinv-window")) return;
  el.style.zIndex = "20000";
  el.classList.add("betterinv-dialog-top");
  const betterInv = document.getElementById("betterinv-window");
  if (avoidOverlap && betterInv) moveElementOutsideBetterInv(el, betterInv);
}

function bringFoundryDialogsToFront({ avoidOverlap = false } = {}) {
  for (const el of document.querySelectorAll(BETTER_INV_FOUNDRY_APP_SELECTOR)) {
    elevateBetterInvFoundryElement(el, { avoidOverlap });
  }
}

function queueBetterInvDialogElement(el) {
  if (!(el instanceof Element)) return;
  if (el.matches?.(BETTER_INV_FOUNDRY_APP_SELECTOR)) betterInvPendingDialogElements.add(el);
  for (const child of el.querySelectorAll?.(BETTER_INV_FOUNDRY_APP_SELECTOR) ?? []) {
    betterInvPendingDialogElements.add(child);
  }
  if (!betterInvPendingDialogElements.size || betterInvDialogMutationFrame !== null) return;
  betterInvDialogMutationFrame = requestAnimationFrame(() => {
    betterInvDialogMutationFrame = null;
    const pending = Array.from(betterInvPendingDialogElements);
    betterInvPendingDialogElements.clear();
    for (const element of pending) elevateBetterInvFoundryElement(element);
  });
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


function decorateBetterInvDialog(dialog, { classes = [], avoidOverlap = false, focusSelector = null, selectInput = false } = {}) {
  bringFoundryDialogsToFront({ avoidOverlap });
  const element = dialog?.element?.[0]
    ?? dialog?.element
    ?? Array.from(document.querySelectorAll('.dialog.app.window-app, .application.dialog')).at(-1);
  if (!element) return null;
  element.classList.add("betterinv-dialog-theme", ...classes.filter(Boolean));
  element.style.zIndex = "26000";

  if (focusSelector) {
    const input = element.querySelector(focusSelector);
    if (input) {
      ["keydown", "keyup", "keypress", "beforeinput", "input", "paste"].forEach(type => {
        input.addEventListener(type, event => event.stopPropagation(), { capture: true });
      });
      input.focus?.({ preventScroll: true });
      if (selectInput) input.select?.();
    }
  }
  return element;
}

async function openBetterInvConfirmDialog({
  title,
  kicker = "Bitte bestätigen",
  contentHtml,
  note = "",
  image = "",
  icon = "fa-circle-question",
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  danger = false,
  variant = "default",
  width = 460
} = {}) {
  return await new Promise(resolve => {
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      resolve(Boolean(value));
    };

    const visual = image
      ? `<img class="betterinv-confirm-visual" src="${escapeAttr(image)}" alt="">`
      : `<span class="betterinv-confirm-visual betterinv-confirm-icon" aria-hidden="true"><i class="fas ${escapeAttr(icon)}"></i></span>`;

    const dialog = new Dialog({
      title: String(title || "Bestätigen"),
      content: `
        <div class="betterinv-confirm-card ${danger ? "is-danger" : ""} betterinv-confirm-${escapeAttr(variant)}">
          <div class="betterinv-confirm-main">
            ${visual}
            <div class="betterinv-confirm-copy">
              <span class="betterinv-confirm-kicker">${escapeHtml(kicker)}</span>
              <div class="betterinv-confirm-message">${contentHtml ?? ""}</div>
              ${note ? `<p class="betterinv-confirm-note">${escapeHtml(note)}</p>` : ""}
            </div>
          </div>
        </div>`,
      buttons: {
        confirm: {
          icon: `<i class="fas ${danger ? "fa-trash" : "fa-check"}"></i>`,
          label: confirmLabel,
          callback: () => done(true)
        },
        cancel: {
          icon: '<i class="fas fa-xmark"></i>',
          label: cancelLabel,
          callback: () => done(false)
        }
      },
      default: "confirm",
      close: () => done(false)
    }, {
      width,
      classes: ["betterinv-confirm-window", danger ? "betterinv-confirm-danger" : "", `betterinv-confirm-window-${variant}`].filter(Boolean)
    });

    dialog.render(true);
    setTimeout(() => {
      const element = decorateBetterInvDialog(dialog, {
        classes: ["betterinv-confirm-window", danger ? "betterinv-confirm-danger" : "", `betterinv-confirm-window-${variant}`]
      });
      element?.querySelectorAll?.("img").forEach(img => img.addEventListener("error", () => {
        if (img.dataset.fallbackApplied === "true") return;
        img.dataset.fallbackApplied = "true";
        img.src = "icons/svg/item-bag.svg";
      }, { once: true }));
    }, 40);
  });
}

function elevateRecentFoundryApps() {
  bringFoundryDialogsToFront({ avoidOverlap: true });
  setTimeout(() => bringFoundryDialogsToFront({ avoidOverlap: true }), 160);
}

function installBetterInvDialogZGuard() {
  if (document.body?.dataset?.betterInvDialogZGuard === "1") return;
  if (document.body?.dataset) document.body.dataset.betterInvDialogZGuard = "1";
  bringFoundryDialogsToFront();
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") queueBetterInvDialogElement(mutation.target);
      for (const node of mutation.addedNodes ?? []) queueBetterInvDialogElement(node);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "role"]
  });
}

function ensureBetterInvButton() {
  if (document.getElementById("betterinv-button")) {
    if (betterInvButtonRetryTimer !== null) clearTimeout(betterInvButtonRetryTimer);
    betterInvButtonRetryTimer = null;
    return;
  }
  const hotbar = document.getElementById("hotbar") ?? document.querySelector("#interface #hotbar") ?? document.querySelector(".hotbar");
  if (!hotbar) {
    if (betterInvButtonRetryTimer === null) {
      betterInvButtonRetryTimer = setTimeout(() => {
        betterInvButtonRetryTimer = null;
        ensureBetterInvButton();
      }, 500);
    }
    return;
  }
  if (betterInvButtonRetryTimer !== null) clearTimeout(betterInvButtonRetryTimer);
  betterInvButtonRetryTimer = null;
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

function isBetterInvWindowOpen() {
  return Boolean(document.getElementById("betterinv-window"));
}

function shouldBetterInvSkipHookRefresh(options) {
  return options?.betterInvSkipRefresh === true || options?.betterInv?.skipRefresh === true;
}

function normalizeBetterInvChangedPath(path) {
  return String(path ?? "")
    .split(".")
    .filter(Boolean)
    .map(part => part.startsWith("-=") ? part.slice(2) : part)
    .filter(Boolean)
    .join(".");
}

function getBetterInvChangedPaths(changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  try {
    const flattened = foundry.utils.flattenObject(changes);
    return Object.keys(flattened ?? {}).map(normalizeBetterInvChangedPath).filter(Boolean);
  } catch (_error) {
    return Object.keys(changes).map(normalizeBetterInvChangedPath).filter(Boolean);
  }
}

function betterInvPathsTouch(changedPaths, watchedPrefixes) {
  const paths = Array.from(changedPaths ?? []).map(normalizeBetterInvChangedPath).filter(Boolean);
  const prefixes = Array.from(watchedPrefixes ?? []).map(normalizeBetterInvChangedPath).filter(Boolean);
  if (!paths.length || !prefixes.length) return false;
  return paths.some(path => prefixes.some(prefix => (
    path === prefix
    || path.startsWith(`${prefix}.`)
    || prefix.startsWith(`${path}.`)
  )));
}

function betterInvActorChangesAffectFeatures(changes, features) {
  const changedPaths = getBetterInvChangedPaths(changes);
  // Foundry normally supplies a changed-object. Stay conservative for unusual
  // systems or compatibility shims which call the hook without one.
  if (!changedPaths.length) return true;

  const watched = [];
  if (features.currency) {
    watched.push(
      "system.currency",
      "system.currencies",
      "system.attributes.currency",
      "system.details.currency"
    );
  }
  if (features.encumbrance) {
    watched.push(
      "system.attributes.encumbrance",
      "system.attributes.carrying",
      "system.abilities.str"
    );
  }
  if (features.items || features.containers) {
    watched.push("flags.betterinv", "items");
  }
  return betterInvPathsTouch(changedPaths, watched);
}

function isBetterInvInventoryRelevantItem(item) {
  if (!item) return false;
  if (["weapon", "equipment", "consumable", "tool", "loot", "container", "backpack"].includes(item.type)) return true;
  return isContainerLike(item);
}

function betterInvItemChangesAffectFeatures(item, changes, features, { lifecycle = "update" } = {}) {
  if (lifecycle !== "update") return isBetterInvInventoryRelevantItem(item);

  const changedPaths = getBetterInvChangedPaths(changes);
  if (!changedPaths.length) return isBetterInvInventoryRelevantItem(item);
  // A type change can remove an item from the inventory even when its new type
  // is no longer one of our inventory types.
  if (betterInvPathsTouch(changedPaths, ["type"])) return true;
  if (!isBetterInvInventoryRelevantItem(item)) return false;

  const watched = [];
  if (features.items) {
    watched.push(
      "name",
      "img",
      "sort",
      "flags.betterinv",
      "system.quantity",
      "system.container",
      "system.identified",
      "system.equipped",
      "system.attuned",
      "system.type"
    );
    if (features.itemValues) watched.push("system.price", "system.value", "system.cost");
    if (features.categoryWeights) watched.push("system.weight");
  }
  if (features.containers) {
    watched.push(
      "name",
      "img",
      "sort",
      "flags.betterinv",
      "system.container",
      "system.quantity",
      "system.capacity",
      "system.contents",
      "system.type"
    );
  }
  if (features.encumbrance) {
    watched.push("system.weight", "system.quantity", "system.container", "system.equipped", "system.capacity", "system.contents");
  }
  return betterInvPathsTouch(changedPaths, watched);
}

function getBetterInvPerformanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function getBetterInvHeapUsed() {
  const memory = globalThis.performance?.memory;
  const used = Number(memory?.usedJSHeapSize);
  return Number.isFinite(used) && used >= 0 ? used : null;
}

function beginBetterInvPerformanceSample() {
  return {
    startedAt: getBetterInvPerformanceNow(),
    heapBefore: getBetterInvHeapUsed(),
    marks: {},
    committed: false,
    mode: "inventory",
    itemCount: 0,
    containerCount: 0,
    categoryCount: 0
  };
}

function markBetterInvPerformancePhase(sample, name) {
  if (!sample || !name) return;
  sample.marks[name] = getBetterInvPerformanceNow();
}

function getBetterInvPerformancePhaseDuration(sample, from, to) {
  const start = from === "start" ? sample?.startedAt : sample?.marks?.[from];
  const end = to === "finish" ? sample?.finishedAt : sample?.marks?.[to];
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function finishBetterInvPerformanceSample(sample, windowEl) {
  if (!sample) return;
  sample.finishedAt = getBetterInvPerformanceNow();
  if (!sample.committed) {
    betterInvPerformanceState.discardedRenders += 1;
    return;
  }

  const root = windowEl?.isConnected ? windowEl : document.getElementById("betterinv-window");
  const diagnosticsActive = Boolean(document.getElementById("betterinv-performance-window"));
  let domNodes = null;
  let itemRows = null;
  let categoryNodes = null;
  let containerCards = null;
  if (diagnosticsActive && root) {
    const elements = root.querySelectorAll("*");
    domNodes = elements.length + 1;
    itemRows = 0;
    categoryNodes = 0;
    containerCards = 0;
    for (const element of elements) {
      if (element.classList?.contains("betterinv-item")) itemRows += 1;
      if (element.classList?.contains("betterinv-category") || element.classList?.contains("betterinv-subcategory")) categoryNodes += 1;
      if (element.classList?.contains("betterinv-container-card")) containerCards += 1;
    }
  }
  const heapAfter = getBetterInvHeapUsed();
  const entry = {
    at: Date.now(),
    mode: sample.mode,
    totalMs: getBetterInvPerformancePhaseDuration(sample, "start", "finish") ?? 0,
    contextMs: getBetterInvPerformancePhaseDuration(sample, "start", "contextReady"),
    dataMs: getBetterInvPerformancePhaseDuration(sample, "contextReady", "dataReady"),
    htmlMs: getBetterInvPerformancePhaseDuration(sample, "dataReady", "htmlReady"),
    domMs: getBetterInvPerformancePhaseDuration(sample, "htmlReady", "domCommitted"),
    listenersMs: getBetterInvPerformancePhaseDuration(sample, "domCommitted", "listenersReady"),
    heapBefore: sample.heapBefore,
    heapAfter,
    heapDelta: Number.isFinite(sample.heapBefore) && Number.isFinite(heapAfter) ? heapAfter - sample.heapBefore : null,
    domNodes,
    itemRows,
    categoryNodes,
    containerCards,
    delegatedListeners: Math.max(0, Number(root?._betterInvListenerCount) || 0),
    itemCount: Math.max(0, Number(sample.itemCount) || 0),
    containerCount: Math.max(0, Number(sample.containerCount) || 0),
    categoryCount: Math.max(0, Number(sample.categoryCount) || 0)
  };
  betterInvPerformanceState.renders.push(entry);
  if (betterInvPerformanceState.renders.length > BETTER_INV_PERFORMANCE_SAMPLE_LIMIT) {
    betterInvPerformanceState.renders.splice(0, betterInvPerformanceState.renders.length - BETTER_INV_PERFORMANCE_SAMPLE_LIMIT);
  }
  updateBetterInvPerformanceWindow();
}

function resetBetterInvPerformanceMeasurements() {
  betterInvPerformanceState.renders.length = 0;
  betterInvPerformanceState.refreshRequests = 0;
  betterInvPerformanceState.refreshFrames = 0;
  betterInvPerformanceState.coalescedRefreshRequests = 0;
  betterInvPerformanceState.discardedRenders = 0;
  betterInvPerformanceState.cacheHits = 0;
  betterInvPerformanceState.cacheMisses = 0;
  betterInvPerformanceState.cacheInvalidations = 0;
  betterInvPerformanceState.eventLoopLag.length = 0;
  updateBetterInvPerformanceWindow();
}

function scheduleBetterInvRefresh({ preserveScroll = true } = {}) {
  if (!document.getElementById("betterinv-window")) return;
  betterInvPerformanceState.refreshRequests += 1;
  if (betterInvRefreshBatchDepth > 0) {
    betterInvPerformanceState.coalescedRefreshRequests += 1;
    betterInvRefreshBatchRequested = true;
    betterInvRefreshBatchPreserveScroll = betterInvRefreshBatchPreserveScroll && preserveScroll !== false;
    return;
  }
  betterInvRefreshPreserveScroll = betterInvRefreshPreserveScroll && preserveScroll !== false;
  if (betterInvRefreshFrame !== null) {
    betterInvPerformanceState.coalescedRefreshRequests += 1;
    return;
  }
  betterInvRefreshFrame = requestAnimationFrame(() => {
    betterInvPerformanceState.refreshFrames += 1;
    const keepScroll = betterInvRefreshPreserveScroll;
    betterInvRefreshFrame = null;
    betterInvRefreshPreserveScroll = true;
    if (!document.getElementById("betterinv-window")) return;
    renderBetterInvWindow({ preserveScroll: keepScroll });
  });
}

async function withBetterInvRefreshBatch(action, {
  forceRefresh = false,
  refreshResult = false,
  preserveScroll = true
} = {}) {
  if (typeof action !== "function") return undefined;
  betterInvRefreshBatchDepth += 1;
  let result;
  try {
    result = await action();
    return result;
  } finally {
    if (forceRefresh || (refreshResult && Boolean(result))) {
      betterInvRefreshBatchRequested = true;
      betterInvRefreshBatchPreserveScroll = betterInvRefreshBatchPreserveScroll && preserveScroll !== false;
    }
    betterInvRefreshBatchDepth = Math.max(0, betterInvRefreshBatchDepth - 1);
    if (betterInvRefreshBatchDepth === 0 && betterInvRefreshBatchRequested) {
      const keepScroll = betterInvRefreshBatchPreserveScroll;
      betterInvRefreshBatchRequested = false;
      betterInvRefreshBatchPreserveScroll = true;
      scheduleBetterInvRefresh({ preserveScroll: keepScroll });
    }
  }
}

function cancelScheduledBetterInvRefresh() {
  if (betterInvRefreshFrame !== null) cancelAnimationFrame(betterInvRefreshFrame);
  betterInvRefreshFrame = null;
  betterInvRefreshPreserveScroll = true;
}

function refreshIfCurrentActor(actor, changes = null, options = null) {
  // Cache invalidation must also happen while the inventory window is closed or
  // when an internal update deliberately suppresses a refresh.
  invalidateBetterInvActorCacheFromChanges(actor, changes);
  if (!isBetterInvWindowOpen() || shouldBetterInvSkipHookRefresh(options)) return;
  const current = getCurrentActor();
  if (current?.id !== actor?.id) return;
  const features = getBetterInvFeaturePlan();
  if (!features.needsActorRefresh) return;
  if (!betterInvActorChangesAffectFeatures(changes, features)) return;
  scheduleBetterInvRefresh();
}

function refreshIfItemActor(item, changes = null, options = null, { lifecycle = "update" } = {}) {
  const changedPaths = getBetterInvChangedPaths(changes);
  const cacheRelevant = lifecycle !== "update"
    ? isBetterInvInventoryRelevantItem(item)
    : isBetterInvInventoryRelevantItem(item) || betterInvPathsTouch(changedPaths, ["type"]);
  if (cacheRelevant) invalidateBetterInvActorDataCache(item?.parent, { inventory: true });

  if (!isBetterInvWindowOpen() || shouldBetterInvSkipHookRefresh(options)) return;
  const current = getCurrentActor();
  if (current?.id !== item?.parent?.id) return;
  const features = getBetterInvFeaturePlan();
  if (!features.needsItemDocumentRefresh) return;
  if (!betterInvItemChangesAffectFeatures(item, changes, features, { lifecycle })) return;
  scheduleBetterInvRefresh();
}

const BETTER_INV_INVENTORY_TYPES = new Set(["weapon", "equipment", "consumable", "tool", "loot", "container", "backpack"]);

function getBetterInvActorCacheKey(actorOrId) {
  if (!actorOrId) return null;
  if (typeof actorOrId === "string") return actorOrId;
  return actorOrId.id ? String(actorOrId.id) : null;
}

function createBetterInvActorDataCache(actor) {
  return {
    actor,
    inventoryItems: null,
    inventorySize: null,
    renderCache: null,
    sortedItemsByContext: new Map(),
    sortedContainers: null,
    categoriesByContext: new Map(),
    subcategoriesByContext: new Map(),
    lastUsedAt: Date.now()
  };
}

function pruneBetterInvActorDataCaches() {
  if (betterInvActorDataCaches.size <= BETTER_INV_ACTOR_CACHE_LIMIT) return;
  const entries = [...betterInvActorDataCaches.entries()]
    .sort(([, left], [, right]) => (left?.lastUsedAt ?? 0) - (right?.lastUsedAt ?? 0));
  while (betterInvActorDataCaches.size > BETTER_INV_ACTOR_CACHE_LIMIT && entries.length) {
    const [key] = entries.shift();
    betterInvActorDataCaches.delete(key);
  }
}

function getBetterInvActorDataCache(actor) {
  const key = getBetterInvActorCacheKey(actor);
  if (!key) return null;
  let cache = betterInvActorDataCaches.get(key);
  if (!cache || cache.actor !== actor) {
    cache = createBetterInvActorDataCache(actor);
    betterInvActorDataCaches.set(key, cache);
    pruneBetterInvActorDataCaches();
  } else {
    // Refresh insertion order as a simple LRU signal.
    betterInvActorDataCaches.delete(key);
    cache.lastUsedAt = Date.now();
    betterInvActorDataCaches.set(key, cache);
  }
  return cache;
}

function noteBetterInvCacheHit() {
  betterInvPerformanceState.cacheHits += 1;
}

function noteBetterInvCacheMiss() {
  betterInvPerformanceState.cacheMisses += 1;
}

function invalidateBetterInvActorDataCache(actorOrId, {
  all = false,
  inventory = false,
  itemOrder = false,
  containerOrder = false,
  categories = false
} = {}) {
  const key = getBetterInvActorCacheKey(actorOrId);
  if (!key) return false;
  const cache = betterInvActorDataCaches.get(key);
  if (!cache) return false;

  if (all) {
    betterInvActorDataCaches.delete(key);
    betterInvPerformanceState.cacheInvalidations += 1;
    return true;
  }

  let changed = false;
  if (inventory) {
    cache.inventoryItems = null;
    cache.inventorySize = null;
    cache.renderCache = null;
    cache.sortedItemsByContext.clear();
    cache.sortedContainers = null;
    changed = true;
  }
  if (itemOrder) {
    cache.sortedItemsByContext.clear();
    changed = true;
  }
  if (containerOrder) {
    cache.sortedContainers = null;
    changed = true;
  }
  if (categories) {
    cache.categoriesByContext.clear();
    cache.subcategoriesByContext.clear();
    changed = true;
  }
  if (changed) betterInvPerformanceState.cacheInvalidations += 1;
  return changed;
}

function invalidateBetterInvActorCacheFromChanges(actor, changes) {
  const changedPaths = getBetterInvChangedPaths(changes);
  if (!changedPaths.length) {
    invalidateBetterInvActorDataCache(actor, { all: true });
    return;
  }

  const inventory = betterInvPathsTouch(changedPaths, ["items"]);
  const itemOrder = betterInvPathsTouch(changedPaths, ["flags.betterinv.itemOrderByContext"]);
  const containerOrder = betterInvPathsTouch(changedPaths, ["flags.betterinv.containerOrder"]);
  const categories = betterInvPathsTouch(changedPaths, [
    "flags.betterinv.categoriesByContext",
    "flags.betterinv.subcategoriesByContext"
  ]);
  if (inventory || itemOrder || containerOrder || categories) {
    invalidateBetterInvActorDataCache(actor, { inventory, itemOrder, containerOrder, categories });
  }
}

function getBetterInvCachedInventoryContext(actor, actorCache = getBetterInvActorDataCache(actor)) {
  if (!actorCache) {
    noteBetterInvCacheMiss();
    const inventoryItems = getInventoryItems(actor);
    return { inventoryItems, renderCache: createBetterInvRenderCache(inventoryItems), actorCache: null };
  }

  const collectionSize = Number(actor?.items?.size ?? actor?.items?.length ?? 0);
  if (Array.isArray(actorCache.inventoryItems)
      && actorCache.renderCache
      && actorCache.inventorySize === collectionSize) {
    noteBetterInvCacheHit();
    return {
      inventoryItems: actorCache.inventoryItems,
      renderCache: actorCache.renderCache,
      actorCache
    };
  }

  noteBetterInvCacheMiss();
  const inventoryItems = getInventoryItems(actor);
  actorCache.inventoryItems = inventoryItems;
  actorCache.inventorySize = collectionSize;
  actorCache.renderCache = createBetterInvRenderCache(inventoryItems);
  actorCache.sortedItemsByContext.clear();
  actorCache.sortedContainers = null;
  return { inventoryItems, renderCache: actorCache.renderCache, actorCache };
}

async function getBetterInvCachedSortedItems(actor, items, containerId, actorCache) {
  if (!actorCache) return sortItemsBySavedOrder(actor, items, containerId);
  const key = getContextKey(containerId);
  if (actorCache.sortedItemsByContext.has(key)) {
    noteBetterInvCacheHit();
    return actorCache.sortedItemsByContext.get(key);
  }
  noteBetterInvCacheMiss();
  const sorted = await sortItemsBySavedOrder(actor, items, containerId);
  actorCache.sortedItemsByContext.set(key, sorted);
  return sorted;
}

async function getBetterInvCachedSortedContainers(actor, containers, actorCache) {
  if (!actorCache) return sortContainersBySavedOrder(actor, containers);
  if (Array.isArray(actorCache.sortedContainers)) {
    noteBetterInvCacheHit();
    return actorCache.sortedContainers;
  }
  noteBetterInvCacheMiss();
  actorCache.sortedContainers = await sortContainersBySavedOrder(actor, containers);
  return actorCache.sortedContainers;
}

async function getBetterInvCachedCategories(actor, containerId, actorCache) {
  if (!actorCache) return getCategories(actor, containerId);
  const key = getContextKey(containerId);
  if (actorCache.categoriesByContext.has(key)) {
    noteBetterInvCacheHit();
    return actorCache.categoriesByContext.get(key);
  }
  noteBetterInvCacheMiss();
  const categories = Object.freeze([...(await getCategories(actor, containerId))]);
  actorCache.categoriesByContext.set(key, categories);
  return categories;
}

function getBetterInvCachedSubcategories(actor, containerId, categories, actorCache) {
  const key = getContextKey(containerId);
  if (actorCache?.subcategoriesByContext?.has(key)) {
    noteBetterInvCacheHit();
    return actorCache.subcategoriesByContext.get(key);
  }

  noteBetterInvCacheMiss();
  const result = new Map();
  const allSubcategories = actor?.getFlag?.(MODULE_ID, "subcategoriesByContext") ?? {};
  const contextSubcategories = allSubcategories?.[key] ?? {};
  for (const category of categories ?? []) {
    const stored = contextSubcategories?.[category];
    const clean = Array.isArray(stored)
      ? Object.freeze(stored.map(value => sanitizePlainText(value, { max: 48 })).filter(Boolean))
      : Object.freeze([]);
    result.set(category, clean);
  }
  actorCache?.subcategoriesByContext?.set(key, result);
  return result;
}

function getInventoryItems(actor) {
  return Array.from(actor?.items ?? []).filter(item => BETTER_INV_INVENTORY_TYPES.has(item.type));
}

function isContainerLike(item, renderCache = null) {
  if (!item) return false;
  if (renderCache?.containerLike?.has(item)) return renderCache.containerLike.get(item);

  let result = false;
  if (["container", "backpack"].includes(item.type)) result = true;

  // DnD5e v5+ stores real inventory containers with capacity/contents data,
  // even if not every container is shown in the sheet's short top strip.
  if (!result) {
    const capacity = foundry.utils.getProperty(item, "system.capacity");
    const contents = foundry.utils.getProperty(item, "system.contents");
    const containerType = foundry.utils.getProperty(item, "system.type.value") ?? foundry.utils.getProperty(item, "system.type");
    if (containerType === "container" || containerType === "backpack") result = true;
    else if (capacity && typeof capacity === "object") result = true;
    else if (Array.isArray(contents)) result = true;
  }

  if (!result) {
    // Conservative name fallback for common D&D containers that may be imported oddly.
    // Avoid obvious non-containers like Bagpipes, Bag of Beans, Bag of Tricks, Bag of Sand.
    const name = String(item.name ?? "").toLowerCase();
    const falseBags = ["bagpipes", "bag of beans", "bag of tricks", "bag of sand"];
    if (!falseBags.some(x => name.includes(x))) {
      result = /\b(backpack|saddlebags?|pouch|sack|chest|case|box|quiver|bag of holding|bag of devouring)\b/i.test(item.name ?? "");
    }
  }

  renderCache?.containerLike?.set(item, result);
  return result;
}

function getContainerItems(actor, inventoryItems = null, renderCache = null) {
  if (renderCache?.inventoryItems === inventoryItems && Array.isArray(renderCache.containers)) return renderCache.containers;
  const items = Array.isArray(inventoryItems) ? inventoryItems : getInventoryItems(actor);
  return items.filter(item => isContainerLike(item, renderCache));
}

function getItemContainerId(item, renderCache = null) {
  if (renderCache?.containerId?.has(item)) return renderCache.containerId.get(item);
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

  let result = null;
  for (const value of candidates) {
    if (typeof value === "string") {
      result = value;
      break;
    }
    if (typeof value === "object") {
      if (value.id) result = String(value.id);
      else if (value._id) result = String(value._id);
      else if (value.uuid) result = String(value.uuid);
      else if (value.value) result = String(value.value);
      if (result) break;
    }
  }
  renderCache?.containerId?.set(item, result);
  return result;
}

function betterInvContainerReferenceMatches(containerId, container) {
  if (!containerId || !container) return false;
  const cid = String(containerId);
  return cid === container.id || cid === container.uuid || cid.endsWith(`.${container.id}`) || cid.includes(container.id);
}

function itemIsInContainer(item, container, renderCache = null) {
  if (!container) return !getItemContainerId(item, renderCache);
  const cid = getItemContainerId(item, renderCache);
  return betterInvContainerReferenceMatches(cid, container);
}

function createBetterInvRenderCache(inventoryItems = []) {
  const items = Array.isArray(inventoryItems) ? inventoryItems : [];
  const renderCache = {
    inventoryItems: items,
    containerId: new WeakMap(),
    containerLike: new WeakMap(),
    quantity: new WeakMap(),
    weight: new WeakMap(),
    displayWeight: new WeakMap(),
    price: new WeakMap(),
    searchText: new WeakMap(),
    unidentified: new WeakMap(),
    equipped: new WeakMap(),
    favorite: new WeakMap(),
    categoryByContext: new Map(),
    contentsByContainerId: new Map(),
    containerByReference: new Map(),
    topLevelItems: [],
    containers: [],
    weightUnit: null
  };

  for (const item of items) {
    getItemContainerId(item, renderCache);
    if (isContainerLike(item, renderCache)) renderCache.containers.push(item);
  }

  for (const container of renderCache.containers) {
    renderCache.contentsByContainerId.set(container.id, []);
    for (const reference of [container.id, container.uuid].filter(Boolean)) {
      renderCache.containerByReference.set(String(reference), container);
    }
  }
  for (const item of items) {
    const containerId = getItemContainerId(item, renderCache);
    if (!containerId) {
      if (!isContainerLike(item, renderCache)) renderCache.topLevelItems.push(item);
      continue;
    }
    const reference = String(containerId);
    const lastSegment = reference.includes(".") ? reference.split(".").at(-1) : reference;
    const container = renderCache.containerByReference.get(reference)
      ?? renderCache.containerByReference.get(lastSegment)
      ?? renderCache.containers.find(candidate => betterInvContainerReferenceMatches(reference, candidate));
    if (container && item.id !== container.id) renderCache.contentsByContainerId.get(container.id)?.push(item);
  }
  return renderCache;
}

function getVisibleItems(actor, container, inventoryItems = null, renderCache = null) {
  if (renderCache && renderCache.inventoryItems === inventoryItems) {
    if (!container) return renderCache.topLevelItems;
    return renderCache.contentsByContainerId.get(container.id) ?? [];
  }
  const items = Array.isArray(inventoryItems) ? inventoryItems : getInventoryItems(actor);

  // Actor overview: container-like items are shown as cards in the backpack strip,
  // not again as normal unsorted inventory rows.
  if (!container) return items.filter(item => !getItemContainerId(item, renderCache) && !isContainerLike(item, renderCache));

  // Container view: show the contents of the selected container. If a nested
  // container is inside this container, keep it visible here as a normal item.
  return items.filter(item => item.id !== container.id && itemIsInContainer(item, container, renderCache));
}

function getContextKey(containerId) {
  return containerId ? `container:${containerId}` : "actor";
}

function betterInvPlainValuesEqual(left, right) {
  if (left === right) return true;
  try { return JSON.stringify(left) === JSON.stringify(right); }
  catch (_error) { return false; }
}

async function setBetterInvDocumentFlag(document, key, value, { skipRefresh = false } = {}) {
  if (!document || !key) return false;
  const current = document.getFlag?.(MODULE_ID, key);
  if (betterInvPlainValuesEqual(current, value)) return false;
  if (!skipRefresh) {
    await document.setFlag(MODULE_ID, key, value);
    return true;
  }
  await document.update({ [`flags.${MODULE_ID}.${key}`]: value }, { betterInvSkipRefresh: true });
  return true;
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

async function setSubcategories(actor, parentCategory, subcategories, containerId = null, { skipRefresh = false } = {}) {
  if (!actor || !parentCategory || parentCategory === "__unsorted") return;
  const all = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "subcategoriesByContext") ?? {});
  const ctx = getContextKey(containerId);
  all[ctx] ??= {};
  all[ctx][parentCategory] = [...new Set(subcategories.map(c => sanitizePlainText(c, { max: 48 })).filter(Boolean))];
  await setBetterInvDocumentFlag(actor, "subcategoriesByContext", all, { skipRefresh });
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
  if (!subName || !actor || parentCategory === "__unsorted") return false;
  const subs = await getSubcategories(actor, parentCategory, containerId);
  if (subs.includes(subName)) { ui.notifications.warn("Diese Unterkategorie gibt es schon."); return false; }
  await setSubcategories(actor, parentCategory, [...subs, subName], containerId);
  return true;
}

async function renameSubcategory(actor, parentCategory, oldSub, newSub, containerId = null) {
  newSub = sanitizePlainText(newSub, { max: 48 });
  if (!newSub || !actor || parentCategory === "__unsorted") return false;
  const subs = await getSubcategories(actor, parentCategory, containerId);
  if (subs.includes(newSub) && newSub !== oldSub) { ui.notifications.warn("Diese Unterkategorie gibt es schon."); return false; }
  await setSubcategories(actor, parentCategory, subs.map(s => s === oldSub ? newSub : s), containerId);
  const oldId = makeSubcategoryId(parentCategory, oldSub);
  const newId = makeSubcategoryId(parentCategory, newSub);
  for (const item of getInventoryItems(actor)) {
    if (itemCategory(item, containerId) === oldId) await setItemCategory(item, newId, containerId);
  }
  return true;
}

async function deleteSubcategory(actor, parentCategory, subName, containerId = null) {
  if (!actor || parentCategory === "__unsorted") return false;
  const confirmed = await openBetterInvConfirmDialog({
    title: "Unterkategorie löschen",
    kicker: "Unterkategorie entfernen",
    icon: "fa-folder-minus",
    danger: true,
    confirmLabel: "Löschen",
    contentHtml: `<p><strong>${escapeHtml(subName)}</strong> wirklich löschen?</p>`,
    note: `Enthaltene Items werden nach ${parentCategory} verschoben.`
  });
  if (!confirmed) return false;
  const subs = (await getSubcategories(actor, parentCategory, containerId)).filter(s => s !== subName);
  await setSubcategories(actor, parentCategory, subs, containerId);
  const oldId = makeSubcategoryId(parentCategory, subName);
  for (const item of getInventoryItems(actor)) {
    if (itemCategory(item, containerId) === oldId) await setItemCategory(item, parentCategory, containerId);
  }
  return true;
}

async function getCategoryOrder(actor, containerId = null, categories = null) {
  const ctx = getContextKey(containerId);
  const all = actor?.getFlag(MODULE_ID, "categoryOrderByContext") ?? {};
  const existing = Array.isArray(all[ctx]) ? all[ctx] : [];
  const known = ["__unsorted", ...(categories ?? await getCategories(actor, containerId))];
  return [...existing.filter(id => known.includes(id)), ...known.filter(id => !existing.includes(id))];
}

async function setCategoryOrder(actor, order, containerId = null, { skipRefresh = false } = {}) {
  if (!actor) return;
  const categories = await getCategories(actor, containerId);
  const valid = ["__unsorted", ...categories];
  const clean = [...new Set(order.filter(id => valid.includes(id)))];
  const finalOrder = [...clean, ...valid.filter(id => !clean.includes(id))];
  const all = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "categoryOrderByContext") ?? {});
  all[getContextKey(containerId)] = finalOrder;
  await setBetterInvDocumentFlag(actor, "categoryOrderByContext", all, { skipRefresh });
}

async function renameCategory(actor, oldName, newName, containerId = null) {
  if (!actor || oldName === "__unsorted") return false;
  newName = sanitizePlainText(newName, { max: 48 });
  if (!newName) return false;
  const categories = await getCategories(actor, containerId);
  if (categories.includes(newName) && newName !== oldName) { ui.notifications.warn("Diese Kategorie gibt es schon."); return false; }
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
  return true;
}

async function deleteCategory(actor, categoryName, containerId = null) {
  if (!actor || categoryName === "__unsorted") return false;
  const confirmed = await openBetterInvConfirmDialog({
    title: "Kategorie löschen",
    kicker: "Kategorie entfernen",
    icon: "fa-folder-minus",
    danger: true,
    confirmLabel: "Löschen",
    contentHtml: `<p><strong>${escapeHtml(categoryName)}</strong> wirklich löschen?</p>`,
    note: "Enthaltene Items werden nach Unsortiert verschoben."
  });
  if (!confirmed) return false;
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
  return true;
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

function isBetterInvUnidentified(item, renderCache = null) {
  if (renderCache?.unidentified?.has(item)) return renderCache.unidentified.get(item);
  const identification = getItemIdentificationData(item);
  const result = identification.supported && !identification.identified;
  renderCache?.unidentified?.set(item, result);
  return result;
}

function itemCategory(item, containerId = null, renderCache = null) {
  const ctx = getContextKey(containerId);
  const cacheKey = `${ctx}:${item?.id ?? ""}`;
  if (renderCache?.categoryByContext?.has(cacheKey)) return renderCache.categoryByContext.get(cacheKey);
  const all = item.getFlag(MODULE_ID, "categoryByContext") ?? {};
  const explicit = all[ctx];
  const result = explicit || (isBetterInvUnidentified(item, renderCache) ? "__unknown" : "__unsorted");
  renderCache?.categoryByContext?.set(cacheKey, result);
  return result;
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

async function setItemOrder(actor, itemIds, containerId = null, { skipRefresh = false } = {}) {
  if (!actor) return;
  const all = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "itemOrderByContext") ?? {});
  all[getContextKey(containerId)] = [...new Set(itemIds.filter(Boolean))];
  await setBetterInvDocumentFlag(actor, "itemOrderByContext", all, { skipRefresh });
}

async function getContainerOrder(actor) {
  const order = actor?.getFlag(MODULE_ID, "containerOrder") ?? [];
  return Array.isArray(order) ? order : [];
}

async function setContainerOrder(actor, containerIds, { skipRefresh = false } = {}) {
  if (!actor) return;
  await setBetterInvDocumentFlag(actor, "containerOrder", [...new Set(containerIds.filter(Boolean))], { skipRefresh });
}

async function getContainerLayerCount(actor) {
  const n = Number(actor?.getFlag(MODULE_ID, "containerLayerCount") ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(12, Math.max(1, Math.round(n))) : null;
}

async function setContainerLayerCount(actor, count, { skipRefresh = false } = {}) {
  if (!actor) return;
  const clean = Math.min(12, Math.max(1, Math.round(Number(count) || 1)));
  await setBetterInvDocumentFlag(actor, "containerLayerCount", clean, { skipRefresh });
}

async function getContainerLayerMap(actor) {
  const map = actor?.getFlag(MODULE_ID, "containerLayerMap") ?? {};
  return map && typeof map === "object" && !Array.isArray(map) ? map : {};
}

async function setContainerLayerMap(actor, map, { skipRefresh = false } = {}) {
  if (!actor) return;
  const clean = {};
  for (const [id, row] of Object.entries(map ?? {})) {
    const n = Math.round(Number(row));
    if (id && Number.isFinite(n) && n >= 0) clean[id] = n;
  }
  await setBetterInvDocumentFlag(actor, "containerLayerMap", clean, { skipRefresh });
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
    closeBetterInvCategoryMenu();
    disposeBetterInvWindowEventCycle(existing);
    closeBetterInvPerformanceWindow();
    existing.remove();
    return;
  }
  betterInvState.containerId = null;
  renderBetterInvWindow();
}

function mergeBetterInvRenderOptions(current = null, incoming = {}) {
  if (!current) return { preserveScroll: incoming?.preserveScroll !== false };
  return {
    preserveScroll: current.preserveScroll !== false && incoming?.preserveScroll !== false
  };
}

function renderBetterInvWindow(options = {}) {
  const normalized = mergeBetterInvRenderOptions(null, options);
  if (betterInvRenderPromise) {
    betterInvQueuedRenderOptions = mergeBetterInvRenderOptions(betterInvQueuedRenderOptions, normalized);
    return betterInvRenderPromise;
  }

  // Start in a microtask so the promise guard is assigned before rendering
  // begins. Otherwise a synchronous nested render request could start a second
  // render worker before betterInvRenderPromise receives its value.
  betterInvRenderPromise = Promise.resolve().then(async () => {
    let nextOptions = normalized;
    while (nextOptions) {
      betterInvQueuedRenderOptions = null;
      await performBetterInvWindowRender(nextOptions);
      nextOptions = betterInvQueuedRenderOptions;
    }
  }).finally(() => {
    betterInvRenderPromise = null;
    betterInvQueuedRenderOptions = null;
  });
  return betterInvRenderPromise;
}

function applyBetterInvScale(windowEl) {
  if (!windowEl) return;
  const scale = Math.min(1.35, Math.max(0.65, Number(betterInvState.scale) || 1));
  windowEl.style.setProperty("--bi-content-scale", String(scale));
  const content = windowEl.querySelector?.(".betterinv-content");
  if (content) content.style.zoom = String(scale);
}

async function performBetterInvWindowRender({ preserveScroll = true } = {}) {
  const performanceSample = beginBetterInvPerformanceSample();
  let performanceWindowEl = document.getElementById("betterinv-window");
  try {
  cancelScheduledBetterInvRefresh();
  const renderSequence = ++betterInvRenderSequence;
  closeBetterInvItemActionMenu();
  closeBetterInvCategoryMenu();
  let windowEl = performanceWindowEl;
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
  performanceWindowEl = windowEl;
  applyBetterInvScale(windowEl);

  const userSettings = getBetterInvUserSettings();
  const features = getBetterInvFeaturePlan(userSettings);
  if (!features.enabled) {
    closeBetterInvSettingsWindow();
    windowEl.classList.add("betterinv-disabled-mode");
    windowEl.innerHTML = betterInvDisabledShellHtml();
    const eventController = beginBetterInvWindowEventCycle(windowEl);
    addBetterInvEventListener(windowEl.querySelector(".betterinv-close"), "click", () => {
      disposeBetterInvWindowEventCycle(windowEl);
      closeBetterInvPerformanceWindow();
      windowEl.remove();
    }, eventController);
    addBetterInvEventListener(windowEl.querySelector(".betterinv-reactivate"), "click", async event => {
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
    }, eventController);
    makeBetterInvDraggable(windowEl);
    performanceSample.mode = "disabled";
    markBetterInvPerformancePhase(performanceSample, "domCommitted");
    markBetterInvPerformancePhase(performanceSample, "listenersReady");
    performanceSample.committed = true;
    return;
  }

  windowEl.classList.remove("betterinv-disabled-mode");
  const actor = getCurrentActor();
  markBetterInvPerformancePhase(performanceSample, "contextReady");

  if (!actor && game.user.isGM) {
    const actors = getSelectablePlayerActors();
    windowEl.innerHTML = baseShellHtml(actorChooserHtml(actors));
    markBetterInvPerformancePhase(performanceSample, "domCommitted");
    activateWindowListeners(windowEl, null, null);
    markBetterInvPerformancePhase(performanceSample, "listenersReady");
    performanceSample.mode = "actor-chooser";
    performanceSample.committed = true;
    return;
  }

  if (!actor) {
    windowEl.innerHTML = baseShellHtml(`
      <p>Kein Token ausgewählt und kein Charakter deinem User zugeordnet.</p>
      <p class="betterinv-hint">Wähle einen Token auf der Map aus oder ordne deinem User einen Charakter zu.</p>
    `);
    markBetterInvPerformancePhase(performanceSample, "domCommitted");
    activateWindowListeners(windowEl, actor, null);
    markBetterInvPerformancePhase(performanceSample, "listenersReady");
    performanceSample.mode = "no-actor";
    performanceSample.committed = true;
    return;
  }

  if (!features.containers) betterInvState.containerId = null;
  const currentContainer = features.containers && betterInvState.containerId
    ? actor.items.get(betterInvState.containerId)
    : null;
  if (betterInvState.containerId && !currentContainer) betterInvState.containerId = null;
  const activeContainer = features.containers && betterInvState.containerId ? currentContainer : null;
  const query = features.search ? String(betterInvState.search ?? "").trim().toLowerCase() : "";

  // Reuse the immutable parts of the actor inventory between UI-only renders
  // such as search, settings and window changes. Actor/Item hooks invalidate
  // the relevant cache scope before Foundry schedules a fresh render.
  const actorDataCache = (features.needsInventoryCollection || features.categories)
    ? getBetterInvActorDataCache(actor)
    : null;
  const inventoryContext = features.needsInventoryCollection
    ? getBetterInvCachedInventoryContext(actor, actorDataCache)
    : { inventoryItems: null, renderCache: createBetterInvRenderCache([]), actorCache: actorDataCache };
  const inventoryItems = inventoryContext.inventoryItems;
  const renderCache = inventoryContext.renderCache;
  const contextContainerId = activeContainer?.id ?? null;
  const visibleInventoryItems = features.items
    ? getVisibleItems(actor, activeContainer, inventoryItems, renderCache)
    : [];
  const containerItems = features.containers
    ? getContainerItems(actor, inventoryItems, renderCache)
    : [];
  const [allVisibleItems, containers, categories] = await Promise.all([
    features.items
      ? getBetterInvCachedSortedItems(actor, visibleInventoryItems, contextContainerId, actorDataCache)
      : Promise.resolve([]),
    features.containers
      ? getBetterInvCachedSortedContainers(actor, containerItems, actorDataCache)
      : Promise.resolve([]),
    features.categories
      ? getBetterInvCachedCategories(actor, contextContainerId, actorDataCache)
      : Promise.resolve([])
  ]);
  markBetterInvPerformancePhase(performanceSample, "dataReady");
  performanceSample.itemCount = allVisibleItems.length;
  performanceSample.containerCount = containers.length;
  performanceSample.categoryCount = categories.length;
  if (renderSequence !== betterInvRenderSequence || !windowEl.isConnected) return;

  const visibleItems = query && features.items
    ? allVisibleItems.filter(item => itemMatchesSearch(item, query, renderCache))
    : allVisibleItems;

  // Normalized subcategories are cached per actor/context and invalidated as
  // soon as their Foundry flag changes.
  const subcategoriesByCategory = features.subcategories
    ? getBetterInvCachedSubcategories(actor, contextContainerId, categories, actorDataCache)
    : new Map();

  let categoryOptions = [];
  if (features.categoryDropdown) {
    categoryOptions = ["__unknown", "__unsorted"];
    for (const category of categories) {
      categoryOptions.push(category);
      for (const subcategory of subcategoriesByCategory.get(category) ?? []) {
        categoryOptions.push(makeSubcategoryId(category, subcategory));
      }
    }
  }
  if (!features.unknownItems) categoryOptions = categoryOptions.filter(id => id !== "__unknown");

  const topContainerHtml = features.containers
    ? (!activeContainer
      ? await renderContainerCards(actor, containers, {
          showCapacity: features.containerCapacity,
          inventoryItems,
          renderCache
        })
      : renderContainerBreadcrumb(actor, activeContainer, {
          showCapacity: features.containerCapacity,
          showCount: features.items,
          inventoryItems,
          renderCache
        }))
    : "";
  if (renderSequence !== betterInvRenderSequence || !windowEl.isConnected) return;

  const actorEncumbranceHtml = (!activeContainer && features.encumbrance)
    ? betterInvActorEncumbranceHtml(getBetterInvActorEncumbrance(actor, { inventoryItems, renderCache }))
    : "";
  const actorCurrencyHtml = features.currency ? betterInvActorCurrencyHtml(
    getBetterInvActorCurrency(actor),
    features.currencyCalculator ? getBetterInvCurrencyDraft(actor) : {},
    {
      editable: actor.isOwner !== false && !isBetterInvCurrencyTransactionPending(actor),
      showCalculator: features.currencyCalculator,
      showTransfer: features.currencyTransfer
    }
  ) : "";
  const searchContainersHtml = (features.containers && features.search && !activeContainer && query)
    ? renderSearchContainerHits(actor, containers, query, { inventoryItems, renderCache })
    : "";

  // Resolve each item's display category exactly once, then index items by
  // category. This avoids repeatedly filtering the whole inventory for every
  // category and every subcategory.
  const itemDisplayCategory = new Map();
  const unknownItems = [];
  const regularItems = [];
  const favoriteItems = [];
  for (const item of visibleItems) {
    if (features.favorites && isBetterInvFavorite(item, renderCache)) favoriteItems.push(item);
    const rawCategory = itemCategory(item, contextContainerId, renderCache);
    if (features.unknownItems && rawCategory === "__unknown") {
      unknownItems.push(item);
      continue;
    }
    let displayCategory = rawCategory;
    if (displayCategory === "__unknown") displayCategory = "__unsorted";
    if (!features.subcategories && String(displayCategory).includes("::")) {
      displayCategory = parseCategoryId(displayCategory).parent;
    }
    itemDisplayCategory.set(item.id, displayCategory);
    regularItems.push(item);
  }

  const regularItemsByCategory = new Map();
  const nestedItemsByParentCategory = new Map();
  for (const item of regularItems) {
    const category = itemDisplayCategory.get(item.id) ?? "__unsorted";
    const bucket = regularItemsByCategory.get(category);
    if (bucket) bucket.push(item);
    else regularItemsByCategory.set(category, [item]);

    if (String(category).includes("::")) {
      const parent = parseCategoryId(category).parent;
      const parentBucket = nestedItemsByParentCategory.get(parent);
      if (parentBucket) parentBucket.push(item);
      else nestedItemsByParentCategory.set(parent, [item]);
    }
  }
  let sectionHtml = "";
  if (features.categories) {
    const order = await getCategoryOrder(actor, contextContainerId, categories);
    if (renderSequence !== betterInvRenderSequence || !windowEl.isConnected) return;
    const sectionNames = new Map([["__unsorted", "Unsortiert"], ...categories.map(c => [c, c])]);
    const sections = order.map(id => ({ id, name: sectionNames.get(id) })).filter(s => s.name);
    const sectionHtmlParts = [];

    for (const section of sections) {
      const directItems = regularItemsByCategory.get(section.id) ?? [];
      const subs = features.subcategories && section.id !== "__unsorted"
        ? (subcategoriesByCategory.get(section.id) ?? [])
        : [];
      const categoryItems = section.id === "__unsorted"
        ? directItems
        : directItems.concat(nestedItemsByParentCategory.get(section.id) ?? []);
      const rows = directItems.length
        ? directItems.map(item => itemRowHtml(item, categoryOptions, contextContainerId, { settings: userSettings, features, renderCache })).join("")
        : "";

      let subcategoryHtml = "";
      if (subs.length) {
        subcategoryHtml = subs.map(sub => {
          const subId = makeSubcategoryId(section.id, sub);
          const subItems = regularItemsByCategory.get(subId) ?? [];
          const subRows = subItems.length
            ? subItems.map(item => itemRowHtml(item, categoryOptions, contextContainerId, { settings: userSettings, features, renderCache })).join("")
            : "";
          return `
            <details class="betterinv-subcategory" open draggable="true" data-parent-category="${escapeAttr(section.id)}" data-category="${escapeAttr(subId)}" data-subcategory="${escapeAttr(sub)}">
              <summary>
                <span class="betterinv-sub-grip" title="Unterkategorie verschieben">☰</span>
                <span class="betterinv-sub-indent">↳</span>
                <span class="betterinv-category-name">${escapeHtml(sub)}</span>
                ${features.categoryWeights ? betterInvCategoryWeightHtml(subItems, "Unterkategoriegewicht", renderCache) : ""}
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
            ${features.categoryWeights ? betterInvCategoryWeightHtml(categoryItems, "Kategoriegewicht", renderCache) : ""}
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
      ? regularItems.map(item => itemRowHtml(item, categoryOptions, contextContainerId, { settings: userSettings, features, renderCache })).join("")
      : "";
    sectionHtml = `
      <section class="betterinv-system-category betterinv-flat-category">
        <div class="betterinv-unknown-header">
          <span class="betterinv-category-name">Items</span>
          ${features.categoryWeights ? betterInvCategoryWeightHtml(regularItems, "Gesamtgewicht der angezeigten Items", renderCache) : ""}
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
        ${features.categoryWeights ? betterInvCategoryWeightHtml(unknownItems, "Gewicht unbekannter Items", renderCache) : ""}
        <span class="betterinv-category-count">${unknownItems.length}</span>
      </div>
      <div class="betterinv-items betterinv-unknown-items">
        ${unknownItems.map(item => itemRowHtml(item, categoryOptions, contextContainerId, { settings: userSettings, features, renderCache })).join("")}
      </div>
    </section>` : "";

  const favoritesHtml = favoriteItems.length ? `
    <section class="betterinv-favorites">
      <div class="betterinv-favorites-header">
        <span class="betterinv-favorites-icon" aria-hidden="true">★</span>
        <span class="betterinv-category-name">Favoriten</span>
        <span class="betterinv-category-count">${favoriteItems.length}</span>
      </div>
      <div class="betterinv-items betterinv-favorite-items">
        ${favoriteItems.map(item => favoriteItemRowHtml(item, { settings: userSettings, features, renderCache })).join("")}
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

  markBetterInvPerformancePhase(performanceSample, "htmlReady");
  if (renderSequence !== betterInvRenderSequence || !windowEl.isConnected) return;

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

  markBetterInvPerformancePhase(performanceSample, "domCommitted");
  activateWindowListeners(windowEl, actor, activeContainer, { settings: userSettings, features, inventoryItems, categoryOptions, renderCache });
  markBetterInvPerformancePhase(performanceSample, "listenersReady");
  performanceSample.committed = true;
  windowEl.dataset.betterInvRenderedSearch = String(betterInvState.search ?? "");
  applyBetterInvScale(windowEl);
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
  } finally {
    finishBetterInvPerformanceSample(performanceSample, performanceWindowEl);
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
  const settingsWindow = document.getElementById("betterinv-settings-window");
  settingsWindow?._betterInvDragController?.abort?.();
  settingsWindow?.remove();
  updateBetterInvSettingsButtonState();
}

function getBetterInvSettingsGroupKeys(group) {
  return Array.from(group?.settings ?? [])
    .filter(([, , , options = {}]) => !options.disabled)
    .map(([key]) => key)
    .filter(key => key && Object.prototype.hasOwnProperty.call(DEFAULT_BETTER_INV_USER_SETTINGS, key));
}

function getBetterInvAllFeatureSettingKeys() {
  return Array.from(new Set(BETTER_INV_SETTINGS_GROUPS.flatMap(group => getBetterInvSettingsGroupKeys(group))));
}

function getBetterInvSettingsGroupState(group, userSettings) {
  const keys = getBetterInvSettingsGroupKeys(group);
  const enabledCount = keys.filter(key => userSettings?.[key] !== false).length;
  return {
    keys,
    checked: keys.length > 0 && enabledCount === keys.length,
    indeterminate: enabledCount > 0 && enabledCount < keys.length
  };
}

function syncBetterInvSettingsControls(settingsWindow, userSettings = getBetterInvUserSettings()) {
  if (!settingsWindow) return;
  settingsWindow.querySelectorAll(".betterinv-setting-toggle[data-setting-key]").forEach(input => {
    const key = String(input.dataset.settingKey ?? "");
    if (!key) return;
    input.checked = userSettings[key] !== false;
  });

  settingsWindow.querySelectorAll(".betterinv-settings-group-toggle[data-setting-group]").forEach(input => {
    const groupId = String(input.dataset.settingGroup ?? "");
    const group = BETTER_INV_SETTINGS_GROUPS.find(entry => entry.id === groupId);
    if (!group) return;
    const state = getBetterInvSettingsGroupState(group, userSettings);
    input.checked = state.checked;
    input.indeterminate = state.indeterminate;
    input.setAttribute("aria-checked", state.indeterminate ? "mixed" : String(state.checked));
  });
}

function betterInvSettingsGroupsHtml(userSettings) {
  return BETTER_INV_SETTINGS_GROUPS.map(group => {
    const groupState = getBetterInvSettingsGroupState(group, userSettings);
    return `
      <section class="betterinv-settings-group" data-setting-group-section="${escapeAttr(group.id)}">
        <div class="betterinv-settings-group-header">
          <h3><i class="fas ${escapeAttr(group.icon ?? "fa-sliders-h")}" aria-hidden="true"></i>${escapeHtml(group.title)}</h3>
          ${groupState.keys.length > 1 ? `<label class="betterinv-settings-group-master" title="Alle Einstellungen in ${escapeAttr(group.title)} gleichzeitig umschalten">
            <span>Alles</span>
            <input type="checkbox" class="betterinv-settings-group-toggle" data-setting-group="${escapeAttr(group.id)}" ${groupState.checked ? "checked" : ""} aria-label="${escapeAttr(`${group.title} vollständig aktivieren oder deaktivieren`)}">
          </label>` : ""}
        </div>
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
      </section>`;
  }).join("");
}

function getBetterInvAverage(values) {
  const clean = Array.from(values ?? []).map(Number).filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function getBetterInvPercentile(values, percentile = 0.95) {
  const clean = Array.from(values ?? []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const index = Math.min(clean.length - 1, Math.max(0, Math.ceil(clean.length * percentile) - 1));
  return clean[index];
}

function formatBetterInvMilliseconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "–";
  return `${number < 10 ? number.toFixed(1) : Math.round(number)} ms`;
}

function formatBetterInvBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "nicht verfügbar";
  const units = ["B", "KB", "MB", "GB"];
  let amount = bytes;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : amount < 10 ? 2 : amount < 100 ? 1 : 0;
  return `${amount.toFixed(digits)} ${units[unitIndex]}`;
}

function getBetterInvPerformanceRating(avgRenderMs) {
  if (!Number.isFinite(avgRenderMs)) return { label: "Noch keine Messung", className: "is-neutral" };
  if (avgRenderMs <= 16.7) return { label: "Sehr flüssig", className: "is-good" };
  if (avgRenderMs <= 33.4) return { label: "Flüssig", className: "is-good" };
  if (avgRenderMs <= 60) return { label: "Beobachten", className: "is-warn" };
  return { label: "Optimierung nötig", className: "is-bad" };
}

function getBetterInvPerformanceSnapshot() {
  const allRenders = betterInvPerformanceState.renders;
  const inventoryRenders = allRenders.filter(entry => entry.mode === "inventory");
  const renders = inventoryRenders.length ? inventoryRenders : allRenders;
  const last = renders.at(-1) ?? null;
  const renderTimes = renders.map(entry => entry.totalMs);
  const lagValues = betterInvPerformanceState.eventLoopLag;
  const avgRenderMs = getBetterInvAverage(renderTimes);
  return {
    last,
    sampleCount: renders.length,
    avgRenderMs,
    p95RenderMs: getBetterInvPercentile(renderTimes, 0.95),
    worstRenderMs: renderTimes.length ? Math.max(...renderTimes) : null,
    avgEventLoopLagMs: getBetterInvAverage(lagValues),
    worstEventLoopLagMs: lagValues.length ? Math.max(...lagValues) : null,
    heapUsed: getBetterInvHeapUsed(),
    refreshRequests: betterInvPerformanceState.refreshRequests,
    refreshFrames: betterInvPerformanceState.refreshFrames,
    coalescedRefreshRequests: betterInvPerformanceState.coalescedRefreshRequests,
    discardedRenders: betterInvPerformanceState.discardedRenders,
    activeDelegatedListeners: betterInvPerformanceState.activeDelegatedListeners,
    cacheHits: betterInvPerformanceState.cacheHits,
    cacheMisses: betterInvPerformanceState.cacheMisses,
    cacheInvalidations: betterInvPerformanceState.cacheInvalidations,
    cacheEntries: betterInvActorDataCaches.size,
    rating: getBetterInvPerformanceRating(avgRenderMs)
  };
}

function betterInvPerformanceMetricHtml(label, value, hint = "") {
  return `
    <div class="betterinv-performance-metric"${hint ? ` title="${escapeAttr(hint)}"` : ""}>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>`;
}

function betterInvPerformanceContentHtml() {
  const snapshot = getBetterInvPerformanceSnapshot();
  const last = snapshot.last;
  const memoryDelta = last?.heapDelta;
  const memoryDeltaText = Number.isFinite(memoryDelta)
    ? `${memoryDelta >= 0 ? "+" : "−"}${formatBetterInvBytes(Math.abs(memoryDelta))}`
    : "nicht verfügbar";

  return `
    <section class="betterinv-performance-summary">
      <div>
        <strong>Aktueller Zustand</strong>
        <small>${snapshot.sampleCount} von maximal ${BETTER_INV_PERFORMANCE_SAMPLE_LIMIT} Render-Messungen im Arbeitsspeicher</small>
      </div>
      <span class="betterinv-performance-rating ${escapeAttr(snapshot.rating.className)}">${escapeHtml(snapshot.rating.label)}</span>
    </section>

    <section class="betterinv-performance-section">
      <h3><i class="fas fa-stopwatch" aria-hidden="true"></i>Renderzeiten</h3>
      <div class="betterinv-performance-grid">
        ${betterInvPerformanceMetricHtml("Letzter Render", formatBetterInvMilliseconds(last?.totalMs))}
        ${betterInvPerformanceMetricHtml("Durchschnitt", formatBetterInvMilliseconds(snapshot.avgRenderMs))}
        ${betterInvPerformanceMetricHtml("95. Perzentil", formatBetterInvMilliseconds(snapshot.p95RenderMs), "95 Prozent der gespeicherten Render-Vorgänge waren höchstens so langsam.")}
        ${betterInvPerformanceMetricHtml("Langsamster Render", formatBetterInvMilliseconds(snapshot.worstRenderMs))}
      </div>
      <div class="betterinv-performance-phases">
        ${betterInvPerformanceMetricHtml("Daten", formatBetterInvMilliseconds(last?.dataMs))}
        ${betterInvPerformanceMetricHtml("HTML", formatBetterInvMilliseconds(last?.htmlMs))}
        ${betterInvPerformanceMetricHtml("DOM", formatBetterInvMilliseconds(last?.domMs))}
        ${betterInvPerformanceMetricHtml("Listener", formatBetterInvMilliseconds(last?.listenersMs))}
      </div>
    </section>

    <section class="betterinv-performance-section">
      <h3><i class="fas fa-sitemap" aria-hidden="true"></i>Inventar-DOM</h3>
      <div class="betterinv-performance-grid">
        ${betterInvPerformanceMetricHtml("DOM-Knoten", String(last?.domNodes ?? "–"))}
        ${betterInvPerformanceMetricHtml("Itemzeilen", String(last?.itemRows ?? "–"))}
        ${betterInvPerformanceMetricHtml("Kategorien", String(last?.categoryNodes ?? "–"))}
        ${betterInvPerformanceMetricHtml("Rucksackkarten", String(last?.containerCards ?? "–"))}
        ${betterInvPerformanceMetricHtml("Aktive Listener", String(last?.delegatedListeners ?? snapshot.activeDelegatedListeners), "Gezählt werden die zentral verwalteten Listener des Inventarfensters.")}
        ${betterInvPerformanceMetricHtml("Verworfene Render", String(snapshot.discardedRenders), "Veraltete Render-Vorgänge, die absichtlich nicht mehr in das Fenster geschrieben wurden.")}
      </div>
    </section>

    <section class="betterinv-performance-section">
      <h3><i class="fas fa-sync-alt" aria-hidden="true"></i>Aktualisierungen</h3>
      <div class="betterinv-performance-grid">
        ${betterInvPerformanceMetricHtml("Anfragen", String(snapshot.refreshRequests))}
        ${betterInvPerformanceMetricHtml("Ausgeführte Frames", String(snapshot.refreshFrames))}
        ${betterInvPerformanceMetricHtml("Zusammengefasst", String(snapshot.coalescedRefreshRequests), "Mehrere Aktualisierungen, die zu einem einzigen Render zusammengefasst wurden.")}
        ${betterInvPerformanceMetricHtml("Event-Loop Ø", formatBetterInvMilliseconds(snapshot.avgEventLoopLagMs), "Verzögerung des gesamten Foundry-Browserfensters während diese Diagnose geöffnet ist.")}
        ${betterInvPerformanceMetricHtml("Event-Loop Maximum", formatBetterInvMilliseconds(snapshot.worstEventLoopLagMs), "Dieser Wert betrifft das gesamte Foundry-Fenster und nicht ausschließlich Axon’s Inventory.")}
      </div>
    </section>

    <section class="betterinv-performance-section">
      <h3><i class="fas fa-database" aria-hidden="true"></i>Caching</h3>
      <div class="betterinv-performance-grid">
        ${betterInvPerformanceMetricHtml("Treffer", String(snapshot.cacheHits), "Bereits berechnete Inventardaten, die bei einem späteren Render wiederverwendet wurden.")}
        ${betterInvPerformanceMetricHtml("Neu berechnet", String(snapshot.cacheMisses), "Cache-Bereiche, die noch nicht vorhanden oder zuvor ungültig geworden waren.")}
        ${betterInvPerformanceMetricHtml("Ungültig gemacht", String(snapshot.cacheInvalidations), "Gezielte Cache-Löschungen nach relevanten Actor- oder Itemänderungen.")}
        ${betterInvPerformanceMetricHtml("Actor-Caches", `${snapshot.cacheEntries}/${BETTER_INV_ACTOR_CACHE_LIMIT}`, "Der Cache behält höchstens einige zuletzt verwendete Actors und entfernt ältere automatisch.")}
      </div>
    </section>

    <section class="betterinv-performance-section">
      <h3><i class="fas fa-memory" aria-hidden="true"></i>Arbeitsspeicher</h3>
      <div class="betterinv-performance-grid">
        ${betterInvPerformanceMetricHtml("JS-Heap aktuell", formatBetterInvBytes(snapshot.heapUsed), "Wird nicht von jedem Browser bereitgestellt.")}
        ${betterInvPerformanceMetricHtml("Letzter Render Δ", memoryDeltaText, "Ungefähre Heap-Veränderung während des letzten Render-Vorgangs.")}
      </div>
      <p class="betterinv-performance-note">Ein exakter CPU-Prozentsatz ist innerhalb eines Browser-Moduls nicht zuverlässig verfügbar. Deshalb misst die Diagnose Renderzeiten und Verzögerungen des Hauptthreads. RAM-Werte erscheinen nur, wenn dein Foundry-Browser sie bereitstellt.</p>
    </section>`;
}

function updateBetterInvPerformanceWindow() {
  const windowEl = document.getElementById("betterinv-performance-window");
  const content = windowEl?.querySelector?.(".betterinv-performance-content");
  if (!content) return;
  const scrollTop = content.scrollTop;
  content.innerHTML = betterInvPerformanceContentHtml();
  content.scrollTop = scrollTop;
}

function startBetterInvPerformanceMonitor() {
  if (betterInvPerformanceState.monitorTimer !== null) return;
  const intervalMs = 1000;
  betterInvPerformanceState.monitorLastTick = getBetterInvPerformanceNow();
  betterInvPerformanceState.monitorTimer = window.setInterval(() => {
    const now = getBetterInvPerformanceNow();
    const previous = betterInvPerformanceState.monitorLastTick ?? now;
    const lag = Math.max(0, now - previous - intervalMs);
    betterInvPerformanceState.monitorLastTick = now;
    betterInvPerformanceState.eventLoopLag.push(lag);
    if (betterInvPerformanceState.eventLoopLag.length > BETTER_INV_EVENT_LOOP_SAMPLE_LIMIT) {
      betterInvPerformanceState.eventLoopLag.splice(0, betterInvPerformanceState.eventLoopLag.length - BETTER_INV_EVENT_LOOP_SAMPLE_LIMIT);
    }
    updateBetterInvPerformanceWindow();
  }, intervalMs);
}

function stopBetterInvPerformanceMonitor() {
  if (betterInvPerformanceState.monitorTimer !== null) clearInterval(betterInvPerformanceState.monitorTimer);
  betterInvPerformanceState.monitorTimer = null;
  betterInvPerformanceState.monitorLastTick = null;
}

function closeBetterInvPerformanceWindow() {
  const windowEl = document.getElementById("betterinv-performance-window");
  windowEl?._betterInvDragController?.abort?.();
  windowEl?.remove();
  stopBetterInvPerformanceMonitor();
}

function openBetterInvPerformanceWindow() {
  const existing = document.getElementById("betterinv-performance-window");
  if (existing) {
    existing.style.zIndex = "20030";
    updateBetterInvPerformanceWindow();
    return existing;
  }

  const windowEl = document.createElement("section");
  windowEl.id = "betterinv-performance-window";
  windowEl.className = "betterinv-settings-window betterinv-performance-window";
  windowEl.innerHTML = `
    <header class="betterinv-settings-window-header">
      <div>
        <strong>Performance-Diagnose</strong>
        <small>Lokale Live-Messung für Axon’s Inventory</small>
      </div>
      <div class="betterinv-performance-header-actions">
        <button type="button" class="betterinv-performance-reset" title="Messwerte zurücksetzen" aria-label="Messwerte zurücksetzen"><i class="fas fa-undo" aria-hidden="true"></i></button>
        <button type="button" class="betterinv-performance-close betterinv-settings-close" title="Diagnose schließen" aria-label="Diagnose schließen">×</button>
      </div>
    </header>
    <div class="betterinv-settings-window-scroll betterinv-performance-content">${betterInvPerformanceContentHtml()}</div>
    <footer class="betterinv-settings-window-footer">
      <i class="fas fa-shield-alt" aria-hidden="true"></i>
      <span>Die Messwerte bleiben nur in dieser Sitzung und werden nirgendwohin übertragen.</span>
    </footer>`;

  const settingsWindow = document.getElementById("betterinv-settings-window");
  const anchorRect = settingsWindow?.getBoundingClientRect?.() ?? document.getElementById("betterinv-window")?.getBoundingClientRect?.();
  const width = 440;
  let left = anchorRect ? anchorRect.right + 12 : Math.max(10, window.innerWidth - width - 24);
  if (left + width > window.innerWidth - 10 && anchorRect) left = Math.max(10, anchorRect.left - width - 12);
  windowEl.style.left = `${Math.max(10, left)}px`;
  windowEl.style.top = `${Math.max(10, anchorRect?.top ?? 80)}px`;
  document.body.appendChild(windowEl);

  windowEl.querySelector(".betterinv-performance-close")?.addEventListener("click", closeBetterInvPerformanceWindow);
  windowEl.querySelector(".betterinv-performance-reset")?.addEventListener("click", event => {
    event.preventDefault();
    resetBetterInvPerformanceMeasurements();
  });
  makeBetterInvSettingsDraggable(windowEl);
  startBetterInvPerformanceMonitor();
  if (document.getElementById("betterinv-window")) renderBetterInvWindow({ preserveScroll: true });
  return windowEl;
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
        <div class="betterinv-settings-bulk-actions" role="group" aria-label="Alle Funktionshaken gleichzeitig setzen">
          <button type="button" class="betterinv-settings-bulk-enable" data-settings-bulk="enable">
            <i class="fas fa-check-double" aria-hidden="true"></i><span>Alle Haken rein</span>
          </button>
          <button type="button" class="betterinv-settings-bulk-disable" data-settings-bulk="disable">
            <i class="fas fa-times" aria-hidden="true"></i><span>Alle Haken raus</span>
          </button>
        </div>
      </section>
      <section class="betterinv-settings-performance-launch">
        <div>
          <strong><i class="fas fa-tachometer-alt" aria-hidden="true"></i>Performance-Diagnose</strong>
          <small>Misst Renderzeiten, DOM-Größe, zusammengefasste Aktualisierungen und – falls dein Browser es zulässt – den JavaScript-Arbeitsspeicher.</small>
        </div>
        <button type="button" class="betterinv-performance-open">
          <i class="fas fa-chart-line" aria-hidden="true"></i><span>Live-Messung öffnen</span>
        </button>
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

  const setSettingsBusy = busy => {
    settingsWindow.querySelectorAll(".betterinv-setting-toggle, .betterinv-settings-group-toggle, [data-settings-bulk]").forEach(control => {
      control.disabled = Boolean(busy);
    });
    settingsWindow.classList.toggle("is-saving", Boolean(busy));
  };

  const applySettingsPatch = async patch => {
    const previousSettings = getBetterInvUserSettings();
    setSettingsBusy(true);
    try {
      const savedSettings = await saveBetterInvUserSettings(patch);
      if (!savedSettings.showSearch || (!savedSettings.showItems && !savedSettings.showContainers)) {
        betterInvState.search = "";
      }
      if (!savedSettings.showContainers) betterInvState.containerId = null;
      if (!savedSettings.showItemTransfer) clearBetterInvTokenDropFeedback();

      syncBetterInvSettingsControls(settingsWindow, savedSettings);
      if (savedSettings.moduleEnabled === false) {
        closeBetterInvPerformanceWindow();
        closeBetterInvSettingsWindow();
      }
      if (document.getElementById("betterinv-window")) await renderBetterInvWindow({ preserveScroll: true });
      return savedSettings;
    } catch (error) {
      console.error("Better Inventory | Persönliche Einstellung konnte nicht gespeichert werden", error);
      ui.notifications.error("Deine persönliche Einstellung konnte nicht gespeichert werden.");
      syncBetterInvSettingsControls(settingsWindow, previousSettings);
      return null;
    } finally {
      if (settingsWindow.isConnected) setSettingsBusy(false);
    }
  };

  settingsWindow.querySelectorAll(".betterinv-setting-toggle").forEach(input => {
    input.addEventListener("change", async event => {
      const checkbox = event.currentTarget;
      if (!(checkbox instanceof HTMLInputElement)) return;
      const key = String(checkbox.dataset.settingKey ?? "");
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_BETTER_INV_USER_SETTINGS, key) || key === "version") return;
      await applySettingsPatch({ [key]: checkbox.checked });
    });
  });

  settingsWindow.querySelectorAll(".betterinv-settings-group-toggle").forEach(input => {
    const groupId = String(input.dataset.settingGroup ?? "");
    const group = BETTER_INV_SETTINGS_GROUPS.find(entry => entry.id === groupId);
    if (group) {
      const groupState = getBetterInvSettingsGroupState(group, userSettings);
      input.indeterminate = groupState.indeterminate;
      input.setAttribute("aria-checked", groupState.indeterminate ? "mixed" : String(groupState.checked));
    }

    input.addEventListener("change", async event => {
      const checkbox = event.currentTarget;
      if (!(checkbox instanceof HTMLInputElement)) return;
      const selectedGroup = BETTER_INV_SETTINGS_GROUPS.find(entry => entry.id === String(checkbox.dataset.settingGroup ?? ""));
      if (!selectedGroup) return;
      const patch = Object.fromEntries(getBetterInvSettingsGroupKeys(selectedGroup).map(key => [key, checkbox.checked]));
      await applySettingsPatch(patch);
    });
  });

  settingsWindow.querySelector(".betterinv-performance-open")?.addEventListener("click", event => {
    event.preventDefault();
    openBetterInvPerformanceWindow();
  });

  settingsWindow.querySelectorAll("[data-settings-bulk]").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      const enable = String(event.currentTarget.dataset.settingsBulk ?? "") === "enable";
      const patch = Object.fromEntries(getBetterInvAllFeatureSettingKeys().map(key => [key, enable]));
      await applySettingsPatch(patch);
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

function itemMatchesSearch(item, query, renderCache = null) {
  if (!query) return true;
  let haystack = renderCache?.searchText?.get(item);
  if (haystack === undefined) {
    haystack = [item.name, item.type, foundry.utils.getProperty(item, "system.type.value"), foundry.utils.getProperty(item, "system.identifier")]
      .map(v => String(v ?? "").toLowerCase()).join(" ");
    renderCache?.searchText?.set(item, haystack);
  }
  return haystack.includes(query);
}

function renderSearchContainerHits(actor, containers, query, { inventoryItems = null, renderCache = null } = {}) {
  const hits = containers.filter(container => {
    if (String(container.name ?? "").toLowerCase().includes(query)) return true;
    if (String(getContainerAlias(actor, container) ?? "").toLowerCase().includes(query)) return true;
    return getVisibleItems(actor, container, inventoryItems, renderCache).some(item => itemMatchesSearch(item, query, renderCache));
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
    }, {
      width: 430,
      classes: ["betterinv-standard-dialog", "betterinv-form-dialog"]
    });
    dialog.render(true);
    setTimeout(() => {
      decorateBetterInvDialog(dialog, {
        classes: ["betterinv-standard-dialog", "betterinv-form-dialog"],
        focusSelector: 'input[name="alias"]',
        selectInput: true
      });
    }, 40);
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
    }, {
      width: 430,
      classes: ["betterinv-standard-dialog", "betterinv-form-dialog"]
    });
    dialog.render(true);
    setTimeout(() => {
      decorateBetterInvDialog(dialog, {
        classes: ["betterinv-standard-dialog", "betterinv-form-dialog"],
        focusSelector: 'input[name="name"]',
        selectInput: true
      });
    }, 40);
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

function getBetterInvItemPrice(item, renderCache = null) {
  if (!item) return null;
  if (renderCache?.price?.has(item)) return renderCache.price.get(item);
  const candidates = [
    foundry.utils.getProperty(item, "system.price"),
    foundry.utils.getProperty(item, "system.cost")
  ];
  let result = null;
  for (const candidate of candidates) {
    const parsed = parseBetterInvPrice(candidate);
    if (!parsed) continue;
    result = parsed;
    break;
  }
  renderCache?.price?.set(item, result);
  return result;
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

function betterInvItemPriceHtml(item, { unidentified = false, enabled = betterInvShowsItemValues(), renderCache = null } = {}) {
  if (!enabled || unidentified) return "";
  const price = getBetterInvItemPrice(item, renderCache);
  const unitValue = formatBetterInvPrice(price);
  if (!unitValue) return "";
  const quantity = getItemQuantityData(item, renderCache).value;
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

function betterInvActorCurrencyHtml(currencies, draft = {}, { editable = true, showCalculator = true, showTransfer = true } = {}) {
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
          </button>
          ${showTransfer ? `<button
            type="button"
            class="betterinv-currency-action betterinv-currency-transfer"
            title="Eingegebene Münzen exakt an einen anderen Actor übertragen"
            ${editable ? "" : "disabled"}
          >
            <i class="fas fa-handshake" aria-hidden="true"></i>
            <span>Handeln</span>
          </button>` : ""}` : `
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


function formatBetterInvCurrencyAmounts(amounts) {
  return Array.from(amounts ?? [])
    .filter(currency => Number(currency?.amount) > 0)
    .map(currency => `${formatBetterInvNumber(currency.amount)} ${currency.abbreviation}`)
    .join(" · ");
}

async function commitBetterInvCurrencyTransfer(sourceActor, targetActor, transfers) {
  if (!sourceActor || !targetActor) throw new Error("Quell- oder Ziel-Actor fehlt.");
  if (sourceActor.id === targetActor.id) throw new Error("Quell- und Ziel-Actor sind identisch.");
  if (!canBetterInvUserModifyActor(sourceActor)) throw new Error(`Du darfst ${sourceActor.name} nicht bearbeiten.`);
  if (!canBetterInvUserModifyActor(targetActor)) throw new Error(`Du darfst ${targetActor.name} nicht bearbeiten.`);

  const sourceKey = getBetterInvCurrencyActorKey(sourceActor);
  const targetKey = getBetterInvCurrencyActorKey(targetActor);
  if (!sourceKey || !targetKey) throw new Error("Ein Actor besitzt keine eindeutige ID.");
  if (betterInvCurrencyTransactions.has(sourceKey) || betterInvCurrencyTransactions.has(targetKey)) {
    ui.notifications.warn("Für einen der beteiligten Charaktere läuft bereits eine Geldänderung.");
    return false;
  }

  const transferList = Array.from(transfers ?? []).filter(entry => Number(entry?.amount) > 0);
  if (!transferList.length) {
    ui.notifications.warn("Gib zuerst die Münzen ein, die du handeln möchtest.");
    return false;
  }

  const sourceWallet = getBetterInvCurrencyWallet(sourceActor);
  const targetWallet = getBetterInvCurrencyWallet(targetActor);
  const sourceBalances = cloneBetterInvCurrencyBalances(sourceWallet);
  const targetBalances = cloneBetterInvCurrencyBalances(targetWallet);

  for (const transfer of transferList) {
    const amount = Math.trunc(Number(transfer.amount) || 0);
    const sourceBalance = sourceBalances.get(transfer.key);
    const targetBalance = targetBalances.get(transfer.key);
    if (!sourceBalance || !targetBalance) throw new Error(`Die Währung ${transfer.abbreviation} ist nicht verfügbar.`);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`Der Betrag für ${transfer.abbreviation} ist ungültig.`);
    if (sourceBalance.value < amount) {
      const error = new Error(
        `Nicht genug ${transfer.name}: ${formatBetterInvNumber(amount)} ${transfer.abbreviation} benötigt, ` +
        `${formatBetterInvNumber(sourceBalance.value)} vorhanden.`
      );
      error.betterInvUserMessage = `${error.message} Keine Münzen wurden verändert.`;
      throw error;
    }
    if (!Number.isSafeInteger(targetBalance.value + amount)) {
      throw new Error(`Der neue Bestand für ${transfer.abbreviation} wäre zu groß.`);
    }
    sourceBalance.value -= amount;
    targetBalance.value += amount;
  }

  const { updateData: targetUpdate, expectedValues: targetExpected } = buildBetterInvCurrencyUpdateData(targetWallet, targetBalances);
  const { updateData: sourceUpdate, expectedValues: sourceExpected } = buildBetterInvCurrencyUpdateData(sourceWallet, sourceBalances);
  if (!Object.keys(sourceUpdate).length || !Object.keys(targetUpdate).length) return false;

  betterInvCurrencyTransactions.add(sourceKey);
  betterInvCurrencyTransactions.add(targetKey);
  let targetUpdated = false;
  let sourceUpdated = false;

  try {
    const freshSource = getBetterInvCurrencyWallet(sourceActor);
    const freshTarget = getBetterInvCurrencyWallet(targetActor);
    const stale = (original, fresh) => original.some(currency => {
      const current = fresh.find(entry => entry.key === currency.key);
      return !current || current.storage.updatePath !== currency.storage.updatePath || current.value !== currency.value;
    });
    if (stale(sourceWallet, freshSource) || stale(targetWallet, freshTarget)) {
      const error = new Error("Der Münzbestand wurde zwischenzeitlich geändert. Bitte erneut versuchen.");
      error.betterInvUserMessage = `${error.message} Keine Münzen wurden verändert.`;
      throw error;
    }

    // Ziel zuerst, Quelle danach. Falls die Abbuchung fehlschlägt, wird die
    // Zielgutschrift mit den vorherigen Werten zurückgerollt.
    await targetActor.update(targetUpdate, { betterInventoryCurrencyTransfer: true });
    targetUpdated = true;
    await sourceActor.update(sourceUpdate, { betterInventoryCurrencyTransfer: true });
    sourceUpdated = true;

    const verifiedSource = getBetterInvCurrencyWallet(sourceActor);
    const verifiedTarget = getBetterInvCurrencyWallet(targetActor);
    const sourceMismatch = verifiedSource.find(currency => sourceExpected.get(currency.key) !== currency.value);
    const targetMismatch = verifiedTarget.find(currency => targetExpected.get(currency.key) !== currency.value);
    if (sourceMismatch || targetMismatch) {
      const error = new Error(
        "Der Geldtransfer wurde gesendet, konnte aber nicht eindeutig bestätigt werden. Prüfe beide Charakterbögen, bevor du ihn wiederholst."
      );
      error.betterInvUserMessage = error.message;
      error.betterInvUpdateMayHaveSucceeded = true;
      throw error;
    }

    betterInvState.currencyDraft = {};
    betterInvState.currencyDraftActorId = sourceActor.id;
    ui.notifications.info(`${formatBetterInvCurrencyAmounts(transferList)} wurden an ${targetActor.name} übertragen.`);
    return true;
  } catch (error) {
    if (targetUpdated && !sourceUpdated) {
      try {
        const rollbackBalances = cloneBetterInvCurrencyBalances(targetWallet);
        const { updateData: rollbackUpdate } = buildBetterInvCurrencyUpdateData(getBetterInvCurrencyWallet(targetActor), rollbackBalances);
        if (Object.keys(rollbackUpdate).length) {
          await targetActor.update(rollbackUpdate, {
            betterInventoryCurrencyTransferRollback: true
          });
        }
      } catch (rollbackError) {
        console.error("Better Inventory | Geldtransfer-Rollback fehlgeschlagen", rollbackError);
        error.betterInvUserMessage =
          `Der Geldtransfer ist unklar. Prüfe ${targetActor.name} auf eine zusätzliche Gutschrift und ${sourceActor.name} auf die Abbuchung.`;
        error.betterInvUpdateMayHaveSucceeded = true;
      }
    } else if (sourceUpdated || targetUpdated) {
      error.betterInvUserMessage ??=
        "Der Geldtransfer konnte nicht sicher bestätigt werden. Prüfe beide Charakterbögen, bevor du ihn wiederholst.";
      error.betterInvUpdateMayHaveSucceeded = true;
    }
    throw error;
  } finally {
    betterInvCurrencyTransactions.delete(sourceKey);
    betterInvCurrencyTransactions.delete(targetKey);
  }
}

async function transferBetterInvCurrency(sourceActor) {
  const transfers = getBetterInvCurrencyAdditionDraft();
  if (!transfers.length) {
    ui.notifications.warn("Gib zuerst die Münzen ein, die du handeln möchtest.");
    return false;
  }

  const summary = formatBetterInvCurrencyAmounts(transfers);
  const targetActor = await promptBetterInvActorTarget(sourceActor, {
    title: "Geld handeln",
    heading: "Münzen übertragen",
    description: "Die eingegebenen Münzarten werden exakt abgezogen und dem Empfänger gutgeschrieben.",
    summary,
    confirmLabel: "Handeln",
    icon: "fa-handshake"
  });
  if (!targetActor) return false;
  return await commitBetterInvCurrencyTransfer(sourceActor, targetActor, transfers);
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

function getBetterInvItemWeight(item, renderCache = null) {
  if (!item) return 0;
  if (renderCache?.weight?.has(item)) return renderCache.weight.get(item);

  // Prefer values which are already calculated for the complete stack.
  const completeStack = firstFiniteNumber(
    foundry.utils.getProperty(item, "system.totalWeight"),
    foundry.utils.getProperty(item, "system.weight.total"),
    foundry.utils.getProperty(item, "system.weight.computed")
  );
  if (completeStack !== null) {
    const result = Math.max(0, completeStack);
    renderCache?.weight?.set(item, result);
    return result;
  }

  const rawWeight = foundry.utils.getProperty(item, "system.weight");
  const unitWeight = firstFiniteNumber(
    typeof rawWeight === "object" && rawWeight !== null ? rawWeight.value : rawWeight,
    foundry.utils.getProperty(item, "system.weight.value")
  ) ?? 0;
  const result = Math.max(0, unitWeight) * getItemQuantityData(item, renderCache).value;
  renderCache?.weight?.set(item, result);
  return result;
}

function getBetterInvItemsWeight(items, renderCache = null) {
  let total = 0;
  for (const item of Array.from(items ?? [])) total += getBetterInvItemWeight(item, renderCache);
  return total;
}

function betterInvCategoryWeightHtml(items, label = "Kategoriegewicht", renderCache = null) {
  const weight = getBetterInvItemsWeight(items, renderCache);
  const unit = renderCache?.weightUnit ?? getBetterInvWeightUnit();
  if (renderCache && !renderCache.weightUnit) renderCache.weightUnit = unit;
  const amount = `${formatBetterInvNumber(weight)} ${unit}`;
  return `
    <span class="betterinv-category-weight" title="${escapeAttr(`${label}: ${amount}`)}">
      <i class="fas fa-weight-hanging" aria-hidden="true"></i>
      <span>${escapeHtml(amount)}</span>
    </span>`;
}

function getBetterInvContainerCapacity(actor, container, inventoryItems = null, renderCache = null) {
  if (!actor || !container) return null;

  const capacity = foundry.utils.getProperty(container, "system.capacity");
  const capacityObject = capacity && typeof capacity === "object" ? capacity : {};
  const contents = getVisibleItems(actor, container, inventoryItems, renderCache);

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
    if (current === null) current = contents.reduce((sum, item) => sum + getItemQuantityData(item, renderCache).value, 0);
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
    if (current === null) current = contents.reduce((sum, item) => sum + getBetterInvItemWeight(item, renderCache), 0);
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

function getBetterInvActorEncumbrance(actor, { inventoryItems = null, renderCache = null } = {}) {
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
      .filter(item => !getItemContainerId(item, renderCache))
      .reduce((sum, item) => sum + getBetterInvItemWeight(item, renderCache), 0);
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

async function renderContainerCards(actor, containers, { showCapacity = true, inventoryItems = null, renderCache = null } = {}) {
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
            const capacity = showCapacity ? getBetterInvContainerCapacity(actor, container, inventoryItems, renderCache) : null;
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

function renderContainerBreadcrumb(actor, container, { showCapacity = true, showCount = true, inventoryItems = null, renderCache = null } = {}) {
  const count = showCount ? getVisibleItems(actor, container, inventoryItems, renderCache).length : null;
  const capacity = showCapacity ? getBetterInvContainerCapacity(actor, container, inventoryItems, renderCache) : null;
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

function getItemQuantityData(item, renderCache = null) {
  if (renderCache?.quantity?.has(item)) return renderCache.quantity.get(item);
  const raw = foundry.utils.getProperty(item, "system.quantity");
  const nested = foundry.utils.getProperty(item, "system.quantity.value");
  const value = Number(typeof raw === "object" && raw !== null ? nested : raw);
  const result = {
    value: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 1,
    updatePath: typeof raw === "object" && raw !== null ? "system.quantity.value" : "system.quantity"
  };
  renderCache?.quantity?.set(item, result);
  return result;
}

async function setItemQuantity(item, value, operation = {}) {
  if (!item) return;
  const quantity = getItemQuantityData(item);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  const next = Math.max(0, Math.floor(parsed));
  if (next === quantity.value) return;
  await item.update({ [quantity.updatePath]: next }, operation);
}

async function changeItemQuantity(item, delta) {
  if (!item || !Number.isFinite(delta)) return;
  const quantity = getItemQuantityData(item);
  await setItemQuantity(item, quantity.value + Math.trunc(delta));
}

function getItemEquippedData(item, renderCache = null) {
  if (!item) return { supported: false, value: false, updatePath: null };
  if (renderCache?.equipped?.has(item)) return renderCache.equipped.get(item);

  const direct = foundry.utils.getProperty(item, "system.equipped");
  if (typeof direct === "boolean") {
    const result = { supported: true, value: direct, updatePath: "system.equipped" };
    renderCache?.equipped?.set(item, result);
    return result;
  }

  if (direct && typeof direct === "object") {
    for (const key of ["value", "equipped"]) {
      if (typeof direct[key] === "boolean") {
        const result = { supported: true, value: direct[key], updatePath: `system.equipped.${key}` };
        renderCache?.equipped?.set(item, result);
        return result;
      }
    }
  }

  const result = { supported: false, value: false, updatePath: null };
  renderCache?.equipped?.set(item, result);
  return result;
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

function isBetterInvFavorite(item, renderCache = null) {
  if (renderCache?.favorite?.has(item)) return renderCache.favorite.get(item);
  const result = item?.getFlag?.(MODULE_ID, "favorite") === true;
  renderCache?.favorite?.set(item, result);
  return result;
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

function closeBetterInvCategoryMenu() {
  if (typeof betterInvCategoryMenuCleanup === "function") {
    betterInvCategoryMenuCleanup();
    return;
  }
  document.getElementById("betterinv-category-menu")?.remove();
  betterInvCategoryMenuButton = null;
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
  const confirmed = await openBetterInvConfirmDialog({
    title: "Item löschen",
    kicker: "Dauerhaft entfernen",
    image: item.img || "icons/svg/item-bag.svg",
    danger: true,
    confirmLabel: "Löschen",
    contentHtml: `<p><strong>${escapeHtml(item.name)}</strong> wirklich dauerhaft löschen?</p>`,
    note: "Diese Aktion kann nicht rückgängig gemacht werden."
  });
  if (!confirmed) return;
  await item.delete();
  ui.notifications.info(`${item.name} wurde gelöscht.`);
}

function canBetterInvUserModifyActor(actor) {
  if (!actor || !game.user) return false;
  if (game.user.isGM || actor.isOwner === true) return true;
  try {
    return actor.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) === true;
  } catch (_error) {
    const level = actor.ownership?.[game.user.id] ?? actor.permission?.[game.user.id] ?? 0;
    return level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  }
}

function getBetterInvTransferTargetActors(sourceActor) {
  const actors = game.actors?.filter(actor => {
    if (!actor || actor.id === sourceActor?.id) return false;
    return canBetterInvUserModifyActor(actor);
  }) ?? [];

  const typeRank = actor => actor.type === "character" ? 0 : actor.type === "npc" ? 1 : 2;
  actors.sort((left, right) => {
    const rank = typeRank(left) - typeRank(right);
    if (rank) return rank;
    return String(left.name ?? "").localeCompare(String(right.name ?? ""), game.i18n?.lang ?? undefined, { sensitivity: "base" });
  });
  return actors;
}

function getBetterInvActorTypeLabel(actor) {
  const raw = CONFIG?.Actor?.typeLabels?.[actor?.type];
  if (raw) {
    try { return game.i18n?.localize?.(raw) ?? raw; }
    catch (_error) { return raw; }
  }
  const labels = { character: "Charakter", npc: "NSC", vehicle: "Fahrzeug", group: "Gruppe" };
  return labels[actor?.type] ?? String(actor?.type ?? "Actor");
}


async function promptBetterInvActorTarget(sourceActor, {
  title = "Empfänger auswählen",
  heading = "Übertragen",
  description = "Wähle den Empfänger.",
  summary = "",
  confirmLabel = "Übertragen",
  icon = "fa-right-left"
} = {}) {
  const targets = getBetterInvTransferTargetActors(sourceActor);
  if (!targets.length) {
    ui.notifications.warn("Es wurde kein anderer Actor gefunden, den du bearbeiten darfst.");
    return null;
  }

  const actorCards = targets.map(actor => `
    <button type="button" class="betterinv-transfer-actor" data-transfer-actor-id="${escapeAttr(actor.id)}" role="option" aria-selected="false">
      <img src="${escapeAttr(actor.img || "icons/svg/mystery-man.svg")}" alt="">
      <span class="betterinv-transfer-actor-copy">
        <strong>${escapeHtml(actor.name)}</strong>
        <small>${escapeHtml(getBetterInvActorTypeLabel(actor))}</small>
      </span>
      <i class="fas fa-check" aria-hidden="true"></i>
    </button>`).join("");

  return await new Promise(resolve => {
    let settled = false;
    let selectedActorId = "";
    let dialog;
    const done = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const choose = value => {
      done(value);
      dialog?.close?.();
    };

    dialog = new Dialog({
      title,
      content: `
        <div class="betterinv-transfer-dialog betterinv-actor-target-dialog" data-betterinv-actor-target-dialog>
          <header class="betterinv-transfer-header">
            <span class="betterinv-transfer-header-icon"><i class="fas ${escapeAttr(icon)}" aria-hidden="true"></i></span>
            <div>
              <span class="betterinv-transfer-kicker">Von ${escapeHtml(sourceActor?.name ?? "Actor")}</span>
              <h3>${escapeHtml(heading)}</h3>
              <p>${escapeHtml(description)}</p>
            </div>
            ${summary ? `<span class="betterinv-transfer-stock">${escapeHtml(summary)}</span>` : ""}
          </header>
          <label class="betterinv-transfer-search betterinv-actor-target-search">
            <span>Actor suchen</span>
            <span class="betterinv-transfer-search-wrap">
              <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
              <input type="search" data-transfer-search placeholder="Name oder Actortyp …" autocomplete="off">
            </span>
          </label>
          <div class="betterinv-transfer-summary" data-transfer-result-count>${escapeHtml(formatBetterInvNumber(targets.length))} mögliche Empfänger</div>
          <div class="betterinv-transfer-actors" data-transfer-actors role="listbox" aria-label="Empfänger auswählen">${actorCards}</div>
          <footer class="betterinv-transfer-footer">
            <span data-transfer-selection>Kein Empfänger ausgewählt</span>
            <div>
              <button type="button" class="betterinv-transfer-cancel" data-transfer-cancel>
                <i class="fas fa-xmark" aria-hidden="true"></i><span>Abbrechen</span>
              </button>
              <button type="button" class="betterinv-transfer-confirm" data-transfer-confirm disabled>
                <i class="fas ${escapeAttr(icon)}" aria-hidden="true"></i><span>${escapeHtml(confirmLabel)}</span>
              </button>
            </div>
          </footer>
        </div>`,
      buttons: {},
      close: () => done(null)
    }, {
      width: 600,
      classes: ["betterinv-transfer-window"]
    });

    dialog.render(true);
    setTimeout(() => {
      bringFoundryDialogsToFront({ avoidOverlap: false });
      const dialogElement = dialog.element?.[0] ?? dialog.element ?? document.querySelector('.dialog.app.window-app');
      dialogElement?.classList?.add("betterinv-transfer-window");
      const root = dialogElement?.querySelector?.("[data-betterinv-actor-target-dialog]");
      if (!root) return;

      const search = root.querySelector("[data-transfer-search]");
      const actorsElement = root.querySelector("[data-transfer-actors]");
      const resultCount = root.querySelector("[data-transfer-result-count]");
      const selection = root.querySelector("[data-transfer-selection]");
      const confirm = root.querySelector("[data-transfer-confirm]");
      const cancel = root.querySelector("[data-transfer-cancel]");

      const updateSelection = () => {
        const target = targets.find(actor => actor.id === selectedActorId) ?? null;
        if (selection) selection.textContent = target ? `Empfänger: ${target.name}` : "Kein Empfänger ausgewählt";
        if (confirm) confirm.disabled = !target;
      };

      const renderActors = () => {
        const query = normalizeBetterInvSearchText(search?.value ?? "").trim();
        let visible = 0;
        actorsElement?.querySelectorAll("[data-transfer-actor-id]").forEach(button => {
          const actor = targets.find(entry => entry.id === button.dataset.transferActorId);
          const matches = actor && (!query || normalizeBetterInvSearchText(`${actor.name} ${getBetterInvActorTypeLabel(actor)} ${actor.type}`).includes(query));
          button.hidden = !matches;
          if (matches) visible += 1;
          const selected = actor?.id === selectedActorId;
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-selected", selected ? "true" : "false");
        });
        if (resultCount) resultCount.textContent = `${formatBetterInvNumber(visible)} mögliche Empfänger`;
      };

      actorsElement?.querySelectorAll("[data-transfer-actor-id]").forEach(button => {
        button.addEventListener("click", () => {
          selectedActorId = String(button.dataset.transferActorId ?? "");
          renderActors();
          updateSelection();
        });
        button.addEventListener("dblclick", () => {
          const actor = targets.find(entry => entry.id === String(button.dataset.transferActorId ?? ""));
          if (actor) choose(actor);
        });
      });

      search?.addEventListener("input", event => {
        event.stopPropagation();
        renderActors();
      }, { capture: true });
      ["keydown", "keyup", "keypress", "beforeinput", "paste"].forEach(type => {
        search?.addEventListener(type, event => event.stopPropagation(), { capture: true });
      });
      cancel?.addEventListener("click", () => choose(null));
      confirm?.addEventListener("click", () => {
        const actor = targets.find(entry => entry.id === selectedActorId);
        if (actor) choose(actor);
      });
      root.querySelectorAll("img").forEach(image => image.addEventListener("error", () => {
        if (image.dataset.fallbackApplied === "true") return;
        image.dataset.fallbackApplied = "true";
        image.src = "icons/svg/mystery-man.svg";
      }, { once: true }));

      renderActors();
      updateSelection();
      search?.focus();
    }, 50);
  });
}

function getBetterInvItemContainedChildren(actor, containerItem) {
  if (!actor || !containerItem || !isContainerLike(containerItem)) return [];
  return Array.from(actor.items ?? []).filter(item => item.id !== containerItem.id && itemIsInContainer(item, containerItem));
}

function getBetterInvItemDocumentImplementation() {
  let documentClass = CONFIG?.Item?.documentClass ?? null;
  if (!documentClass && typeof getDocumentClass === "function") {
    try { documentClass = getDocumentClass("Item"); }
    catch (_error) { documentClass = null; }
  }
  return documentClass?.implementation ?? documentClass ?? globalThis.Item?.implementation ?? globalThis.Item ?? null;
}

async function resolveBetterInvNativeTransferSource(item) {
  if (!item) return { document: null, dragData: null, usedNativeDropData: false };

  let dragData = null;
  try {
    dragData = typeof item.toDragData === "function"
      ? item.toDragData()
      : { type: "Item", uuid: item.uuid };
  } catch (error) {
    console.debug("Better Inventory | Foundry-Dragdaten konnten nicht erzeugt werden; direkter Dokument-Fallback", error);
    dragData = { type: "Item", uuid: item.uuid };
  }

  const ItemImplementation = getBetterInvItemDocumentImplementation();
  if (dragData && typeof ItemImplementation?.fromDropData === "function") {
    try {
      const resolved = await ItemImplementation.fromDropData(dragData);
      if (resolved && typeof resolved.toObject === "function") {
        return { document: resolved, dragData, usedNativeDropData: true };
      }
    } catch (error) {
      console.debug("Better Inventory | Foundrys fromDropData konnte das Item nicht auflösen; direkter Dokument-Fallback", error);
    }
  }

  return { document: item, dragData, usedNativeDropData: false };
}

async function createBetterInvTransferredItem(targetActor, data, operation = {}) {
  const ItemImplementation = getBetterInvItemDocumentImplementation();

  // Prefer Foundry's configured Item implementation. This allows the active
  // game system to run its own Item creation lifecycle for the target Actor.
  if (typeof ItemImplementation?.createDocuments === "function") {
    const created = await ItemImplementation.createDocuments([data], {
      ...operation,
      parent: targetActor
    });
    return created?.[0] ?? null;
  }

  // Compatibility fallback for systems or older environments without the
  // static Document creation API.
  const created = await targetActor.createEmbeddedDocuments("Item", [data], operation);
  return created?.[0] ?? null;
}

function getBetterInvTransferOperation(sourceActor, sourceItem, targetActor, quantity) {
  return {
    betterInventoryTransfer: {
      sourceActorUuid: sourceActor?.uuid ?? null,
      sourceItemUuid: sourceItem?.uuid ?? null,
      targetActorUuid: targetActor?.uuid ?? null,
      quantity
    }
  };
}

function prepareBetterInvTransferredItemData(item, quantity) {
  if (!item || typeof item.toObject !== "function") throw new Error("Das Item konnte nicht gelesen werden.");
  const data = item.toObject();
  if (!data || typeof data !== "object") throw new Error("Das Item enthält keine gültigen Daten.");

  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  delete data.permission;
  delete data._stats;

  data.flags = data.flags && typeof data.flags === "object" ? data.flags : {};
  delete data.flags[MODULE_ID];

  // Better-Inventory categories and the source actor's container id are local
  // organization data. The receiving actor always gets the item unsorted at root.
  const sourceContainer = foundry.utils.getProperty(data, "system.container");
  if (sourceContainer && typeof sourceContainer === "object" && !Array.isArray(sourceContainer)) {
    foundry.utils.setProperty(data, "system.container", {
      ...foundry.utils.deepClone(sourceContainer),
      id: null,
      uuid: null,
      value: null
    });
  } else if (sourceContainer !== undefined && sourceContainer !== null) {
    foundry.utils.setProperty(data, "system.container", "");
  }
  [
    "system.containerId",
    "system.containerUuid",
    "system.containerIdentifier",
    "system.equippedContainer",
    "flags.dnd5e.container",
    "flags.dnd5e.containerId",
    "flags.dnd5e.containerUuid",
    "flags.itemcollection.container"
  ].forEach(path => deleteBetterInvNestedProperty(data, path));

  const sourceQuantity = foundry.utils.getProperty(data, "system.quantity");
  if (sourceQuantity && typeof sourceQuantity === "object" && !Array.isArray(sourceQuantity)) {
    foundry.utils.setProperty(data, "system.quantity.value", quantity);
  } else if (sourceQuantity !== undefined) {
    foundry.utils.setProperty(data, "system.quantity", quantity);
  }

  const equipped = getItemEquippedData(item);
  if (equipped.supported && equipped.updatePath) foundry.utils.setProperty(data, equipped.updatePath, false);
  return data;
}

async function promptBetterInvItemTransfer(sourceActor, item) {
  const targets = getBetterInvTransferTargetActors(sourceActor);
  if (!targets.length) {
    ui.notifications.warn("Es wurde kein anderer Actor gefunden, den du bearbeiten darfst.");
    return null;
  }

  const currentQuantity = getItemQuantityData(item).value;
  const itemImage = item.img || "icons/svg/item-bag.svg";
  const actorCards = targets.map(actor => `
    <button type="button" class="betterinv-transfer-actor" data-transfer-actor-id="${escapeAttr(actor.id)}" role="option" aria-selected="false">
      <img src="${escapeAttr(actor.img || "icons/svg/mystery-man.svg")}" alt="">
      <span class="betterinv-transfer-actor-copy">
        <strong>${escapeHtml(actor.name)}</strong>
        <small>${escapeHtml(getBetterInvActorTypeLabel(actor))}</small>
      </span>
      <i class="fas fa-check" aria-hidden="true"></i>
    </button>`).join("");

  return await new Promise(resolve => {
    let settled = false;
    let selectedActorId = "";
    let dialog;
    const done = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const choose = value => {
      done(value);
      dialog?.close?.();
    };

    dialog = new Dialog({
      title: "Item übertragen",
      content: `
        <div class="betterinv-transfer-dialog" data-betterinv-transfer-dialog>
          <header class="betterinv-transfer-header">
            <img src="${escapeAttr(itemImage)}" alt="">
            <div>
              <span class="betterinv-transfer-kicker">Von ${escapeHtml(sourceActor.name)}</span>
              <h3>${escapeHtml(item.name)}</h3>
              <p>Wähle den Empfänger und die zu übertragende Menge.</p>
            </div>
            <span class="betterinv-transfer-stock">Bestand: ${escapeHtml(formatBetterInvNumber(currentQuantity))}</span>
          </header>

          <div class="betterinv-transfer-controls">
            <label class="betterinv-transfer-search">
              <span>Actor suchen</span>
              <span class="betterinv-transfer-search-wrap">
                <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                <input type="search" data-transfer-search placeholder="Name oder Actortyp …" autocomplete="off">
              </span>
            </label>
            <label class="betterinv-transfer-quantity">
              <span>Menge</span>
              <span class="betterinv-transfer-quantity-wrap">
                <button type="button" data-transfer-quantity-minus aria-label="Menge verringern">−</button>
                <input type="number" data-transfer-quantity min="1" max="${escapeAttr(String(currentQuantity))}" step="1" value="${escapeAttr(String(currentQuantity))}" inputmode="numeric">
                <button type="button" data-transfer-quantity-plus aria-label="Menge erhöhen">+</button>
              </span>
            </label>
          </div>

          <div class="betterinv-transfer-summary" data-transfer-result-count>${escapeHtml(formatBetterInvNumber(targets.length))} mögliche Empfänger</div>
          <div class="betterinv-transfer-actors" data-transfer-actors role="listbox" aria-label="Empfänger auswählen">${actorCards}</div>

          <footer class="betterinv-transfer-footer">
            <span data-transfer-selection>Kein Empfänger ausgewählt</span>
            <div>
              <button type="button" class="betterinv-transfer-cancel" data-transfer-cancel>
                <i class="fas fa-xmark" aria-hidden="true"></i><span>Abbrechen</span>
              </button>
              <button type="button" class="betterinv-transfer-confirm" data-transfer-confirm disabled>
                <i class="fas fa-right-left" aria-hidden="true"></i><span>Übertragen</span>
              </button>
            </div>
          </footer>
        </div>`,
      buttons: {},
      close: () => done(null)
    }, {
      width: 620,
      classes: ["betterinv-transfer-window"]
    });

    dialog.render(true);
    setTimeout(() => {
      bringFoundryDialogsToFront({ avoidOverlap: false });
      const dialogElement = dialog.element?.[0] ?? dialog.element ?? document.querySelector('.dialog.app.window-app');
      dialogElement?.classList?.add("betterinv-transfer-window");
      const root = dialogElement?.querySelector?.("[data-betterinv-transfer-dialog]");
      if (!root) return;

      const search = root.querySelector("[data-transfer-search]");
      const quantityInput = root.querySelector("[data-transfer-quantity]");
      const quantityMinus = root.querySelector("[data-transfer-quantity-minus]");
      const quantityPlus = root.querySelector("[data-transfer-quantity-plus]");
      const actorsElement = root.querySelector("[data-transfer-actors]");
      const resultCount = root.querySelector("[data-transfer-result-count]");
      const selection = root.querySelector("[data-transfer-selection]");
      const confirm = root.querySelector("[data-transfer-confirm]");
      const cancel = root.querySelector("[data-transfer-cancel]");

      const normalizedQuantity = () => {
        const raw = Number(quantityInput?.value ?? currentQuantity);
        const value = Math.max(1, Math.min(currentQuantity, Math.trunc(Number.isFinite(raw) ? raw : 1)));
        if (quantityInput) quantityInput.value = String(value);
        return value;
      };

      const updateSelection = () => {
        const target = targets.find(actor => actor.id === selectedActorId) ?? null;
        const quantity = normalizedQuantity();
        if (selection) selection.textContent = target
          ? `${formatBetterInvNumber(quantity)} × ${item.name} → ${target.name}`
          : "Kein Empfänger ausgewählt";
        if (confirm) confirm.disabled = !target;
      };

      const renderActors = () => {
        const query = normalizeBetterInvSearchText(search?.value ?? "").trim();
        let visible = 0;
        actorsElement?.querySelectorAll("[data-transfer-actor-id]").forEach(button => {
          const actor = targets.find(entry => entry.id === button.dataset.transferActorId);
          const matches = actor && (!query || normalizeBetterInvSearchText(`${actor.name} ${getBetterInvActorTypeLabel(actor)} ${actor.type}`).includes(query));
          button.hidden = !matches;
          if (matches) visible += 1;
          const selected = actor?.id === selectedActorId;
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-selected", selected ? "true" : "false");
        });
        if (resultCount) resultCount.textContent = `${formatBetterInvNumber(visible)} mögliche Empfänger`;
      };

      actorsElement?.querySelectorAll("[data-transfer-actor-id]").forEach(button => {
        button.addEventListener("click", () => {
          selectedActorId = String(button.dataset.transferActorId ?? "");
          renderActors();
          updateSelection();
        });
        button.addEventListener("dblclick", () => {
          selectedActorId = String(button.dataset.transferActorId ?? "");
          const targetActor = targets.find(actor => actor.id === selectedActorId);
          if (targetActor) choose({ targetActor, quantity: normalizedQuantity() });
        });
      });

      search?.addEventListener("input", event => {
        event.stopPropagation();
        renderActors();
      }, { capture: true });
      ["keydown", "keyup", "keypress", "beforeinput", "paste"].forEach(type => {
        search?.addEventListener(type, event => event.stopPropagation(), { capture: true });
        quantityInput?.addEventListener(type, event => event.stopPropagation(), { capture: true });
      });
      quantityInput?.addEventListener("input", updateSelection);
      quantityInput?.addEventListener("change", updateSelection);
      quantityMinus?.addEventListener("click", () => {
        if (quantityInput) quantityInput.value = String(Math.max(1, normalizedQuantity() - 1));
        updateSelection();
      });
      quantityPlus?.addEventListener("click", () => {
        if (quantityInput) quantityInput.value = String(Math.min(currentQuantity, normalizedQuantity() + 1));
        updateSelection();
      });
      cancel?.addEventListener("click", () => choose(null));
      confirm?.addEventListener("click", () => {
        const targetActor = targets.find(actor => actor.id === selectedActorId);
        if (targetActor) choose({ targetActor, quantity: normalizedQuantity() });
      });

      root.querySelectorAll("img").forEach(image => image.addEventListener("error", () => {
        if (image.dataset.fallbackApplied === "true") return;
        image.dataset.fallbackApplied = "true";
        image.src = image.closest(".betterinv-transfer-header") ? "icons/svg/item-bag.svg" : "icons/svg/mystery-man.svg";
      }, { once: true }));

      renderActors();
      updateSelection();
      search?.focus();
    }, 50);
  });
}

async function transferBetterInvItemToActor(sourceActor, item, targetActor, requestedQuantity = null, { notify = true } = {}) {
  if (!sourceActor || !item || !targetActor) return null;
  if (!canBetterInvUserModifyActor(sourceActor)) throw new Error("Du darfst den Quell-Actor nicht bearbeiten.");
  if (targetActor.id === sourceActor.id) throw new Error("Quell- und Ziel-Actor sind identisch.");
  if (!canBetterInvUserModifyActor(targetActor)) {
    throw new Error(`Du darfst ${targetActor.name} nicht bearbeiten.`);
  }

  const availableQuantity = getItemQuantityData(item).value;
  if (availableQuantity < 1) {
    ui.notifications.warn(`${item.name} hat aktuell keine übertragbare Menge.`);
    return null;
  }

  const containedItems = getBetterInvItemContainedChildren(sourceActor, item);
  if (containedItems.length) {
    ui.notifications.warn(`${item.name} enthält noch ${containedItems.length} Item(s). Leere den Container vor der Übertragung.`);
    return null;
  }

  const quantity = Math.max(1, Math.min(
    availableQuantity,
    Math.trunc(Number(requestedQuantity ?? availableQuantity) || availableQuantity)
  ));
  const nativeSource = await resolveBetterInvNativeTransferSource(item);
  const transferDocument = nativeSource.document ?? item;
  const data = prepareBetterInvTransferredItemData(transferDocument, quantity);
  const operation = getBetterInvTransferOperation(sourceActor, item, targetActor, quantity);
  let createdItem = null;

  try {
    createdItem = await createBetterInvTransferredItem(targetActor, data, operation);
    if (!createdItem) throw new Error("Foundry hat auf dem Ziel-Actor kein Item erstellt.");

    if (getItemQuantityData(createdItem).value !== quantity) {
      await setItemQuantity(createdItem, quantity, operation);
    }
    await setItemCategory(createdItem, "__unsorted", null);

    if (quantity >= availableQuantity) await item.delete(operation);
    else await setItemQuantity(item, availableQuantity - quantity, operation);
  } catch (error) {
    if (createdItem) {
      try { await createdItem.delete({ ...operation, betterInventoryRollback: true }); }
      catch (rollbackError) {
        console.error("Better Inventory | Rollback des übertragenen Items fehlgeschlagen", rollbackError);
        ui.notifications.error(`Die Übertragung ist unklar. Prüfe ${targetActor.name} auf ein zusätzliches Item.`);
      }
    }
    throw error;
  }

  if (notify) {
    ui.notifications.info(`${formatBetterInvNumber(quantity)} × ${item.name} wurde an ${targetActor.name} übertragen.`);
  }
  return createdItem;
}

async function transferBetterInvItem(sourceActor, item) {
  if (!sourceActor || !item) return null;
  if (!canBetterInvUserModifyActor(sourceActor)) throw new Error("Du darfst den Quell-Actor nicht bearbeiten.");

  const availableQuantity = getItemQuantityData(item).value;
  if (availableQuantity < 1) {
    ui.notifications.warn(`${item.name} hat aktuell keine übertragbare Menge.`);
    return null;
  }

  const containedItems = getBetterInvItemContainedChildren(sourceActor, item);
  if (containedItems.length) {
    ui.notifications.warn(`${item.name} enthält noch ${containedItems.length} Item(s). Leere den Container vor der Übertragung.`);
    return null;
  }

  const choice = await promptBetterInvItemTransfer(sourceActor, item);
  if (!choice) return null;
  return await transferBetterInvItemToActor(sourceActor, item, choice.targetActor, choice.quantity);
}

function getBetterInvDragEventData(event) {
  const candidates = [
    foundry?.applications?.ux?.TextEditor?.implementation,
    foundry?.applications?.ux?.TextEditor,
    globalThis.TextEditor
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof candidate?.getDragEventData !== "function") continue;
    try {
      const data = candidate.getDragEventData(event);
      if (data && typeof data === "object" && Object.keys(data).length) return data;
    } catch (_error) {}
  }

  try {
    const raw = event?.dataTransfer?.getData?.("text/plain");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function isBetterInvInternalItemDrag(event) {
  const types = Array.from(event?.dataTransfer?.types ?? []);
  return types.includes("application/x-betterinv-item");
}

function looksLikeBetterInvItemDropData(data) {
  const type = String(data?.type ?? data?.documentName ?? data?.documentType ?? "").toLowerCase();
  if (type === "item") return true;
  if (type === "betterinventoryitemtransfer") return true;
  const uuid = String(data?.uuid ?? data?.sourceItemUuid ?? "");
  return uuid.includes(".Item.") || uuid.startsWith("Item.");
}

async function resolveBetterInvDroppedItemDocument(data) {
  if (!data || typeof data !== "object") return null;

  const ItemImplementation = getBetterInvItemDocumentImplementation();
  if (String(data.type ?? "").toLowerCase() === "item" && typeof ItemImplementation?.fromDropData === "function") {
    try {
      const document = await ItemImplementation.fromDropData(data);
      if (document) return document;
    } catch (error) {
      console.debug("Better Inventory | Foundry konnte die Drop-Daten nicht direkt auflösen", error);
    }
  }

  const uuid = String(data.uuid ?? data.sourceItemUuid ?? "").trim();
  if (uuid && typeof globalThis.fromUuid === "function") {
    try {
      const document = await globalThis.fromUuid(uuid);
      if (document) return document;
    } catch (error) {
      console.debug("Better Inventory | UUID-Drop-Fallback fehlgeschlagen", error);
    }
  }

  const packId = String(data.pack ?? data.packId ?? "").trim();
  const documentId = String(data.id ?? data._id ?? data.documentId ?? "").trim();
  if (packId && documentId) {
    try {
      return await game.packs?.get?.(packId)?.getDocument?.(documentId) ?? null;
    } catch (error) {
      console.debug("Better Inventory | Kompendium-Drop-Fallback fehlgeschlagen", error);
    }
  }
  return null;
}

async function importBetterInvDroppedItem(actor, sourceItem, { targetContainer = null, targetCategory = "__unsorted" } = {}) {
  if (!actor || !sourceItem) throw new Error("Der gezogene Gegenstand konnte nicht gelesen werden.");
  if (!canBetterInvUserModifyActor(actor)) throw new Error(`Du darfst ${actor.name} nicht bearbeiten.`);

  const documentName = String(sourceItem.documentName ?? sourceItem.constructor?.documentName ?? "Item").toLowerCase();
  if (documentName !== "item") throw new Error("Der abgelegte Eintrag ist kein Item.");

  const data = prepareBetterInvCompendiumItemData(sourceItem, {
    name: sourceItem.name,
    type: sourceItem.type,
    img: sourceItem.img,
    uuid: sourceItem.uuid
  });
  const created = await actor.createEmbeddedDocuments("Item", [data], {
    betterInventoryExternalDrop: true,
    sourceUuid: sourceItem.uuid ?? null
  });
  const item = created?.[0] ?? null;
  if (!item) throw new Error("Foundry hat beim Ablegen kein Item erstellt.");

  try {
    if (targetContainer) await moveItemToContainer(item, targetContainer);
    await setItemCategory(item, targetCategory || "__unsorted", targetContainer?.id ?? null);
  } catch (error) {
    console.warn("Better Inventory | Gedropptes Item wurde erstellt, aber nicht vollständig einsortiert", error);
    ui.notifications.warn(`${item.name} wurde hinzugefügt, konnte aber nicht vollständig einsortiert werden.`);
  }

  ui.notifications.info(`${item.name} wurde per Drag & Drop zu ${actor.name} hinzugefügt.`);
  return item;
}

function getBetterInvExternalDropDestination(target, actor, activeContainer = null) {
  const containerCard = target?.closest?.(".betterinv-container-card");
  if (containerCard) {
    const targetContainer = actor?.items?.get?.(containerCard.dataset.containerId) ?? null;
    return {
      element: containerCard,
      targetContainer,
      targetCategory: "__unsorted"
    };
  }

  const categoryElement = target?.closest?.(".betterinv-subcategory, .betterinv-category, .betterinv-system-category");
  if (categoryElement) {
    return {
      element: categoryElement,
      targetContainer: activeContainer ?? null,
      targetCategory: String(categoryElement.dataset.category ?? "__unsorted")
    };
  }

  const content = target?.closest?.(".betterinv-content");
  return {
    element: content,
    targetContainer: activeContainer ?? null,
    targetCategory: "__unsorted"
  };
}

function clearBetterInvExternalDropTargets(windowEl) {
  windowEl?.querySelectorAll?.(".betterinv-external-drop-target").forEach(element => {
    element.classList.remove("betterinv-external-drop-target");
  });
}

function enableBetterInvExternalItemDrops(windowEl, actor, activeContainer = null) {
  const content = windowEl?.querySelector?.(".betterinv-content");
  if (!content || content.dataset.externalItemDropReady === "1") return;
  content.dataset.externalItemDropReady = "1";

  content.addEventListener("dragover", event => {
    if (isBetterInvInternalItemDrag(event)) return;
    const data = getBetterInvDragEventData(event);
    if (Object.keys(data).length && !looksLikeBetterInvItemDropData(data)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    clearBetterInvExternalDropTargets(windowEl);
    const destination = getBetterInvExternalDropDestination(event.target, actor, activeContainer);
    destination.element?.classList?.add("betterinv-external-drop-target");
    if (destination.element?.tagName === "DETAILS") destination.element.open = true;
  });

  content.addEventListener("dragleave", event => {
    if (event.relatedTarget && content.contains(event.relatedTarget)) return;
    clearBetterInvExternalDropTargets(windowEl);
  });

  content.addEventListener("drop", async event => {
    if (isBetterInvInternalItemDrag(event)) return;
    const data = getBetterInvDragEventData(event);
    if (!looksLikeBetterInvItemDropData(data)) return;
    event.preventDefault();
    event.stopPropagation();
    const destination = getBetterInvExternalDropDestination(event.target, actor, activeContainer);
    clearBetterInvExternalDropTargets(windowEl);

    try {
      const sourceItem = await resolveBetterInvDroppedItemDocument(data);
      if (!sourceItem) throw new Error("Der gezogene Gegenstand konnte von Foundry nicht aufgelöst werden.");
      await withBetterInvRefreshBatch(
        () => importBetterInvDroppedItem(actor, sourceItem, destination),
        { forceRefresh: true }
      );
    } catch (error) {
      console.error("Better Inventory | Externes Item konnte nicht importiert werden", error);
      ui.notifications.error(error?.message || "Der Gegenstand konnte nicht in das Inventar gezogen werden.");
    }
  });
}


function createBetterInvItemDragPreview(item, quantity = 1) {
  removeBetterInvItemDragPreview();
  const preview = document.createElement("div");
  preview.className = "betterinv-item-drag-preview";
  preview.setAttribute("aria-hidden", "true");
  const amount = Math.max(0, Math.trunc(Number(quantity) || 0));
  preview.innerHTML = `
    <img src="${escapeAttr(item?.img || "icons/svg/item-bag.svg")}" alt="">
    <strong>${escapeHtml(item?.name || "Gegenstand")}</strong>
    ${amount > 1 ? `<small>×${escapeHtml(formatBetterInvNumber(amount))}</small>` : ""}`;
  preview.querySelector("img")?.addEventListener("error", event => {
    event.currentTarget.src = "icons/svg/item-bag.svg";
  }, { once: true });
  document.body.appendChild(preview);
  return preview;
}

function removeBetterInvItemDragPreview() {
  betterInvActiveItemDrag?.previewElement?.remove?.();
  document.querySelectorAll(".betterinv-item-drag-preview").forEach(element => element.remove());
  if (betterInvActiveItemDrag) betterInvActiveItemDrag.previewElement = null;
}

function getBetterInvCanvasView() {
  return canvas?.app?.canvas
    ?? canvas?.app?.view
    ?? document.querySelector("#board canvas")
    ?? document.querySelector("canvas#board")
    ?? null;
}

function getBetterInvCanvasPointFromDragEvent(event) {
  const view = getBetterInvCanvasView();
  if (!view || !event) return null;
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const targetElement = event.target instanceof Element ? event.target : null;
  const isOverCanvas = path.includes(view) || event.target === view || Boolean(targetElement?.closest?.("#board"));
  if (path.length && !isOverCanvas) return null;

  const rect = view.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const clientX = Number(event.clientX);
  const clientY = Number(event.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

  const renderWidth = Number(view.width) || rect.width;
  const renderHeight = Number(view.height) || rect.height;
  const screenX = (clientX - rect.left) * (renderWidth / rect.width);
  const screenY = (clientY - rect.top) * (renderHeight / rect.height);
  const stageTransform = canvas?.stage?.worldTransform;
  const PointClass = globalThis.PIXI?.Point;

  if (stageTransform?.applyInverse && PointClass) {
    try {
      const point = stageTransform.applyInverse(new PointClass(screenX, screenY));
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) return { x: point.x, y: point.y };
    } catch (_error) {}
  }

  const fallback = canvas?.mousePosition;
  if (Number.isFinite(fallback?.x) && Number.isFinite(fallback?.y)) return { x: fallback.x, y: fallback.y };
  return null;
}

function isBetterInvPlayerCharacterActor(actor) {
  if (!actor) return false;
  const type = String(actor.type ?? "").trim().toLowerCase();
  if (type) return type === "character";
  return actor.hasPlayerOwner === true;
}

function isBetterInvValidTokenTransferTarget(token, sourceActorId = null) {
  const actor = token?.actor;
  if (!actor || actor.id === sourceActorId) return false;
  if (!isBetterInvPlayerCharacterActor(actor)) return false;
  return canBetterInvUserModifyActor(actor);
}

function getBetterInvTokenScreenRect(token) {
  const view = getBetterInvCanvasView();
  const rect = view?.getBoundingClientRect?.();
  const bounds = token?.bounds ?? token?.getBounds?.();
  const stageTransform = canvas?.stage?.worldTransform;
  const PointClass = globalThis.PIXI?.Point;
  if (!view || !rect || !bounds || !stageTransform?.apply || !PointClass) return null;

  try {
    const topLeft = stageTransform.apply(new PointClass(bounds.x, bounds.y));
    const bottomRight = stageTransform.apply(new PointClass(bounds.x + bounds.width, bounds.y + bounds.height));
    const renderWidth = Number(view.width) || rect.width;
    const renderHeight = Number(view.height) || rect.height;
    const scaleX = rect.width / renderWidth;
    const scaleY = rect.height / renderHeight;
    const left = rect.left + Math.min(topLeft.x, bottomRight.x) * scaleX;
    const top = rect.top + Math.min(topLeft.y, bottomRight.y) * scaleY;
    const width = Math.max(24, Math.abs(bottomRight.x - topLeft.x) * scaleX);
    const height = Math.max(24, Math.abs(bottomRight.y - topLeft.y) * scaleY);
    return { left, top, width, height };
  } catch (_error) {
    return null;
  }
}

function clearBetterInvTokenDropFeedback() {
  betterInvTokenDropOverlay?.remove?.();
  betterInvTokenDropOverlay = null;
  betterInvTokenDropTargetId = null;
}

function showBetterInvTokenDropFeedback(token) {
  if (!token?.actor) return clearBetterInvTokenDropFeedback();
  const tokenId = String(token.id ?? token.document?.id ?? token.actor.id);
  const screenRect = getBetterInvTokenScreenRect(token);
  if (!screenRect) return clearBetterInvTokenDropFeedback();

  if (!betterInvTokenDropOverlay) {
    betterInvTokenDropOverlay = document.createElement("div");
    betterInvTokenDropOverlay.className = "betterinv-token-drop-feedback";
    betterInvTokenDropOverlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(betterInvTokenDropOverlay);
  }

  betterInvTokenDropTargetId = tokenId;
  betterInvTokenDropOverlay.style.left = `${screenRect.left}px`;
  betterInvTokenDropOverlay.style.top = `${screenRect.top}px`;
  betterInvTokenDropOverlay.style.width = `${screenRect.width}px`;
  betterInvTokenDropOverlay.style.height = `${screenRect.height}px`;
  betterInvTokenDropOverlay.innerHTML = `<span><i class="fas fa-gift" aria-hidden="true"></i>${escapeHtml(token.actor.name)}</span>`;
}

function installBetterInvTokenDropFeedback() {
  if (betterInvTokenDropFeedbackInstalled) return;
  betterInvTokenDropFeedbackInstalled = true;

  document.addEventListener("dragover", event => {
    if (!betterInvActiveItemDrag?.allowTransfer) return;
    const point = getBetterInvCanvasPointFromDragEvent(event);
    if (!point) {
      clearBetterInvTokenDropFeedback();
      return;
    }

    const token = findBetterInvTokenAtCanvasPoint(canvas, point.x, point.y);
    if (!isBetterInvValidTokenTransferTarget(token, betterInvActiveItemDrag.sourceActorId)) {
      clearBetterInvTokenDropFeedback();
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    showBetterInvTokenDropFeedback(token);
  }, true);

  document.addEventListener("drop", () => {
    window.setTimeout(clearBetterInvTokenDropFeedback, 0);
  }, true);

  document.addEventListener("dragend", () => {
    clearBetterInvTokenDropFeedback();
    removeBetterInvItemDragPreview();
    betterInvActiveItemDrag = null;
  }, true);

  window.addEventListener("blur", clearBetterInvTokenDropFeedback);
}

async function confirmBetterInvTokenItemTransfer(sourceItem, targetActor, quantity) {
  const amount = Math.max(1, Math.trunc(Number(quantity) || 1));
  const amountText = amount > 1 ? `${formatBetterInvNumber(amount)}× ` : "";
  return await openBetterInvConfirmDialog({
    title: "Gegenstand übergeben",
    kicker: "Übergabe bestätigen",
    icon: "fa-right-left",
    variant: "transfer",
    confirmLabel: "Übergeben",
    width: 500,
    contentHtml: `
      <div class="betterinv-confirm-transfer-route">
        <span class="betterinv-confirm-transfer-entity">
          <img src="${escapeAttr(sourceItem?.img || "icons/svg/item-bag.svg")}" alt="">
          <span><small>Gegenstand</small><strong>${escapeHtml(amountText)}${escapeHtml(sourceItem?.name || "Unbekannter Gegenstand")}</strong></span>
        </span>
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
        <span class="betterinv-confirm-transfer-entity">
          <img src="${escapeAttr(targetActor?.img || "icons/svg/mystery-man.svg")}" alt="">
          <span><small>Empfänger</small><strong>${escapeHtml(targetActor?.name || "Unbekannter Charakter")}</strong></span>
        </span>
      </div>
      <p>Möchtest du diese Übergabe wirklich durchführen?</p>`,
    note: "Der Gegenstand wird aus deinem Inventar entfernt und beim Zielcharakter angelegt."
  });
}

function findBetterInvTokenAtCanvasPoint(canvasInstance, x, y) {
  const pointX = Number(x);
  const pointY = Number(y);
  if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
  const placeables = Array.from(canvasInstance?.tokens?.placeables ?? canvas?.tokens?.placeables ?? []).reverse();
  return placeables.find(token => {
    try {
      const bounds = token.bounds ?? token.getBounds?.();
      if (bounds?.contains?.(pointX, pointY)) return true;
    } catch (_error) {}

    const document = token.document ?? token;
    const gridSize = Number(canvasInstance?.grid?.size ?? canvas?.grid?.size ?? 100);
    const left = Number(document.x ?? token.x ?? 0);
    const top = Number(document.y ?? token.y ?? 0);
    const width = Number(document.width ?? 1) * gridSize;
    const height = Number(document.height ?? 1) * gridSize;
    return pointX >= left && pointX <= left + width && pointY >= top && pointY <= top + height;
  }) ?? null;
}

async function handleBetterInvCanvasItemDrop(canvasInstance, data, event) {
  if (String(data?.type ?? "") !== "BetterInventoryItemTransfer") return;
  if (!getBetterInvFeaturePlan().itemTransfer) return;

  event?.preventDefault?.();
  event?.stopPropagation?.();
  const token = findBetterInvTokenAtCanvasPoint(canvasInstance, data.x, data.y);
  if (!token?.actor) {
    ui.notifications.warn("Lege das Item direkt auf einem Token ab.");
    return;
  }

  let sourceActor = null;
  let sourceItem = null;
  if (data.sourceActorUuid && typeof globalThis.fromUuid === "function") {
    try { sourceActor = await globalThis.fromUuid(data.sourceActorUuid); }
    catch (_error) {}
  }
  sourceActor ??= game.actors?.get?.(data.sourceActorId) ?? null;
  if (sourceActor && data.sourceItemUuid && typeof globalThis.fromUuid === "function") {
    try { sourceItem = await globalThis.fromUuid(data.sourceItemUuid); }
    catch (_error) {}
  }
  sourceItem ??= sourceActor?.items?.get?.(data.sourceItemId) ?? null;

  if (!sourceActor || !sourceItem) throw new Error("Das gezogene Quellitem existiert nicht mehr.");
  const targetActor = token.actor;
  if (targetActor.id === sourceActor.id) {
    ui.notifications.info("Das Item liegt bereits bei diesem Charakter.");
    return;
  }
  if (!isBetterInvPlayerCharacterActor(targetActor)) {
    ui.notifications.warn("Items können per Token-Drop nur an Spielercharaktere übergeben werden, nicht an NPCs.");
    return;
  }
  if (!canBetterInvUserModifyActor(targetActor)) {
    ui.notifications.warn(`Du darfst ${targetActor.name} nicht bearbeiten.`);
    return;
  }

  const quantity = getItemQuantityData(sourceItem).value;
  clearBetterInvTokenDropFeedback();
  const confirmed = await confirmBetterInvTokenItemTransfer(sourceItem, targetActor, quantity);
  if (!confirmed) return;

  await withBetterInvRefreshBatch(
    () => transferBetterInvItemToActor(sourceActor, sourceItem, targetActor, quantity),
    { forceRefresh: true }
  );
}


const BETTER_INV_INVENTORY_ITEM_TYPES = [
  "weapon",
  "equipment",
  "consumable",
  "tool",
  "loot",
  "container",
  "backpack"
];

const BETTER_INV_INVENTORY_ITEM_TYPE_LABELS = {
  weapon: "Waffen",
  equipment: "Ausrüstung",
  consumable: "Verbrauchsgegenstände",
  tool: "Werkzeuge",
  loot: "Beute",
  container: "Behälter",
  backpack: "Rucksäcke"
};

function isBetterInvInventoryItemType(type) {
  return BETTER_INV_INVENTORY_ITEM_TYPES.includes(String(type ?? "").toLowerCase());
}

function getBetterInvInventoryItemTypeLabel(type) {
  const normalized = String(type ?? "").toLowerCase();
  return BETTER_INV_INVENTORY_ITEM_TYPE_LABELS[normalized] ?? getBetterInvItemTypeLabel(normalized);
}

function getBetterInvCreatableItemTypes() {
  const configured = new Set([
    ...(Array.isArray(game.system?.documentTypes?.Item) ? game.system.documentTypes.Item : []),
    ...Object.keys(CONFIG.Item?.dataModels ?? {}),
    ...Object.keys(CONFIG.Item?.typeLabels ?? {})
  ]);
  const supported = BETTER_INV_INVENTORY_ITEM_TYPES.filter(type => configured.has(type));
  return supported.length ? supported : [...BETTER_INV_INVENTORY_ITEM_TYPES];
}

function getBetterInvItemTypeLabel(type) {
  const key = CONFIG.Item?.typeLabels?.[type] ?? `TYPES.Item.${type}`;
  const localized = game.i18n?.localize?.(key);
  if (localized && localized !== key) return localized;
  return String(type ?? "Item").replace(/(^|[-_\s])([a-z])/g, (_match, space, letter) => `${space ? " " : ""}${letter.toUpperCase()}`);
}


function getBetterInvCompendiumLabel(pack) {
  return String(pack?.metadata?.label ?? pack?.title ?? pack?.collection ?? "Unbenanntes Kompendium");
}

function getBetterInvCompendiumId(pack) {
  return String(pack?.collection ?? pack?.metadata?.id ?? pack?.metadata?.name ?? "");
}

function getBetterInvCompendiumDocumentName(pack) {
  return String(
    pack?.documentName
    ?? pack?.documentClass?.documentName
    ?? pack?.metadata?.type
    ?? pack?.metadata?.documentName
    ?? ""
  ).toLowerCase();
}

function getBetterInvCompendiumSourceInfo(pack) {
  const metadata = pack?.metadata ?? {};
  const packId = getBetterInvCompendiumId(pack);
  const rawPackage = metadata.package;
  const packageName = String([
    metadata.packageName,
    rawPackage && typeof rawPackage === "object" ? rawPackage.name : null,
    metadata.module
  ].find(value => typeof value === "string" && value.trim()) ?? "");

  let type = String([
    metadata.packageType,
    rawPackage && typeof rawPackage === "object" ? rawPackage.type : null
  ].find(value => typeof value === "string" && value.trim()) ?? "").toLowerCase();

  if (!type) {
    if (packId.startsWith("world.")) type = "world";
    else if (game.system?.id && packId.startsWith(`${game.system.id}.`)) type = "system";
    else if (packageName) type = packageName === game.system?.id ? "system" : "module";
  }

  const definitions = {
    system: { key: "system", label: "System", rank: 1 },
    world: { key: "world", label: "Welt", rank: 2 },
    module: { key: "module", label: "Modul", rank: 3 }
  };
  const base = definitions[type] ?? { key: "unknown", label: "Kompendium", rank: 4 };
  return {
    ...base,
    packageName,
    title: packageName ? `${base.label}: ${packageName}` : base.label
  };
}

function getBetterInvAccessibleItemCompendiums() {
  const packsCollection = game.packs;
  if (!packsCollection) return [];

  let packs = [];
  if (Array.isArray(packsCollection.contents)) packs = packsCollection.contents;
  else if (typeof packsCollection.values === "function") packs = Array.from(packsCollection.values());
  else {
    try { packs = Array.from(packsCollection); }
    catch (_error) { packs = []; }
  }

  const seen = new Set();
  return packs
    .filter(pack => {
      if (!pack) return false;
      if (getBetterInvCompendiumDocumentName(pack) !== "item") return false;
      if (pack.visible === false) return false;
      if (typeof pack.getIndex !== "function") return false;

      const id = getBetterInvCompendiumId(pack);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((left, right) => {
      const leftLabel = getBetterInvCompendiumLabel(left);
      const rightLabel = getBetterInvCompendiumLabel(right);
      return leftLabel.localeCompare(rightLabel, game.i18n?.lang ?? undefined, { sensitivity: "base" });
    });
}

function getBetterInvCompendiumById(packId) {
  const cleanId = String(packId ?? "").trim();
  if (!cleanId) return null;

  const direct = game.packs?.get?.(cleanId);
  if (direct) return direct;

  return getBetterInvAccessibleItemCompendiums()
    .find(pack => getBetterInvCompendiumId(pack) === cleanId) ?? null;
}

function deleteBetterInvNestedProperty(object, path) {
  if (!object || typeof object !== "object") return;
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (!parts.length) return;
  let current = object;
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current?.[parts[index]];
    if (!current || typeof current !== "object") return;
  }
  delete current[parts.at(-1)];
}

function prepareBetterInvCompendiumItemData(sourceItem, selected = null) {
  if (!sourceItem || typeof sourceItem.toObject !== "function") {
    throw new Error("Das ausgewählte Kompendium-Item konnte nicht gelesen werden.");
  }

  const data = sourceItem.toObject();
  if (!data || typeof data !== "object") {
    throw new Error("Das Kompendium-Item enthält keine gültigen Itemdaten.");
  }

  const itemType = String(data.type ?? sourceItem.type ?? selected?.type ?? "").toLowerCase();
  const creatableTypes = new Set(getBetterInvCreatableItemTypes().map(type => String(type).toLowerCase()));
  if (!isBetterInvInventoryItemType(itemType) || !creatableTypes.has(itemType)) {
    throw new Error(`Der Gegenstandstyp „${getBetterInvItemTypeLabel(itemType || "unbekannt")}“ wird vom aktuellen Spielsystem nicht als Inventargegenstand unterstützt.`);
  }

  data.name = String(data.name ?? sourceItem.name ?? selected?.name ?? "Unbenannter Gegenstand");
  data.type = itemType;
  if (!data.img && (sourceItem.img || selected?.img)) data.img = sourceItem.img || selected.img;

  // Embedded actor items receive a fresh id and do not use world-folder or
  // ownership metadata from the compendium document.
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  delete data.permission;
  delete data._stats;

  // Preserve the source UUID while removing Better Inventory's actor-specific
  // organization flags which would be stale on the receiving actor.
  data.flags = data.flags && typeof data.flags === "object" ? data.flags : {};
  delete data.flags[MODULE_ID];
  data.flags.core = data.flags.core && typeof data.flags.core === "object" ? data.flags.core : {};
  const sourceUuid = String(sourceItem.uuid ?? selected?.uuid ?? "");
  if (!data.flags.core.sourceId && sourceUuid) data.flags.core.sourceId = sourceUuid;

  // A compendium entry can contain stale container references. They must never
  // point at an unrelated actor item after import. The selected active container
  // is assigned explicitly after creation through moveItemToContainer().
  const sourceContainer = foundry.utils.getProperty(data, "system.container");
  if (sourceContainer && typeof sourceContainer === "object" && !Array.isArray(sourceContainer)) {
    foundry.utils.setProperty(data, "system.container", {
      ...foundry.utils.deepClone(sourceContainer),
      id: null,
      uuid: null,
      value: null
    });
  } else if (sourceContainer !== undefined && sourceContainer !== null) {
    foundry.utils.setProperty(data, "system.container", "");
  }
  [
    "system.containerId",
    "system.containerUuid",
    "flags.dnd5e.containerId",
    "flags.dnd5e.containerUuid"
  ].forEach(path => deleteBetterInvNestedProperty(data, path));

  return data;
}

async function getBetterInvCompendiumDocument(pack, selected) {
  let primaryError = null;
  if (typeof pack?.getDocument === "function") {
    try {
      const document = await pack.getDocument(selected.id);
      if (document) return document;
    } catch (error) {
      primaryError = error;
      console.warn("Better Inventory | Kompendium getDocument fehlgeschlagen, UUID-Fallback wird versucht", error);
    }
  }

  if (selected?.uuid && typeof globalThis.fromUuid === "function") {
    try {
      const document = await globalThis.fromUuid(selected.uuid);
      if (document) return document;
    } catch (error) {
      if (!primaryError) primaryError = error;
      console.warn("Better Inventory | Kompendium UUID-Fallback fehlgeschlagen", error);
    }
  }

  const detail = primaryError?.message ? ` (${primaryError.message})` : "";
  throw new Error(`Das ausgewählte Item wurde im Kompendium nicht gefunden${detail}.`);
}

async function importBetterInvCompendiumItem(actor, selected, activeContainer = null) {
  if (!actor) throw new Error("Kein Actor für den Import ausgewählt.");
  if (!selected?.packId || !selected?.id) throw new Error("Das ausgewählte Kompendium-Item ist unvollständig.");
  if (typeof actor.canUserModify === "function" && !actor.canUserModify(game.user, "update")) {
    throw new Error(`Du hast keine Berechtigung, Items auf ${actor.name} zu erstellen.`);
  }

  const pack = getBetterInvCompendiumById(selected.packId);
  if (!pack || pack.visible === false) {
    throw new Error("Das ausgewählte Kompendium ist nicht mehr zugänglich.");
  }

  const sourceItem = await getBetterInvCompendiumDocument(pack, selected);
  const documentName = String(sourceItem.documentName ?? sourceItem.constructor?.documentName ?? "Item").toLowerCase();
  if (documentName !== "item") {
    throw new Error("Der ausgewählte Kompendiumseintrag ist kein Item.");
  }

  const itemData = prepareBetterInvCompendiumItemData(sourceItem, selected);
  const created = await actor.createEmbeddedDocuments("Item", [itemData]);
  const item = created?.[0] ?? null;
  if (!item) throw new Error("Foundry hat nach dem Import kein Item zurückgegeben.");

  try {
    if (activeContainer) await moveItemToContainer(item, activeContainer);
    await setItemCategory(item, "__unsorted", activeContainer?.id ?? null);
  } catch (error) {
    console.warn("Better Inventory | Importiertes Item wurde erstellt, aber nicht vollständig einsortiert", error);
    ui.notifications.warn(`${item.name} wurde importiert, konnte aber nicht vollständig einsortiert werden.`);
  }

  const packLabel = getBetterInvCompendiumLabel(pack);
  const sourceInfo = getBetterInvCompendiumSourceInfo(pack);
  ui.notifications.info(`${item.name} wurde aus ${packLabel} (${sourceInfo.label}) auf ${actor.name} kopiert.`);
  openItemSheet(item);
  return item;
}

function getBetterInvCollectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return Array.from(collection.values());
  if (Array.isArray(collection)) return collection;
  try { return Array.from(collection); }
  catch (_error) { return []; }
}

function normalizeBetterInvSearchText(value) {
  const text = String(value ?? "");
  try {
    return text.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase(game.i18n?.lang ?? undefined);
  } catch (_error) {
    return text.toLowerCase();
  }
}

function getBetterInvCompendiumEntryId(entry) {
  const direct = entry?._id ?? entry?.id ?? entry?.documentId ?? entry?._source?._id;
  if (direct) return String(direct);
  const uuid = String(entry?.uuid ?? entry?._source?.uuid ?? "");
  return uuid ? uuid.split(".").at(-1) : "";
}

function getBetterInvCompendiumEntryType(entry) {
  const candidates = [
    entry?.type,
    entry?.itemType,
    entry?._source?.type,
    entry?.document?.type
  ];
  return String(candidates.find(value => typeof value === "string" && value.trim()) ?? "").toLowerCase();
}

function getBetterInvCompendiumEntryName(entry) {
  return String(entry?.name ?? entry?.label ?? entry?._source?.name ?? "Unbenannter Gegenstand");
}

function getBetterInvCompendiumEntryImage(entry) {
  return String(
    entry?.img
    ?? entry?.image
    ?? entry?.texture?.src
    ?? entry?._source?.img
    ?? "icons/svg/item-bag.svg"
  );
}

async function getBetterInvCompendiumIndexEntries(pack) {
  const requestedFields = ["name", "type", "img"];
  const attempts = [
    async () => await pack.getIndex({ fields: requestedFields }),
    async () => await pack.getIndex()
  ];
  let lastError = null;

  for (let index = 0; index < attempts.length; index += 1) {
    try {
      const collection = await attempts[index]();
      const entries = getBetterInvCollectionValues(collection);
      if (!entries.length) continue;

      const hasTypeData = entries.some(entry => getBetterInvCompendiumEntryType(entry));
      const hasMissingTypeData = entries.some(entry => !getBetterInvCompendiumEntryType(entry));
      if (index === 0 && (!hasTypeData || hasMissingTypeData)) continue;
      return { entries, usedFallback: index > 0 };
    } catch (error) {
      lastError = error;
    }
  }

  const cachedEntries = getBetterInvCollectionValues(pack?.index);
  if (cachedEntries.length) return { entries: cachedEntries, usedFallback: true };
  if (lastError) throw lastError;
  return { entries: [], usedFallback: false };
}

async function loadBetterInvCompendiumIndexItems(packs) {
  const creatableTypes = new Set(getBetterInvCreatableItemTypes().map(type => String(type).toLowerCase()));
  const settled = await Promise.allSettled(Array.from(packs ?? []).map(async pack => {
    const packId = getBetterInvCompendiumId(pack);
    if (!packId) throw new Error("Kompendium ohne Kennung gefunden.");

    const { entries, usedFallback } = await getBetterInvCompendiumIndexEntries(pack);
    const packLabel = getBetterInvCompendiumLabel(pack);
    const sourceInfo = getBetterInvCompendiumSourceInfo(pack);
    const seen = new Set();
    const stats = {
      totalEntries: entries.length,
      invalidEntries: 0,
      filteredEntries: 0,
      unsupportedEntries: 0,
      duplicateEntries: 0,
      usedFallback
    };

    const items = [];
    for (const entry of entries) {
      const id = getBetterInvCompendiumEntryId(entry);
      const type = getBetterInvCompendiumEntryType(entry);
      if (!id) {
        stats.invalidEntries += 1;
        continue;
      }
      if (!isBetterInvInventoryItemType(type)) {
        stats.filteredEntries += 1;
        continue;
      }
      if (!creatableTypes.has(type)) {
        stats.unsupportedEntries += 1;
        continue;
      }

      const key = `${packId}:${id}`;
      if (seen.has(key)) {
        stats.duplicateEntries += 1;
        continue;
      }
      seen.add(key);

      const name = getBetterInvCompendiumEntryName(entry);
      const img = getBetterInvCompendiumEntryImage(entry);
      const typeLabel = getBetterInvInventoryItemTypeLabel(type);
      const uuid = String(entry?.uuid ?? `Compendium.${packId}.${id}`);
      items.push({
        key,
        id,
        name,
        type,
        typeLabel,
        img,
        packId,
        packLabel,
        packSourceKey: sourceInfo.key,
        packSourceLabel: sourceInfo.label,
        packSourceTitle: sourceInfo.title,
        uuid,
        searchText: normalizeBetterInvSearchText(`${name} ${type} ${typeLabel} ${packLabel} ${sourceInfo.label} ${sourceInfo.packageName}`)
      });
    }

    return { items, stats, pack };
  }));

  const items = [];
  const failedPacks = [];
  const stats = {
    fallbackPacks: 0,
    emptyPacks: 0,
    invalidEntries: 0,
    filteredEntries: 0,
    unsupportedEntries: 0,
    duplicateEntries: 0,
    sourceCounts: { system: 0, world: 0, module: 0, unknown: 0 }
  };

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      const packStats = result.value.stats;
      const sourceInfo = getBetterInvCompendiumSourceInfo(result.value.pack);
      if (result.value.items.length) {
        stats.sourceCounts[sourceInfo.key] = (stats.sourceCounts[sourceInfo.key] ?? 0) + 1;
      } else {
        stats.emptyPacks += 1;
      }
      if (packStats.usedFallback) stats.fallbackPacks += 1;
      stats.invalidEntries += packStats.invalidEntries;
      stats.filteredEntries += packStats.filteredEntries;
      stats.unsupportedEntries += packStats.unsupportedEntries;
      stats.duplicateEntries += packStats.duplicateEntries;
    } else {
      failedPacks.push({
        pack: packs[index],
        error: result.reason
      });
    }
  });

  items.sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name, game.i18n?.lang ?? undefined, { sensitivity: "base" });
    if (nameComparison) return nameComparison;
    return left.packLabel.localeCompare(right.packLabel, game.i18n?.lang ?? undefined, { sensitivity: "base" });
  });

  return { items, failedPacks, stats };
}

async function promptBetterInvCompendiumItem(packs) {
  const availablePacks = Array.from(packs ?? []);
  if (!availablePacks.length) return null;

  const { items, failedPacks, stats } = await loadBetterInvCompendiumIndexItems(availablePacks);
  if (!items.length) {
    const failedSuffix = failedPacks.length ? ` ${failedPacks.length} Kompendium/Kompendien konnten nicht gelesen werden.` : "";
    ui.notifications.warn(`In den zugänglichen Item-Kompendien wurden keine Inventargegenstände gefunden.${failedSuffix}`);
    return null;
  }

  const indexedPacks = Array.from(new Map(items.map(item => [item.packId, {
    id: item.packId,
    label: item.packLabel,
    sourceKey: item.packSourceKey,
    sourceLabel: item.packSourceLabel,
    sourceTitle: item.packSourceTitle
  }])).values()).sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang ?? undefined, { sensitivity: "base" }));
  const packOptions = indexedPacks.map(pack => `
    <button type="button" class="betterinv-compendium-dropdown-option" data-compendium-dropdown-option data-value="${escapeAttr(pack.id)}" role="option" aria-selected="false" title="${escapeAttr(pack.sourceTitle)}">
      <span>${escapeHtml(pack.label)}</span>
      <small class="betterinv-compendium-source betterinv-compendium-source-${escapeAttr(pack.sourceKey)}">${escapeHtml(pack.sourceLabel)}</small>
    </button>`).join("");

  const sourceSummary = [
    stats.sourceCounts.system ? `${stats.sourceCounts.system} System` : "",
    stats.sourceCounts.world ? `${stats.sourceCounts.world} Welt` : "",
    stats.sourceCounts.module ? `${stats.sourceCounts.module} Modul` : "",
    stats.sourceCounts.unknown ? `${stats.sourceCounts.unknown} sonstige` : ""
  ].filter(Boolean).join(" · ");
  const skippedEntries = stats.invalidEntries + stats.unsupportedEntries + stats.duplicateEntries;
  const diagnosticsTitle = [
    sourceSummary,
    stats.fallbackPacks ? `${stats.fallbackPacks} Kompendien über Kompatibilitäts-Fallback gelesen` : "",
    skippedEntries ? `${skippedEntries} ungültige, doppelte oder nicht unterstützte Einträge übersprungen` : "",
    failedPacks.length ? `${failedPacks.length} Kompendien konnten nicht gelesen werden` : ""
  ].filter(Boolean).join(" · ");

  const availableTypes = new Set(items.map(item => item.type).filter(Boolean));
  const typeValues = BETTER_INV_INVENTORY_ITEM_TYPES.filter(type => availableTypes.has(type));
  const typeOptions = typeValues.map(type => `
    <button type="button" class="betterinv-compendium-dropdown-option" data-compendium-dropdown-option data-value="${escapeAttr(type)}" role="option" aria-selected="false">
      <span>${escapeHtml(getBetterInvInventoryItemTypeLabel(type))}</span>
    </button>`).join("");

  return await new Promise(resolve => {
    let settled = false;
    let selectedKey = "";
    let dialog;

    const done = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const choose = value => {
      done(value);
      dialog?.close?.();
    };

    dialog = new Dialog({
      title: "Gegenstand aus Kompendium auswählen",
      content: `
        <div class="betterinv-compendium-browser" data-betterinv-compendium-browser>
          <header class="betterinv-compendium-browser-header">
            <div>
              <span class="betterinv-compendium-browser-kicker">Kompendien durchsuchen</span>
              <h3>Gegenstand auswählen</h3>
              <p>Es werden nur Inventargegenstände wie Waffen, Ausrüstung, Verbrauchsgegenstände, Werkzeuge, Beute und Behälter angezeigt.</p>
            </div>
            <span class="betterinv-compendium-browser-total" title="${escapeAttr(diagnosticsTitle)}">
              ${escapeHtml(formatBetterInvNumber(items.length))} Gegenstände · ${escapeHtml(formatBetterInvNumber(indexedPacks.length))} Kompendien
              ${sourceSummary ? `<small>${escapeHtml(sourceSummary)}</small>` : ""}
            </span>
          </header>

          <div class="betterinv-compendium-browser-filters">
            <label class="betterinv-compendium-browser-search">
              <span>Suche</span>
              <span class="betterinv-compendium-browser-input-wrap">
                <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                <input type="search" data-compendium-search placeholder="Name oder Kompendium …" autocomplete="off">
              </span>
            </label>
            <div class="betterinv-compendium-browser-filter">
              <span>Kompendium</span>
              <div class="betterinv-compendium-dropdown" data-compendium-dropdown="pack">
                <button type="button" class="betterinv-compendium-dropdown-toggle" data-compendium-dropdown-toggle aria-haspopup="listbox" aria-expanded="false">
                  <span data-compendium-dropdown-label>Alle Kompendien</span>
                  <i class="fas fa-chevron-down" aria-hidden="true"></i>
                </button>
                <div class="betterinv-compendium-dropdown-menu" data-compendium-dropdown-menu role="listbox" hidden>
                  <button type="button" class="betterinv-compendium-dropdown-option is-selected" data-compendium-dropdown-option data-value="" role="option" aria-selected="true">
                    <span>Alle Kompendien</span>
                  </button>
                  ${packOptions}
                </div>
              </div>
            </div>
            <div class="betterinv-compendium-browser-filter">
              <span>Gegenstandsart</span>
              <div class="betterinv-compendium-dropdown" data-compendium-dropdown="type">
                <button type="button" class="betterinv-compendium-dropdown-toggle" data-compendium-dropdown-toggle aria-haspopup="listbox" aria-expanded="false">
                  <span data-compendium-dropdown-label>Alle Gegenstände</span>
                  <i class="fas fa-chevron-down" aria-hidden="true"></i>
                </button>
                <div class="betterinv-compendium-dropdown-menu" data-compendium-dropdown-menu role="listbox" hidden>
                  <button type="button" class="betterinv-compendium-dropdown-option is-selected" data-compendium-dropdown-option data-value="" role="option" aria-selected="true">
                    <span>Alle Gegenstände</span>
                  </button>
                  ${typeOptions}
                </div>
              </div>
            </div>
          </div>

          <div class="betterinv-compendium-browser-summary">
            <span data-compendium-result-count></span>
            <span class="betterinv-compendium-browser-diagnostics">
              ${stats.fallbackPacks ? `<span class="betterinv-compendium-browser-compat" title="Diese Kompendien haben den reduzierten Foundry-Index nicht akzeptiert und wurden über den vollständigen Index geladen."><i class="fas fa-shield-halved" aria-hidden="true"></i>${stats.fallbackPacks} kompatibel geladen</span>` : ""}
              ${skippedEntries ? `<span class="betterinv-compendium-browser-warning" title="Ungültige, doppelte oder vom aktuellen Spielsystem nicht unterstützte Einträge wurden sicher übersprungen."><i class="fas fa-filter-circle-xmark" aria-hidden="true"></i>${skippedEntries} übersprungen</span>` : ""}
              ${failedPacks.length ? `<span class="betterinv-compendium-browser-warning" title="Einige Kompendien konnten nicht gelesen werden."><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>${failedPacks.length} nicht gelesen</span>` : ""}
            </span>
          </div>

          <div class="betterinv-compendium-browser-results" data-compendium-results role="listbox" aria-label="Gefundene Inventargegenstände"></div>

          <footer class="betterinv-compendium-browser-footer">
            <span class="betterinv-compendium-browser-selection" data-compendium-selection>Kein Gegenstand ausgewählt</span>
            <div>
              <button type="button" class="betterinv-compendium-browser-cancel" data-compendium-cancel>
                <i class="fas fa-xmark" aria-hidden="true"></i>
                <span>Abbrechen</span>
              </button>
              <button type="button" class="betterinv-compendium-browser-confirm" data-compendium-confirm disabled>
                <i class="fas fa-check" aria-hidden="true"></i>
                <span>Auswählen</span>
              </button>
            </div>
          </footer>
        </div>`,
      buttons: {},
      close: () => done(null)
    }, {
      width: 720,
      classes: ["betterinv-compendium-browser-dialog"]
    });

    dialog.render(true);
    setTimeout(() => {
      bringFoundryDialogsToFront({ avoidOverlap: false });
      const dialogElement = dialog.element?.[0] ?? dialog.element ?? document.querySelector('.dialog.app.window-app');
      dialogElement?.classList?.add("betterinv-compendium-browser-dialog");
      const root = dialogElement?.querySelector?.("[data-betterinv-compendium-browser]");
      if (!root) return;

      const searchInput = root.querySelector("[data-compendium-search]");
      const packDropdown = root.querySelector('[data-compendium-dropdown="pack"]');
      const typeDropdown = root.querySelector('[data-compendium-dropdown="type"]');
      const resultsElement = root.querySelector("[data-compendium-results]");
      const countElement = root.querySelector("[data-compendium-result-count]");
      const selectionElement = root.querySelector("[data-compendium-selection]");
      const confirmButton = root.querySelector("[data-compendium-confirm]");
      const cancelButton = root.querySelector("[data-compendium-cancel]");
      const resultLimit = 200;
      let selectedPackId = "";
      let selectedType = "";

      const getSelectedItem = () => items.find(item => item.key === selectedKey) ?? null;

      const updateSelection = () => {
        const selected = getSelectedItem();
        if (selectionElement) {
          selectionElement.textContent = selected
            ? `${selected.name} · ${selected.packLabel} · ${selected.packSourceLabel}`
            : "Kein Gegenstand ausgewählt";
        }
        if (confirmButton) confirmButton.disabled = !selected;
      };

      const renderResults = () => {
        const query = normalizeBetterInvSearchText(searchInput?.value ?? "").trim();
        const packId = selectedPackId;
        const type = selectedType;
        const filtered = items.filter(item => {
          if (packId && item.packId !== packId) return false;
          if (type && item.type !== type) return false;
          if (query && !item.searchText.includes(query)) return false;
          return true;
        });

        const visible = filtered.slice(0, resultLimit);
        if (countElement) {
          countElement.textContent = filtered.length > resultLimit
            ? `${formatBetterInvNumber(resultLimit)} von ${formatBetterInvNumber(filtered.length)} Treffern angezeigt`
            : `${formatBetterInvNumber(filtered.length)} Treffer`;
        }

        if (!resultsElement) return;
        if (!visible.length) {
          resultsElement.innerHTML = `
            <div class="betterinv-compendium-browser-empty">
              <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
              <strong>Keine Gegenstände gefunden</strong>
              <span>Ändere die Suche, das Kompendium oder die Gegenstandsart.</span>
            </div>`;
          return;
        }

        resultsElement.innerHTML = visible.map(item => `
          <button type="button"
            class="betterinv-compendium-result ${item.key === selectedKey ? "is-selected" : ""}"
            data-compendium-item="${escapeAttr(item.key)}"
            role="option"
            aria-selected="${item.key === selectedKey ? "true" : "false"}"
            title="${escapeAttr(`${item.name} · ${item.typeLabel} · ${item.packLabel} · ${item.packSourceLabel}`)}">
            <img src="${escapeAttr(item.img || "icons/svg/item-bag.svg")}" alt="">
            <span class="betterinv-compendium-result-copy">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.typeLabel)}</span>
            </span>
            <span class="betterinv-compendium-result-pack">
              <span>${escapeHtml(item.packLabel)}</span>
              <small class="betterinv-compendium-source betterinv-compendium-source-${escapeAttr(item.packSourceKey)}">${escapeHtml(item.packSourceLabel)}</small>
            </span>
          </button>`).join("");

        resultsElement.querySelectorAll(".betterinv-compendium-result img").forEach(image => {
          image.addEventListener("error", () => {
            if (image.dataset.fallbackApplied === "true") return;
            image.dataset.fallbackApplied = "true";
            image.src = "icons/svg/item-bag.svg";
          }, { once: true });
        });

        resultsElement.querySelectorAll("[data-compendium-item]").forEach(button => {
          button.addEventListener("click", () => {
            selectedKey = String(button.dataset.compendiumItem ?? "");
            renderResults();
            updateSelection();
          });
          button.addEventListener("dblclick", () => {
            selectedKey = String(button.dataset.compendiumItem ?? "");
            const selected = getSelectedItem();
            if (selected) choose(selected);
          });
        });
      };

      const closeDropdowns = except => {
        root.querySelectorAll("[data-compendium-dropdown]").forEach(dropdown => {
          if (dropdown === except) return;
          const toggle = dropdown.querySelector("[data-compendium-dropdown-toggle]");
          const menu = dropdown.querySelector("[data-compendium-dropdown-menu]");
          dropdown.classList.remove("is-open");
          toggle?.setAttribute("aria-expanded", "false");
          if (menu) menu.hidden = true;
        });
      };

      const setDropdownOpen = (dropdown, open) => {
        if (!dropdown) return;
        const toggle = dropdown.querySelector("[data-compendium-dropdown-toggle]");
        const menu = dropdown.querySelector("[data-compendium-dropdown-menu]");
        if (!toggle || !menu) return;
        if (open) closeDropdowns(dropdown);
        dropdown.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        menu.hidden = !open;
      };

      const bindDropdown = (dropdown, onSelect) => {
        if (!dropdown) return;
        const toggle = dropdown.querySelector("[data-compendium-dropdown-toggle]");
        const label = dropdown.querySelector("[data-compendium-dropdown-label]");
        const options = Array.from(dropdown.querySelectorAll("[data-compendium-dropdown-option]"));

        toggle?.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          setDropdownOpen(dropdown, !dropdown.classList.contains("is-open"));
        });

        options.forEach(option => {
          option.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const value = String(option.dataset.value ?? "");
            options.forEach(entry => {
              const selected = entry === option;
              entry.classList.toggle("is-selected", selected);
              entry.setAttribute("aria-selected", selected ? "true" : "false");
            });
            if (label) label.textContent = option.textContent?.trim() || "Alle";
            onSelect(value);
            setDropdownOpen(dropdown, false);
            renderResults();
          });
        });
      };

      bindDropdown(packDropdown, value => { selectedPackId = value; });
      bindDropdown(typeDropdown, value => { selectedType = value; });

      // Handle the search in the capture phase. Foundry registers global keyboard
      // handlers on dialogs; handling the event here keeps those hotkeys away while
      // still updating the result list immediately.
      searchInput?.addEventListener("input", event => {
        event.stopPropagation();
        renderResults();
      }, { capture: true });
      ["keydown", "keyup", "keypress", "beforeinput", "paste"].forEach(type => {
        searchInput?.addEventListener(type, event => event.stopPropagation(), { capture: true });
      });

      root.addEventListener("click", event => {
        if (!event.target?.closest?.("[data-compendium-dropdown]")) closeDropdowns();
      });

      confirmButton?.addEventListener("click", () => {
        const selected = getSelectedItem();
        if (selected) choose(selected);
      });
      cancelButton?.addEventListener("click", () => choose(null));
      root.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          const openDropdown = root.querySelector("[data-compendium-dropdown].is-open");
          if (openDropdown) {
            event.preventDefault();
            event.stopPropagation();
            setDropdownOpen(openDropdown, false);
            return;
          }
          event.preventDefault();
          choose(null);
        }
        if (event.key === "Enter"
          && getSelectedItem()
          && event.target !== searchInput
          && !event.target?.closest?.("[data-compendium-dropdown]")) {
          event.preventDefault();
          choose(getSelectedItem());
        }
      });

      renderResults();
      updateSelection();
      searchInput?.focus?.();
    }, 50);
  });
}

async function promptBetterInvItemSource() {
  const itemPacks = getBetterInvAccessibleItemCompendiums();
  const packCount = itemPacks.length;
  const packLabels = itemPacks.slice(0, 3).map(getBetterInvCompendiumLabel);
  const packPreview = packLabels.length
    ? `${packLabels.join(" · ")}${packCount > packLabels.length ? ` · +${packCount - packLabels.length} weitere` : ""}`
    : "Keine für dich sichtbaren Item-Kompendien gefunden.";

  return await new Promise(resolve => {
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let dialog;
    const choose = value => {
      done(value);
      dialog?.close?.();
    };

    dialog = new Dialog({
      title: "Item hinzufügen",
      content: `
        <div class="betterinv-item-source-choice" data-betterinv-item-source>
          <div class="betterinv-item-source-heading">
            <span class="betterinv-item-source-kicker">Neue Quelle auswählen</span>
            <p>Wie möchtest du das Item hinzufügen?</p>
          </div>

          <div class="betterinv-item-source-options">
            <button type="button" class="betterinv-item-source-option" data-source="empty">
              <span class="betterinv-item-source-icon"><i class="fas fa-file" aria-hidden="true"></i></span>
              <span class="betterinv-item-source-copy">
                <strong>Leeres Item</strong>
                <span>Name und Itemtyp selbst festlegen. Danach öffnet sich das normale Foundry-Itemfenster.</span>
              </span>
              <span class="betterinv-item-source-status">Sofort erstellen</span>
            </button>

            <button type="button" class="betterinv-item-source-option betterinv-item-source-option-compendium" data-source="compendium" ${packCount ? "" : "disabled"}>
              <span class="betterinv-item-source-icon"><i class="fas fa-book-open" aria-hidden="true"></i></span>
              <span class="betterinv-item-source-copy">
                <strong>Aus Kompendium</strong>
                <span>${escapeHtml(packPreview)}</span>
              </span>
              <span class="betterinv-item-source-status ${packCount ? "is-available" : "is-unavailable"}">${packCount ? `${packCount} verfügbar` : "Keine gefunden"}</span>
            </button>
          </div>

          <button type="button" class="betterinv-item-source-cancel" data-source="cancel">
            <i class="fas fa-xmark" aria-hidden="true"></i>
            <span>Abbrechen</span>
          </button>
        </div>`,
      buttons: {},
      close: () => done(null)
    }, {
      width: 520,
      classes: ["betterinv-item-source-dialog"]
    });

    dialog.render(true);
    setTimeout(() => {
      bringFoundryDialogsToFront({ avoidOverlap: false });
      const dialogElement = dialog.element?.[0] ?? dialog.element ?? document.querySelector('.dialog.app.window-app');
      dialogElement?.classList?.add("betterinv-item-source-dialog");
      const root = dialogElement?.querySelector?.("[data-betterinv-item-source]");
      if (!root) return;

      root.querySelector('[data-source="empty"]')?.addEventListener("click", () => choose("empty"));
      root.querySelector('[data-source="compendium"]')?.addEventListener("click", () => choose("compendium"));
      root.querySelector('[data-source="cancel"]')?.addEventListener("click", () => choose(null));

      const firstOption = root.querySelector('[data-source="empty"]');
      firstOption?.focus?.();
    }, 50);
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
    }, {
      width: 450,
      classes: ["betterinv-standard-dialog", "betterinv-form-dialog", "betterinv-new-item-dialog"]
    });
    dialog.render(true);
    setTimeout(() => {
      decorateBetterInvDialog(dialog, {
        classes: ["betterinv-standard-dialog", "betterinv-form-dialog", "betterinv-new-item-dialog"],
        focusSelector: 'input[name="name"]',
        selectInput: true
      });
    }, 40);
  });
}

async function createBetterInvItem(actor, activeContainer = null) {
  if (!actor) return null;

  const source = await promptBetterInvItemSource();
  if (!source) return null;
  if (source === "compendium") {
    const itemPacks = getBetterInvAccessibleItemCompendiums();
    if (!itemPacks.length) {
      ui.notifications.warn("Es wurden keine zugänglichen Item-Kompendien gefunden.");
      return null;
    }

    const selected = await promptBetterInvCompendiumItem(itemPacks);
    if (!selected) return null;
    return await importBetterInvCompendiumItem(actor, selected, activeContainer);
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

function openBetterInvCategoryMenu(button, actor, item, categoryOptions, containerId = null) {
  const existingMenu = document.getElementById("betterinv-category-menu");
  if (existingMenu && betterInvCategoryMenuButton === button) {
    closeBetterInvCategoryMenu();
    return;
  }

  closeBetterInvItemActionMenu();
  closeBetterInvCategoryMenu();
  if (!button || !actor || !item || !Array.isArray(categoryOptions) || !categoryOptions.length) return;
  betterInvCategoryMenuButton = button;

  const current = itemCategory(item, containerId);
  const menu = document.createElement("div");
  menu.id = "betterinv-category-menu";
  menu.className = "betterinv-category-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Kategorie wählen");
  menu.innerHTML = categoryOptions.map(category => {
    const selected = category === current;
    const nested = String(category).includes("::");
    return `
      <button type="button" class="betterinv-category-menu-option ${selected ? "is-selected" : ""} ${nested ? "is-subcategory" : ""}" data-category="${escapeAttr(category)}" role="menuitemradio" aria-checked="${selected ? "true" : "false"}">
        <i class="fas ${selected ? "fa-check" : nested ? "fa-level-down-alt" : "fa-folder"}" aria-hidden="true"></i>
        <span>${escapeHtml(categoryOptionLabel(category))}</span>
      </button>`;
  }).join("");
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
  const menuController = new AbortController();
  const close = () => {
    if (closed) return;
    closed = true;
    menuController.abort();
    menu.remove();
    if (betterInvCategoryMenuCleanup === close) betterInvCategoryMenuCleanup = null;
    if (betterInvCategoryMenuButton === button) betterInvCategoryMenuButton = null;
  };
  betterInvCategoryMenuCleanup = close;

  menu.addEventListener("click", event => {
    const option = event.target instanceof Element ? event.target.closest(".betterinv-category-menu-option") : null;
    if (!option || !menu.contains(option)) return;
    event.preventDefault();
    event.stopPropagation();
    const nextCategory = String(option.dataset.category ?? "");
    if (!nextCategory || nextCategory === current) {
      close();
      return;
    }
    close();
    void (async () => {
      try {
        await withBetterInvRefreshBatch(
          () => setItemCategory(item, nextCategory, containerId),
          { forceRefresh: true }
        );
      } catch (error) {
        console.error("Better Inventory | Kategorie konnte nicht geändert werden", error);
        ui.notifications.error("Die Item-Kategorie konnte nicht geändert werden.");
      }
    })();
  }, { signal: menuController.signal });

  const onOutsidePointerDown = event => {
    if (menu.contains(event.target) || button.contains(event.target)) return;
    close();
  };
  const onKeyDown = event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  };
  setTimeout(() => {
    if (!closed) document.addEventListener("pointerdown", onOutsidePointerDown, { capture: true, signal: menuController.signal });
  }, 0);
  const onScroll = event => {
    if (menu.contains(event.target)) return;
    close();
  };
  document.addEventListener("keydown", onKeyDown, { signal: menuController.signal });
  window.addEventListener("resize", close, { once: true, signal: menuController.signal });
  window.addEventListener("scroll", onScroll, { capture: true, signal: menuController.signal });
}

function openBetterInvItemActionMenu(button, actor, item) {
  closeBetterInvCategoryMenu();
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
    ${features.itemTransfer ? `<button type="button" class="betterinv-item-action-transfer" role="menuitem"><i class="fas fa-right-left"></i><span>Übertragen</span></button>` : ""}
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
  const menuController = new AbortController();
  const close = () => {
    if (closed) return;
    closed = true;
    menuController.abort();
    menu.remove();
    if (betterInvActionMenuCleanup === close) betterInvActionMenuCleanup = null;
    if (betterInvActionMenuButton === button) betterInvActionMenuButton = null;
  };
  const onOutsidePointerDown = event => {
    if (menu.contains(event.target) || button.contains(event.target)) return;
    close();
  };
  betterInvActionMenuCleanup = close;

  menu.addEventListener("click", event => {
    const actionButton = event.target instanceof Element ? event.target.closest("button[role='menuitem']") : null;
    if (!actionButton || !menu.contains(actionButton)) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionButton.classList.contains("betterinv-item-action-equipped") ? "equipped"
      : actionButton.classList.contains("betterinv-item-action-favorite") ? "favorite"
        : actionButton.classList.contains("betterinv-item-action-transfer") ? "transfer"
          : actionButton.classList.contains("betterinv-item-action-duplicate") ? "duplicate"
            : actionButton.classList.contains("betterinv-item-action-delete") ? "delete"
              : null;
    if (!action) return;
    close();

    void (async () => {
      try {
        if (action === "equipped") await toggleBetterInvItemEquipped(item);
        else if (action === "favorite") await toggleBetterInvFavorite(item);
        else if (action === "transfer") await transferBetterInvItem(actor, item);
        else if (action === "duplicate") await duplicateBetterInvItem(actor, item);
        else if (action === "delete") await deleteBetterInvItem(item);
      } catch (error) {
        const labels = {
          equipped: ["Ausrüstungsstatus konnte nicht geändert werden", "Der Ausrüstungsstatus konnte nicht geändert werden."],
          favorite: ["Favoritenstatus konnte nicht geändert werden", "Der Favoritenstatus konnte nicht geändert werden."],
          transfer: ["Item konnte nicht übertragen werden", error?.message || "Das Item konnte nicht übertragen werden."],
          duplicate: ["Item konnte nicht dupliziert werden", "Das Item konnte nicht dupliziert werden."],
          delete: ["Item konnte nicht gelöscht werden", "Das Item konnte nicht gelöscht werden."]
        };
        const [logLabel, userMessage] = labels[action] ?? ["Itemaktion fehlgeschlagen", "Die Itemaktion konnte nicht ausgeführt werden."];
        console.error(`Better Inventory | ${logLabel}`, error);
        ui.notifications.error(userMessage);
      }
    })();
  }, { signal: menuController.signal });

  setTimeout(() => {
    if (!closed) document.addEventListener("pointerdown", onOutsidePointerDown, { capture: true, signal: menuController.signal });
  }, 0);
  window.addEventListener("resize", close, { once: true, signal: menuController.signal });
  window.addEventListener("scroll", close, { once: true, capture: true, signal: menuController.signal });

}

function favoriteItemRowHtml(item, { settings = null, features = null, renderCache = null } = {}) {
  const userSettings = settings ?? getBetterInvUserSettings();
  const featurePlan = features ?? getBetterInvFeaturePlan(userSettings);
  const img = item.img || "icons/svg/item-bag.svg";
  const quantity = featurePlan.quantityControls ? getItemQuantityData(item, renderCache).value : null;
  const equipped = getItemEquippedData(item, renderCache);
  const unidentified = isBetterInvUnidentified(item, renderCache);
  return `
    <article class="betterinv-item betterinv-favorite-view betterinv-favorite-compact ${equipped.supported && equipped.value ? "betterinv-item-equipped" : ""} ${unidentified ? "betterinv-item-unidentified" : ""}" data-item-id="${item.id}" draggable="false">
      <span class="betterinv-item-grip" title="Favorit – das Original bleibt in seiner Kategorie">★</span>
      <img src="${escapeAttr(img)}" alt="">
      <div class="betterinv-item-main">
        <button type="button" class="betterinv-open-item" title="Item öffnen">${escapeHtml(item.name)}</button>
      </div>
      ${featurePlan.quantityControls && Number(quantity) > 1 ? `<span class="betterinv-favorite-quantity" title="Anzahl">×${escapeHtml(String(quantity))}</span>` : ""}
      ${featurePlan.itemActionsMenu ? `<button type="button" class="betterinv-item-actions-button" title="Weitere Item-Aktionen" aria-label="Weitere Item-Aktionen"><i class="fas fa-ellipsis-v"></i></button>` : ""}
    </article>`;
}

function itemRowHtml(item, categoryOptions, containerId, { favoriteView = false, settings = null, features = null, renderCache = null } = {}) {
  if (favoriteView) return favoriteItemRowHtml(item, { settings, features, renderCache });
  const userSettings = settings ?? getBetterInvUserSettings();
  const featurePlan = features ?? getBetterInvFeaturePlan(userSettings);
  const img = item.img || "icons/svg/item-bag.svg";
  const qty = featurePlan.quantityControls ? getItemQuantityData(item, renderCache).value : null;
  const equipped = getItemEquippedData(item, renderCache);
  const unidentified = isBetterInvUnidentified(item, renderCache);
  let weight = renderCache?.displayWeight?.get(item);
  if (weight === undefined) {
    const weightRaw = foundry.utils.getProperty(item, "system.weight") ?? foundry.utils.getProperty(item, "system.weight.value") ?? "–";
    weight = typeof weightRaw === "object" ? (weightRaw.value ?? weightRaw.total ?? "–") : weightRaw;
    renderCache?.displayWeight?.set(item, weight);
  }
  const current = itemCategory(item, containerId, renderCache);
  const showCategoryPicker = featurePlan.categoryDropdown;
  const priceHtml = featurePlan.itemValues ? betterInvItemPriceHtml(item, { unidentified, enabled: true, renderCache }) : "";

  return `
    <article class="betterinv-item ${equipped.supported && equipped.value ? "betterinv-item-equipped" : ""} ${unidentified ? "betterinv-item-unidentified" : ""}" data-item-id="${item.id}" data-category="${escapeAttr(current)}" draggable="true">
      <span class="betterinv-item-grip" title="Gedrückt halten und Item verschieben">☰</span>
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
        <button type="button" class="betterinv-category-picker" title="Kategorie ändern" aria-label="Kategorie ändern">
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>` : ""}
      ${featurePlan.itemActionsMenu ? `<button type="button" class="betterinv-item-actions-button" title="Weitere Item-Aktionen" aria-label="Weitere Item-Aktionen"><i class="fas fa-ellipsis-v"></i></button>` : ""}
    </article>`;
}

function disposeBetterInvWindowEventCycle(windowEl) {
  if (!windowEl) return;
  if (betterInvCategoryMenuButton && windowEl.contains(betterInvCategoryMenuButton)) closeBetterInvCategoryMenu();
  const activeListenerCount = Math.max(0, Number(windowEl._betterInvListenerCount) || 0);
  betterInvPerformanceState.activeDelegatedListeners = Math.max(0, betterInvPerformanceState.activeDelegatedListeners - activeListenerCount);
  windowEl._betterInvListenerCount = 0;
  windowEl._betterInvEventController?.abort?.();
  windowEl._betterInvEventController = null;
  windowEl._betterInvDragController?.abort?.();
  windowEl._betterInvDragController = null;
  if (windowEl._betterInvSearchTimer) clearTimeout(windowEl._betterInvSearchTimer);
  windowEl._betterInvSearchTimer = null;
}

function beginBetterInvWindowEventCycle(windowEl) {
  disposeBetterInvWindowEventCycle(windowEl);
  const controller = new AbortController();
  controller._betterInvOwnerWindow = windowEl;
  windowEl._betterInvEventController = controller;
  windowEl._betterInvListenerCount = 0;
  return controller;
}

function addBetterInvEventListener(target, type, listener, controller, options = {}) {
  if (!target?.addEventListener || !controller || controller.signal.aborted) return;
  target.addEventListener(type, listener, { ...options, signal: controller.signal });
  const ownerWindow = controller._betterInvOwnerWindow;
  if (ownerWindow) {
    ownerWindow._betterInvListenerCount = Math.max(0, Number(ownerWindow._betterInvListenerCount) || 0) + 1;
    betterInvPerformanceState.activeDelegatedListeners += 1;
  }
}


async function runBetterInvCurrencyAction(windowEl, actor, button, action, { logMessage, errorMessage } = {}) {
  if (!button || button.disabled || typeof action !== "function") return;
  const actionButtons = Array.from(windowEl.querySelectorAll(".betterinv-currency-action"));
  const currencyInputs = Array.from(windowEl.querySelectorAll(".betterinv-currency-input"));
  actionButtons.forEach(actionButton => { actionButton.disabled = true; });
  currencyInputs.forEach(input => { input.disabled = true; });
  button.classList.add("betterinv-currency-action-busy");
  try {
    await withBetterInvRefreshBatch(
      () => action(actor),
      { refreshResult: true }
    );
  } catch (error) {
    console.error(logMessage, error);
    if (error?.betterInvUserMessage) ui.notifications.error(error.betterInvUserMessage);
    else notifyBetterInvCurrencyError(errorMessage);
  } finally {
    const disabled = actor?.isOwner === false || isBetterInvCurrencyTransactionPending(actor);
    actionButtons.forEach(actionButton => { if (actionButton.isConnected) actionButton.disabled = disabled; });
    currencyInputs.forEach(input => { if (input.isConnected) input.disabled = disabled; });
    if (button.isConnected) button.classList.remove("betterinv-currency-action-busy");
  }
}

function installBetterInvDelegatedWindowControls(windowEl, actor, activeContainer, featurePlan, categoryOptions, controller) {
  const containerId = activeContainer?.id ?? null;
  const findTarget = (event, selector) => {
    const element = event.target instanceof Element ? event.target.closest(selector) : null;
    return element && windowEl.contains(element) ? element : null;
  };

  addBetterInvEventListener(windowEl, "click", event => {
    const categoryButton = findTarget(event, ".betterinv-category-picker");
    if (categoryButton && featurePlan.categoryDropdown) {
      event.preventDefault();
      event.stopPropagation();
      const row = categoryButton.closest(".betterinv-item");
      const item = actor?.items?.get(row?.dataset?.itemId);
      if (item) openBetterInvCategoryMenu(categoryButton, actor, item, categoryOptions, containerId);
      return;
    }
    const gmActorButton = findTarget(event, ".betterinv-gm-actor");
    if (gmActorButton) {
      event.preventDefault();
      event.stopPropagation();
      betterInvState.actorId = gmActorButton.dataset.actorId;
      betterInvState.containerId = null;
      betterInvState.search = "";
      renderBetterInvWindow({ preserveScroll: false });
      return;
    }

    const renameButton = findTarget(event, ".betterinv-active-container-rename, .betterinv-container-rename");
    if (renameButton && featurePlan.containers) {
      event.preventDefault();
      event.stopPropagation();
      const container = actor?.items?.get(renameButton.dataset.containerId);
      if (!container) return;
      void (async () => {
        try {
          const alias = await promptContainerAlias(actor, container);
          if (alias === null) return;
          await withBetterInvRefreshBatch(
            () => setContainerAlias(actor, container, alias),
            { forceRefresh: true }
          );
        } catch (error) {
          console.error("Better Inventory | Rucksackname konnte nicht geändert werden", error);
          ui.notifications.error("Der Rucksackname konnte nicht geändert werden.");
        }
      })();
      return;
    }

    const containerCard = findTarget(event, ".betterinv-container-card");
    if (containerCard && featurePlan.containers) {
      event.preventDefault();
      event.stopPropagation();
      betterInvState.containerId = containerCard.dataset.containerId;
      renderBetterInvWindow();
      return;
    }

    const passiveField = findTarget(event, ".betterinv-quantity-value, .betterinv-currency-input");
    if (passiveField) {
      event.stopPropagation();
      return;
    }

    const currencyButton = findTarget(event, ".betterinv-currency-action");
    if (currencyButton && featurePlan.currencyCalculator) {
      event.preventDefault();
      event.stopPropagation();
      const config = currencyButton.matches(".betterinv-currency-add")
        ? [addBetterInvCurrency, "Better Inventory | Währung konnte nicht hinzugefügt werden", "Die Münzen konnten nicht hinzugefügt werden."]
        : currencyButton.matches(".betterinv-currency-remove")
          ? [removeBetterInvCurrency, "Better Inventory | Währung konnte nicht entfernt werden", "Die Münzen konnten nicht bezahlt oder entfernt werden."]
          : currencyButton.matches(".betterinv-currency-exchange-down")
            ? [exchangeBetterInvCurrencyDown, "Better Inventory | Münzen konnten nicht abgerundet werden", "Die Münzen konnten nicht abgerundet werden."]
            : currencyButton.matches(".betterinv-currency-exchange-up")
              ? [exchangeBetterInvCurrencyUp, "Better Inventory | Münzen konnten nicht aufgerundet werden", "Die Münzen konnten nicht aufgerundet werden."]
              : currencyButton.matches(".betterinv-currency-transfer") && featurePlan.currencyTransfer
                ? [transferBetterInvCurrency, "Better Inventory | Münzen konnten nicht übertragen werden", "Die Münzen konnten nicht übertragen werden."]
                : null;
      if (config) {
        const [action, logMessage, errorMessage] = config;
        void runBetterInvCurrencyAction(windowEl, actor, currencyButton, action, { logMessage, errorMessage });
      }
      return;
    }

    const button = findTarget(event, [
      ".betterinv-quantity-minus",
      ".betterinv-quantity-plus",
      ".betterinv-edit-item",
      ".betterinv-item-actions-button",
      ".betterinv-open-item"
    ].join(","));
    if (!button) return;

    const row = button.closest(".betterinv-item");
    const item = actor?.items?.get(row?.dataset?.itemId);
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();

    if (button.matches(".betterinv-edit-item")) {
      openItemSheet(item);
      return;
    }

    if (button.matches(".betterinv-item-actions-button")) {
      openBetterInvItemActionMenu(button, actor, item);
      return;
    }

    if (button.matches(".betterinv-open-item")) {
      void useOrOpenItem(item, event).catch(error => {
        console.error("Better Inventory | Item konnte nicht geöffnet oder benutzt werden", error);
        ui.notifications.error("Das Item konnte nicht geöffnet oder benutzt werden.");
      });
      return;
    }

    if (!featurePlan.quantityControls || button.disabled) return;
    button.disabled = true;
    void (async () => {
      try {
        const delta = button.classList.contains("betterinv-quantity-plus") ? 1 : -1;
        await changeItemQuantity(item, delta);
      } catch (error) {
        console.error("Better Inventory | Menge konnte nicht geändert werden", error);
        ui.notifications.error("Die Item-Anzahl konnte nicht geändert werden.");
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    })();
  }, controller);

  addBetterInvEventListener(windowEl, "focusin", event => {
    const currencyField = findTarget(event, ".betterinv-currency-input");
    if (currencyField && featurePlan.currencyCalculator) {
      event.stopPropagation();
      currencyField.select?.();
      return;
    }
    const field = findTarget(event, ".betterinv-quantity-value");
    if (!field || !featurePlan.quantityControls) return;
    event.stopPropagation();
    field.dataset.originalValue = field.value;
    field.select?.();
  }, controller);

  addBetterInvEventListener(windowEl, "keydown", event => {
    const containerCard = findTarget(event, ".betterinv-container-card");
    if (containerCard && featurePlan.containers && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      betterInvState.containerId = containerCard.dataset.containerId;
      renderBetterInvWindow();
      return;
    }

    const currencyField = findTarget(event, ".betterinv-currency-input");
    if (currencyField && featurePlan.currencyCalculator) {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        currencyField.blur();
      }
      return;
    }
    const field = findTarget(event, ".betterinv-quantity-value");
    if (!field || !featurePlan.quantityControls) return;
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      field.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      field.value = field.dataset.originalValue ?? "0";
      field.dataset.cancelled = "true";
      field.blur();
    }
  }, controller);

  addBetterInvEventListener(windowEl, "input", event => {
    const searchField = findTarget(event, ".betterinv-search");
    if (searchField && featurePlan.search) {
      event.stopPropagation();
      betterInvState.search = searchField.value ?? "";
      if (windowEl._betterInvSearchTimer) clearTimeout(windowEl._betterInvSearchTimer);
      windowEl._betterInvSearchTimer = setTimeout(() => {
        windowEl._betterInvSearchTimer = null;
        if (!windowEl.isConnected) return;
        const renderedSearch = String(windowEl.dataset.betterInvRenderedSearch ?? "");
        if (renderedSearch === String(betterInvState.search ?? "")) return;
        scheduleBetterInvRefresh();
      }, 120);
      return;
    }

    const field = findTarget(event, ".betterinv-currency-input");
    if (!field || !featurePlan.currencyCalculator) return;
    event.stopPropagation();
    const key = String(field.dataset.currencyKey ?? "");
    if (!BETTER_INV_CURRENCIES.some(currency => currency.key === key)) return;
    const next = normalizeBetterInvCurrencyDraftValue(field.value, { allowBlank: true });
    if (field.value !== next) field.value = next;
    betterInvState.currencyDraft[key] = next;
  }, controller);

  addBetterInvEventListener(windowEl, "focusout", event => {
    const field = findTarget(event, ".betterinv-quantity-value");
    if (!field || !featurePlan.quantityControls) return;
    event.stopPropagation();
    if (field.dataset.cancelled === "true") {
      delete field.dataset.cancelled;
      return;
    }

    const row = field.closest(".betterinv-item");
    const item = actor?.items?.get(row?.dataset?.itemId);
    if (!item || field.dataset.saving === "true") return;
    const oldValue = getItemQuantityData(item).value;
    const parsed = Number(field.value);
    const next = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : oldValue;
    field.value = String(next);
    if (next === oldValue) {
      field.dataset.originalValue = String(oldValue);
      return;
    }

    field.dataset.saving = "true";
    field.disabled = true;
    void (async () => {
      try {
        await setItemQuantity(item, next);
        field.dataset.originalValue = String(next);
      } catch (error) {
        if (field.isConnected) field.value = String(oldValue);
        console.error("Better Inventory | Menge konnte nicht direkt geändert werden", error);
        ui.notifications.error("Die Item-Anzahl konnte nicht geändert werden.");
      } finally {
        delete field.dataset.saving;
        if (field.isConnected) field.disabled = false;
      }
    })();
  }, controller);
}

function activateWindowListeners(windowEl, actor, activeContainer, { settings = null, features = null, inventoryItems = null, categoryOptions = [] } = {}) {
  const userSettings = settings ?? getBetterInvUserSettings();
  const featurePlan = features ?? getBetterInvFeaturePlan(userSettings);
  const eventController = beginBetterInvWindowEventCycle(windowEl);
  const listen = (target, type, listener, options = {}) => addBetterInvEventListener(target, type, listener, eventController, options);

  listen(windowEl.querySelector(".betterinv-close"), "click", () => {
    closeBetterInvItemActionMenu();
    closeBetterInvCategoryMenu();
    disposeBetterInvWindowEventCycle(windowEl);
    closeBetterInvPerformanceWindow();
    windowEl.remove();
  });
  listen(windowEl.querySelector(".betterinv-popout"), "pointerdown", event => { event.preventDefault(); openBetterInvPopup(windowEl); });
  listen(windowEl.querySelector(".betterinv-scale-down"), "click", () => {
    betterInvState.scale = Math.max(0.65, Math.round(((betterInvState.scale || 1) - 0.1) * 10) / 10);
    applyBetterInvScale(windowEl);
  });
  listen(windowEl.querySelector(".betterinv-scale-up"), "click", () => {
    betterInvState.scale = Math.min(1.35, Math.round(((betterInvState.scale || 1) + 0.1) * 10) / 10);
    applyBetterInvScale(windowEl);
  });

  const settingsButton = windowEl.querySelector(".betterinv-settings");
  listen(settingsButton, "click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleBetterInvSettingsWindow();
  });
  updateBetterInvSettingsButtonState();
  makeBetterInvDraggable(windowEl);
  installBetterInvDelegatedWindowControls(windowEl, actor, activeContainer, featurePlan, categoryOptions, eventController);

  windowEl.querySelector(".betterinv-layer-plus")?.addEventListener("click", async () => {
    const current = await getContainerLayerCount(actor) ?? Math.max(1, Math.ceil(getContainerItems(actor, inventoryItems).length / 4));
    await setContainerLayerCount(actor, current + 1, { skipRefresh: true });
    // Keep all existing backpack layer assignments exactly where they are.
    scheduleBetterInvRefresh();
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
    await setContainerLayerMap(actor, nextMap, { skipRefresh: true });
    await setContainerLayerCount(actor, next, { skipRefresh: true });
    scheduleBetterInvRefresh();
  });
  windowEl.querySelector(".betterinv-change-actor")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    betterInvState.actorId = null;
    betterInvState.containerId = null;
    betterInvState.search = "";
    renderBetterInvWindow({ preserveScroll: false });
  });



  windowEl.querySelector(".betterinv-back")?.addEventListener("click", () => {
    betterInvState.containerId = null;
    renderBetterInvWindow();
  });

  if (featurePlan.containers) enableContainerDragSorting(windowEl, actor, activeContainer);
  if (featurePlan.items && featurePlan.containers) enableItemToContainerDrop(windowEl, actor, activeContainer);



  windowEl.querySelector(".betterinv-add-item")?.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    if (!actor || button.disabled) return;
    button.disabled = true;
    try {
      await createBetterInvItem(actor, activeContainer);
    } catch (error) {
      console.error("Better Inventory | Item konnte nicht erstellt oder importiert werden", error);
      const reason = sanitizePlainText(error?.message, { max: 220 });
      ui.notifications.error(reason
        ? `Das Item konnte nicht erstellt oder importiert werden: ${reason}`
        : "Das Item konnte nicht erstellt oder importiert werden.");
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
    await withBetterInvRefreshBatch(async () => {
      await setCategories(actor, [...categories, name], containerId);
      const order = await getCategoryOrder(actor, containerId, [...categories, name]);
      await setCategoryOrder(actor, [...order, name], containerId);
    }, { forceRefresh: true });
  });


  windowEl.querySelectorAll(".betterinv-add-subcategory").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const section = event.currentTarget.closest(".betterinv-category");
      const parentCategory = section?.dataset?.category;
      if (!parentCategory || parentCategory === "__unsorted") return;
      const name = await new Promise(resolve => {
        const dialog = new Dialog({
          title: "Unterkategorie erstellen",
          content: `<form><div class="form-group"><label>Name</label><input name="name" type="text" placeholder="z.B. Vortex Warp" autofocus></div></form>`,
          buttons: {
            create: { label: "Erstellen", callback: html => resolve(sanitizePlainText(html.find('[name="name"]').val(), { max: 48 })) },
            cancel: { label: "Abbrechen", callback: () => resolve(null) }
          },
          default: "create",
          close: () => resolve(null)
        }, {
          width: 430,
          classes: ["betterinv-standard-dialog", "betterinv-form-dialog"]
        });
        dialog.render(true);
        setTimeout(() => decorateBetterInvDialog(dialog, {
          classes: ["betterinv-standard-dialog", "betterinv-form-dialog"],
          focusSelector: 'input[name="name"]'
        }), 40);
      });
      if (!name) return;
      await withBetterInvRefreshBatch(
        () => addSubcategory(actor, parentCategory, name, activeContainer?.id ?? null),
        { refreshResult: true }
      );
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
        const dialog = new Dialog({
          title: "Unterkategorie bearbeiten",
          content: `<form><div class="form-group"><label>Name</label><input name="name" type="text" value="${escapeAttr(currentName)}" autofocus></div></form>`,
          buttons: {
            rename: { label: "Umbenennen", callback: html => resolve({ action: "rename", name: sanitizePlainText(html.find('[name="name"]').val(), { max: 48 }) }) },
            delete: { label: "Löschen", callback: () => resolve({ action: "delete" }) },
            cancel: { label: "Abbrechen", callback: () => resolve(null) }
          },
          default: "rename",
          close: () => resolve(null)
        }, {
          width: 450,
          classes: ["betterinv-standard-dialog", "betterinv-form-dialog", "betterinv-edit-dialog"]
        });
        dialog.render(true);
        setTimeout(() => decorateBetterInvDialog(dialog, {
          classes: ["betterinv-standard-dialog", "betterinv-form-dialog", "betterinv-edit-dialog"],
          focusSelector: 'input[name="name"]',
          selectInput: true
        }), 40);
      });
      if (!choice) return;
      const containerId = activeContainer?.id ?? null;
      await withBetterInvRefreshBatch(async () => {
        if (choice.action === "rename") return renameSubcategory(actor, parentCategory, currentName, choice.name, containerId);
        if (choice.action === "delete") return deleteSubcategory(actor, parentCategory, currentName, containerId);
        return false;
      }, { refreshResult: true });
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
        const dialog = new Dialog({
          title: "Kategorie bearbeiten",
          content: `<form><div class="form-group"><label>Name</label><input name="name" type="text" value="${escapeAttr(currentName)}" autofocus></div></form>`,
          buttons: {
            rename: { label: "Umbenennen", callback: html => resolve({ action: "rename", name: sanitizePlainText(html.find('[name="name"]').val(), { max: 48 }) }) },
            delete: { label: "Löschen", callback: () => resolve({ action: "delete" }) },
            cancel: { label: "Abbrechen", callback: () => resolve(null) }
          },
          default: "rename",
          close: () => resolve(null)
        }, {
          width: 450,
          classes: ["betterinv-standard-dialog", "betterinv-form-dialog", "betterinv-edit-dialog"]
        });
        dialog.render(true);
        setTimeout(() => decorateBetterInvDialog(dialog, {
          classes: ["betterinv-standard-dialog", "betterinv-form-dialog", "betterinv-edit-dialog"],
          focusSelector: 'input[name="name"]',
          selectInput: true
        }), 40);
      });
      if (!choice) return;
      const containerId = activeContainer?.id ?? null;
      await withBetterInvRefreshBatch(async () => {
        if (choice.action === "rename") return renameCategory(actor, currentName, choice.name, containerId);
        if (choice.action === "delete") return deleteCategory(actor, currentName, containerId);
        return false;
      }, { refreshResult: true });
    });
  });

  if (featurePlan.subcategories) enableSubcategoryDragSorting(windowEl, actor, activeContainer?.id ?? null);
  if (featurePlan.categories) enableCategoryDragSorting(windowEl, actor, activeContainer?.id ?? null);
  if (featurePlan.items) enableItemDragSorting(windowEl, actor, activeContainer?.id ?? null);
  if (featurePlan.items || featurePlan.containers) enableBetterInvExternalItemDrops(windowEl, actor, activeContainer);





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
      await setContainerOrder(actor, order, { skipRefresh: true });
      await setContainerLayerMap(actor, layerMap, { skipRefresh: true });
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
      await withBetterInvRefreshBatch(async () => {
        await moveItemToContainer(item, targetContainer);
        await setItemCategory(item, "__unsorted", targetContainer.id);
        await setItemCategory(item, "__unsorted", activeContainer?.id ?? null);
      }, { forceRefresh: true });
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
      await withBetterInvRefreshBatch(async () => {
        await moveItemToContainer(item, null);
        await setItemCategory(item, "__unsorted", null);
        await setItemCategory(item, "__unsorted", activeContainer?.id ?? null);
      }, { forceRefresh: true });
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
        await setSubcategories(actor, oldParentName, order, containerId, { skipRefresh: true });
      }
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
      await setCategoryOrder(actor, order, containerId, { skipRefresh: true });
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
      const item = actor?.items?.get(row.dataset.itemId);
      if (!item) {
        event.preventDefault();
        return;
      }
      row.classList.add("betterinv-item-dragging");
      const quantity = getItemQuantityData(item).value;
      const previewElement = createBetterInvItemDragPreview(item, quantity);
      const allowTransfer = getBetterInvFeaturePlan().itemTransfer;
      betterInvActiveItemDrag = {
        sourceActorId: actor.id,
        sourceItemId: item.id,
        previewElement,
        allowTransfer
      };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-betterinv-item", row.dataset.itemId);
      if (allowTransfer) {
        event.dataTransfer.setData("application/x-betterinv-transfer", item.id);
        event.dataTransfer.setData("text/plain", JSON.stringify({
          type: "BetterInventoryItemTransfer",
          sourceActorUuid: actor.uuid,
          sourceActorId: actor.id,
          sourceItemUuid: item.uuid,
          sourceItemId: item.id,
          quantity
        }));
      }
      if (typeof event.dataTransfer.setDragImage === "function") {
        event.dataTransfer.setDragImage(previewElement, 22, 22);
      }
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
      clearBetterInvTokenDropFeedback();
      removeBetterInvItemDragPreview();
      betterInvActiveItemDrag = null;

      const item = actor?.items?.get(row.dataset.itemId);
      const categoryChanged = Boolean(item && targetCategory && row.dataset.category !== targetCategory);
      await withBetterInvRefreshBatch(async () => {
        if (categoryChanged) {
          await setItemCategory(item, targetCategory, containerId);
          row.dataset.category = targetCategory;
        }

        // Save one global visual order for the current actor/container context.
        // Filtering by category later keeps each category's local order stable.
        const order = Array.from(windowEl.querySelectorAll(".betterinv-item:not(.betterinv-favorite-view)")).map(el => el.dataset.itemId).filter(Boolean);
        await setItemOrder(actor, order, containerId, { skipRefresh: true });
      }, { forceRefresh: categoryChanged });
      // A pure reorder already has the correct DOM order. Only a cross-category
      // move needs a rebuild for counts, weights, favorites and empty states.
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
    windowEl._betterInvDragController?.abort?.();
    const dragController = new AbortController();
    windowEl._betterInvDragController = dragController;
    const rect = windowEl.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    windowEl.style.zIndex = "20020";
    const onMove = moveEvent => {
      const maxLeft = Math.max(0, window.innerWidth - 80);
      const maxTop = Math.max(0, window.innerHeight - 50);
      windowEl.style.left = `${Math.max(0, Math.min(maxLeft, moveEvent.clientX - offsetX))}px`;
      windowEl.style.top = `${Math.max(0, Math.min(maxTop, moveEvent.clientY - offsetY))}px`;
      windowEl.style.right = "auto";
      windowEl.style.bottom = "auto";
    };
    const finish = () => {
      dragController.abort();
      if (windowEl._betterInvDragController === dragController) windowEl._betterInvDragController = null;
    };
    document.addEventListener("mousemove", onMove, { signal: dragController.signal });
    document.addEventListener("mouseup", finish, { once: true, signal: dragController.signal });
    window.addEventListener("blur", finish, { once: true, signal: dragController.signal });
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
    windowEl._betterInvDragController?.abort?.();
    const dragController = new AbortController();
    windowEl._betterInvDragController = dragController;
    const rect = windowEl.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const onMove = moveEvent => {
      const maxLeft = window.innerWidth - 80;
      const maxTop = window.innerHeight - 50;
      windowEl.style.left = `${Math.max(0, Math.min(maxLeft, moveEvent.clientX - offsetX))}px`;
      windowEl.style.top = `${Math.max(0, Math.min(maxTop, moveEvent.clientY - offsetY))}px`;
      windowEl.style.right = "auto";
      windowEl.style.bottom = "auto";
    };
    const finish = () => {
      dragController.abort();
      if (windowEl._betterInvDragController === dragController) windowEl._betterInvDragController = null;
    };
    document.addEventListener("mousemove", onMove, { signal: dragController.signal });
    document.addEventListener("mouseup", finish, { once: true, signal: dragController.signal });
    window.addEventListener("blur", finish, { once: true, signal: dragController.signal });
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
