import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const mainSource = read("scripts/main.js");
const groundSource = read("scripts/ground-effects.js");
const manifest = JSON.parse(read("module.json"));
const packageManifest = JSON.parse(read("package.json"));

assert.doesNotThrow(() => new vm.Script(mainSource, { filename: "scripts/main.js" }));
assert.doesNotThrow(() => new vm.Script(groundSource, { filename: "scripts/ground-effects.js" }));
assert.equal(manifest.version, packageManifest.version, "Modul- und Paketversion müssen identisch sein");
assert.ok(fs.existsSync(path.join(root, `RELEASE_NOTES_${manifest.version}.md`)), "Release Notes der aktuellen Version fehlen");
for (const script of manifest.scripts ?? []) {
  assert.ok(fs.existsSync(path.join(root, script)), `Manifest script fehlt: ${script}`);
}

const settingValues = {
  "betterinv.currencyLabels": {
    pp: { name: "Astralmark", abbreviation: "AM", factorToNext: 7 },
    gp: { name: "Sonnen", abbreviation: "SO", factorToNext: 3 },
    ep: { name: "Elektrum", abbreviation: "EP", factorToNext: 4 },
    sp: { name: "Mond", abbreviation: "MO", factorToNext: 11 },
    cp: { name: "Funken", abbreviation: "FU" }
  }
};
const hookRegistrations = [];
const getProperty = (object, propertyPath) => String(propertyPath ?? "")
  .split(".")
  .filter(Boolean)
  .reduce((value, key) => value?.[key], object);
const setProperty = (object, propertyPath, value) => {
  const parts = String(propertyPath ?? "").split(".").filter(Boolean);
  let current = object;
  for (const key of parts.slice(0, -1)) current = current[key] ??= {};
  current[parts.at(-1)] = value;
};
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  performance,
  AbortController,
  structuredClone,
  Hooks: {
    once: (name, callback) => hookRegistrations.push({ kind: "once", name, callback }),
    on: (name, callback) => hookRegistrations.push({ kind: "on", name, callback }),
    off: () => {}
  },
  game: {
    settings: {
      get: (moduleId, key) => settingValues[`${moduleId}.${key}`],
      register: () => {},
      set: async (moduleId, key, value) => {
        settingValues[`${moduleId}.${key}`] = value;
        return value;
      }
    },
    keybindings: { register: () => {} },
    i18n: { lang: "de-DE", localize: value => value },
    system: { id: "dnd5e" },
    user: { id: "gm", isGM: true },
    users: [],
    actors: new Map(),
    scenes: new Map()
  },
  canvas: {
    ready: false,
    scene: { id: "scene", grid: { size: 100, distance: 5, units: "ft" } },
    grid: { size: 100 },
    dimensions: { sceneX: 0, sceneY: 0 }
  },
  CONFIG: {
    DND5E: {},
    Item: {},
    Actor: {},
    statusEffects: [
      { id: "blinded", name: "Blind", img: "icons/svg/blind.svg" },
      { id: "prone", name: "Liegend", img: "icons/svg/falling.svg" }
    ]
  },
  CONST: {
    KEYBINDING_PRECEDENCE: { NORMAL: 0 },
    DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 }
  },
  foundry: {
    utils: {
      deepClone: value => structuredClone(value),
      getProperty,
      setProperty,
      randomID: () => "test-rule-id"
    }
  }
});
context.globalThis = context;

vm.runInContext(mainSource, context, { filename: "scripts/main.js" });
const currencies = vm.runInContext("getBetterInvCurrencies()", context);
assert.equal(currencies[0].name, "Astralmark");
assert.equal(currencies[0].abbreviation, "AM");
assert.equal(currencies[3].copperValue, 11, "Der konfigurierbare Faktor Silber zu Kupfer muss in die Rechnung eingehen");
assert.equal(currencies[2].copperValue, 44);
assert.equal(currencies[1].copperValue, 132);
assert.equal(currencies[0].copperValue, 924, "Alle vier konfigurierbaren Faktoren müssen die vollständige Währungskette bilden");
const downExchange = vm.runInContext(`calculateBetterInvCurrencyDownExchange(
  ${JSON.stringify(currencies.map(currency => ({ ...currency, value: currency.key === "pp" ? 1 : 0 })))},
  [{ key: "pp", amount: 1 }]
)`, context);
assert.equal(downExchange.balances.get("pp").value, 0);
assert.equal(downExchange.balances.get("gp").value, 7, "Abrunden muss den benutzerdefinierten direkten Faktor verwenden");
const upExchange = vm.runInContext(`calculateBetterInvCurrencyUpExchange(
  ${JSON.stringify(currencies.map(currency => ({ ...currency, value: currency.key === "ep" ? 3 : 0 })))},
  [{ key: "gp", amount: 1 }]
)`, context);
assert.equal(upExchange.balances.get("ep").value, 0);
assert.equal(upExchange.balances.get("gp").value, 1, "Aufrunden muss die benutzerdefinierten Werte ebenfalls verwenden");
const legacyCurrencyLabels = vm.runInContext("normalizeBetterInvCurrencyLabels({})", context);
assert.deepEqual(
  JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(legacyCurrencyLabels).map(([key, value]) => [key, value.factorToNext])))),
  { pp: 10, gp: 2, ep: 5, sp: 10, cp: null },
  "Welten ohne gespeicherte Faktoren müssen die bisherigen D&D-Standardwerte erhalten"
);

const profile = vm.runInContext(`getBetterInvNormalizedItemGroundProfile({
  getFlag: () => ({
    display: { visibilityDistanceFeet: 0, sizeGridUnits: 0.125 },
    effects: { rules: [{ id: "persisted" }] }
  })
})`, context);
assert.equal(profile.display.visibilityDistanceFeet, 0, "Sichtradius 0 muss das eigene Grid-Feld bedeuten");
assert.equal(profile.display.sizeGridUnits, 0.125);
assert.equal(profile.display.persistTransform, true, "Größe und Drehung sollen standardmäßig am Item erhalten bleiben");
assert.equal(profile.interaction.attachOnEquip, false, "Normale Gegenstände dürfen nicht ungefragt beim Ausrüsten auf der Karte erscheinen");
assert.equal(profile.permissions.playerMove, true);
assert.equal(profile.permissions.playerResize, true);
assert.equal(profile.permissions.playerRotate, true);
assert.equal(profile.permissions.playerEffects, false, "Spieler-Effektbearbeitung muss pro Objekt ausdrücklich freigegeben werden");
assert.equal(profile.effects.rules[0].id, "persisted");

const transferData = vm.runInContext(`prepareBetterInvTransferredItemData({
  toObject: () => ({
    name: "Feuerkristall",
    type: "loot",
    system: { quantity: 2 },
    flags: {
      betterinv: {
        favorite: true,
        groundProfile: {
          display: { sizeGridUnits: 0.5 },
          effects: { rules: [{ id: "drop-fire", trigger: "drop" }] }
        }
      }
    }
  }),
  system: { quantity: 2 }
}, 1)`, context);
assert.equal(transferData.flags.betterinv.favorite, undefined, "Actor-lokale Favoritenmarkierung darf nicht übertragen werden");
assert.equal(transferData.flags.betterinv.groundProfile.effects.rules[0].id, "drop-fire");
assert.equal(transferData.system.quantity, 1);

const tileData = vm.runInContext(`buildBetterInvGroundTileData(canvas.scene, {
  x: 250,
  y: 250,
  name: "Feuerkristall",
  image: "icons/svg/fire.svg",
  loot: {
    kind: "item",
    display: { sizeGridUnits: 0.5, rotation: 30 },
    itemData: ${JSON.stringify(transferData)}
  }
})`, context);
assert.equal(tileData.width, 50, "Ein halbes Grid muss bei 100 Pixel Gridgröße 50 Pixel breit sein");
assert.equal(tileData.height, 50);
assert.equal(tileData.rotation, 30, "Die am Item gespeicherte Drehung muss beim Fallenlassen übernommen werden");
assert.equal(tileData.flags.betterinv.groundLoot.display.requireLineOfSight, true);

let transformLoot = structuredClone(tileData.flags.betterinv.groundLoot);
const transformTile = {
  id: "transform-tile",
  x: tileData.x,
  y: tileData.y,
  width: tileData.width,
  height: tileData.height,
  rotation: tileData.rotation,
  parent: context.canvas.scene,
  getFlag: () => transformLoot,
  update: async changes => {
    for (const [key, value] of Object.entries(changes)) {
      if (key === "flags.betterinv.groundLoot") transformLoot = value;
      else transformTile[key] = value;
    }
    return transformTile;
  }
};
const requestingPlayer = { id: "player", isGM: false, getFlag: () => undefined };
const originalScenes = context.game.scenes;
const originalUsers = context.game.users;
context.canvas.scene.tiles = { get: id => id === transformTile.id ? transformTile : null };
context.game.scenes = new Map([[context.canvas.scene.id, context.canvas.scene]]);
context.game.users = { get: id => id === requestingPlayer.id ? requestingPlayer : null, contents: [requestingPlayer] };
await vm.runInContext(`executeBetterInvGmGroundAction("transformTile", {
  sceneId: "scene",
  tileId: "transform-tile",
  mode: "resize",
  sizeGridUnits: 1.37
}, "player")`, context);
assert.equal(transformTile.width, 137, "Die Größenänderung muss stufenlose Zwischenwerte erlauben");
assert.equal(transformTile.x, 181.5, "Beim stufenlosen Skalieren muss der Mittelpunkt des Bodenobjekts erhalten bleiben");
assert.equal(transformLoot.itemData.flags.betterinv.groundProfile.display.sizeGridUnits, 1.37, "Die stufenlose aktuelle Größe muss im Item-Profil persistieren");
transformLoot.permissions.playerRotate = false;
await assert.rejects(
  vm.runInContext(`executeBetterInvGmGroundAction("transformTile", {
    sceneId: "scene",
    tileId: "transform-tile",
    mode: "rotate",
    rotation: 45
  }, "player")`, context),
  /nicht erlaubt/,
  "Eine objektbezogene GM-Sperre darf nicht über den Socket umgangen werden"
);
const attachmentActor = { id: "attachment-actor", canUserModify: user => user?.id === "player" };
const attachmentToken = {
  id: "attachment-token",
  actorId: attachmentActor.id,
  parent: context.canvas.scene,
  x: 100,
  y: 200,
  width: 1,
  height: 1
};
context.game.actors = new Map([[attachmentActor.id, attachmentActor]]);
context.canvas.scene.tokens = { get: id => id === attachmentToken.id ? attachmentToken : null, contents: [attachmentToken] };
await vm.runInContext(`executeBetterInvGmGroundAction("attachTile", {
  sceneId: "scene",
  tileId: "transform-tile",
  tokenId: "attachment-token"
}, "player")`, context);
assert.equal(transformLoot.attachment.tokenId, attachmentToken.id, "Ein erlaubtes Bodenobjekt muss am eigenen Token befestigt werden können");
await vm.runInContext(`executeBetterInvGmGroundAction("moveTile", {
  sceneId: "scene",
  tileId: "transform-tile",
  x: 400,
  y: 500
}, "player")`, context);
assert.equal(transformLoot.attachment, undefined, "Manuelles Ziehen muss ein befestigtes Bodenobjekt automatisch lösen");
assert.equal(transformTile.x, 400);
assert.match(mainSource, /data-betterinv-item-image-input/, "Der Gegenstandsdialog muss einen lokalen Bildimport anbieten");
assert.match(mainSource, /syncEquippedItem/, "Ausrüsten muss die verknüpfte Kartendarstellung synchronisieren");
context.game.scenes = originalScenes;
context.game.users = originalUsers;

const alwaysVisibleWithoutLos = vm.runInContext(`(() => {
  const previousIsGm = game.user.isGM;
  const previousVisibility = canvas.visibility;
  game.user.isGM = false;
  canvas.visibility = { testVisibility: () => false };
  const tile = {
    id: "player-visible-ground-loot",
    parent: canvas.scene,
    x: 225,
    y: 225,
    width: ${JSON.stringify(tileData.width)},
    height: ${JSON.stringify(tileData.height)},
    getFlag: () => (${JSON.stringify(tileData.flags.betterinv.groundLoot)})
  };
  const result = computeBetterInvGroundTileDesiredVisibility(tile);
  game.user.isGM = previousIsGm;
  canvas.visibility = previousVisibility;
  return result;
})()`, context);
assert.equal(alwaysVisibleWithoutLos, true, "Bodenloot im Modus 'always' muss auch für Spieler ohne zusätzlichen LOS-Treffer sichtbar sein");
assert.match(mainSource, /betterinv-item-action-remove-container/, "Das Drei-Punkte-Menü muss Gegenstände aus dem aktiven Rucksack entfernen können");
assert.match(mainSource, /decorateBetterInvDialog\(dialog,[\s\S]*betterinv-transfer-route-window/, "Der Übertragen-/Fallenlassen-Dialog muss das BetterInv-Dialogdesign erhalten");
assert.match(groundSource, /event\.code === "KeyM"/, "M muss die Größensteuerung des markierten Bodenobjekts aktivieren");
assert.match(groundSource, /event\.code === "KeyN"/, "N muss die Drehsteuerung des markierten Bodenobjekts aktivieren");
assert.match(groundSource, /requestBetterInvGmGroundAction\("transformTile"/, "Spieler-Transformationen müssen sicher über den GM laufen");
assert.match(mainSource, /allowGroundMove[\s\S]*allowGroundResize[\s\S]*allowGroundRotate[\s\S]*allowGroundActivate[\s\S]*allowGroundEffects/, "Die GM-Regeln müssen Bodenaktionen getrennt sperren können");

vm.runInContext(groundSource, context, { filename: "scripts/ground-effects.js" });
const metricLightRadius = vm.runInContext(`AxonsInventoryGround.convertFeetToSceneDistance(30, {
  grid: { distance: 1, units: "m" }
})`, context);
assert.ok(Math.abs(metricLightRadius - 9.144) < 0.001, "30 Fuß Licht müssen für metrische Szenen in 9,144 Meter umgerechnet werden");
const normalizedRules = context.AxonsInventoryGround.getRules({
  kind: "item",
  effects: {
    rules: [{
      id: "fire-crystal",
      name: "Feuerkristall",
      trigger: "drop",
      radius: 7,
      showArea: true,
      powerFormula: "1d4",
      actions: [{
        id: "blind-on-four",
        type: "condition",
        conditionId: "blinded",
        powerMin: 4,
        powerMax: 4,
        radius: 12
      }]
    }]
  }
});
assert.equal(normalizedRules[0].trigger, "drop");
assert.equal(normalizedRules[0].radius, 5, "Regelradius muss auf das 5-Fuß-Grid einrasten");
assert.equal(normalizedRules[0].variants.length, 4, "1d4 muss vier bearbeitbare Varianten erzeugen");
assert.equal(normalizedRules[0].actions.length, 0, "Exakte alte Stärkeaktionen müssen aus der allgemeinen Aktionsliste migriert werden");
assert.equal(normalizedRules[0].variants[3].actions[0].radius, 10, "Aktionsradius muss auf das 5-Fuß-Grid einrasten");
assert.equal(normalizedRules[0].variants[3].actions[0].conditionId, "blinded");
assert.equal(normalizedRules[0].variants[3].actions[0].powerMin, null);

const twelveVariants = context.AxonsInventoryGround.getRules({
  kind: "item",
  effects: {
    rules: [{
      name: "Zwölf Stärken",
      powerFormula: "1d12",
      variants: [{
        value: 2,
        check: { type: "save", key: "dex", dc: 15 },
        actions: [{ type: "damage", value: "2d6", damageType: "fire" }]
      }]
    }]
  }
})[0];
assert.equal(twelveVariants.variants.length, 12, "1d12 muss zwölf aufklappbare Ergebnisvarianten erzeugen");
assert.equal(twelveVariants.variants[1].check.key, "dex");
assert.equal(twelveVariants.variants[1].check.dc, 15);
assert.equal(twelveVariants.variants[1].actions[0].damageType, "fire");

const createdMessages = [];
context.Roll = class {
  constructor(formula) {
    this.formula = String(formula);
    this.total = this.formula === "1d4" ? 2 : (this.formula.startsWith("1d20") ? 5 : 0);
  }
  async evaluate() { return this; }
};
context.ChatMessage = {
  getSpeaker: () => ({ alias: "Test" }),
  create: async data => { createdMessages.push(data); return data; }
};
let runtimeLoot = {
  kind: "item",
  name: "Variantenkristall",
  effects: {
    rules: [{
      id: "runtime-variant",
      name: "Stärkewurf",
      trigger: "drop",
      powerFormula: "1d4",
      variants: [
        { value: 1, actions: [{ type: "chat", value: "Falsche Variante" }] },
        {
          value: 2,
          check: { type: "save", key: "dex", dc: 15 },
          actions: [
            { type: "chat", outcome: "success", value: "Falscher Erfolgszweig" },
            { type: "chat", outcome: "failure", value: "Richtige Variante und Fehlschlag" }
          ]
        }
      ]
    }]
  }
};
const runtimeTile = {
  id: "runtime-tile",
  name: "Variantenkristall",
  parent: { id: "scene" },
  getFlag: () => runtimeLoot,
  update: async changes => {
    runtimeLoot = changes["flags.betterinv.groundLoot"] ?? runtimeLoot;
    return runtimeTile;
  }
};
const runtimeActor = {
  id: "actor",
  name: "Testfigur",
  system: { abilities: { dex: { save: { value: 0 }, mod: 0 } } }
};
const runtimeResult = await context.AxonsInventoryGround.runTrigger(runtimeTile, "drop", {
  forceLocal: true,
  actor: runtimeActor
});
assert.equal(runtimeResult.triggered, 1);
assert.equal(createdMessages.length, 1, "Pro Würfelergebnis darf nur die passende Variante ausgeführt werden");
assert.match(createdMessages[0].content, /Richtige Variante und Fehlschlag/, "Der varianteneigene Rettungswurf muss den richtigen Ergebniszweig steuern");
assert.equal(runtimeLoot.effects.lastPower.value, 2, "Der Variantenwurf muss am Bodenobjekt gespeichert werden");

const staticHooks = hookRegistrations.map(entry => `${entry.kind}:${entry.name}`);
const hookCounts = new Map();
for (const entry of staticHooks) hookCounts.set(entry, (hookCounts.get(entry) ?? 0) + 1);
assert.equal(hookCounts.get("once:ready"), 2, "Hauptskript und Bodenengine besitzen absichtlich je einen idempotenten Ready-Einstieg");
const unexpectedDuplicateStaticHooks = Array.from(hookCounts)
  .filter(([entry, count]) => count > 1 && entry !== "once:ready");
assert.deepEqual(unexpectedDuplicateStaticHooks, [], "Andere direkt registrierte statische Hooks dürfen nicht doppelt vorkommen");

console.log("Static audit passed: syntax, manifest, configurable currency factors, persistent profiles, continuous ground scaling and executable strength variants.");
