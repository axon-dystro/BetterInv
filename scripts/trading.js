/* Consensual, GM-mediated two-sided trading. */
(() => {
  const channel = "module.betterinv";
  const sessions = new Map();
  const actorLocks = new Set();
  const windows = new Map();
  const receivedStates = new Map();
  const originalAction = globalThis.executeBetterInvGmGroundAction;
  const emptyOffer = () => ({ items: [], coins: [] });
  const integer = value => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Mengen müssen ganze, nicht negative Zahlen sein.");
    return n;
  };
  function validateOffer(actor, user, offer) {
    if (!canBetterInvUserModifyActorAs(actor, user)) throw new Error("Du darfst nur eigene Angebote bearbeiten.");
    if (!Array.isArray(offer?.items) || !Array.isArray(offer?.coins)) throw new Error("Ungültiges Angebot.");
    const seen = new Set();
    const items = offer.items.map(entry => {
      const item = actor.items.get(entry.id);
      const quantity = integer(entry.quantity);
      if (!item || !isBetterInvInventoryItemType(item.type) || !quantity || quantity > getItemQuantityData(item).value || seen.has(item.id)) {
        throw new Error("Ein angebotener Gegenstand oder seine Menge ist nicht mehr verfügbar.");
      }
      seen.add(item.id);
      if (getBetterInvItemContainedChildren(actor, item).length) throw new Error("Rucksäcke müssen vor dem Handel geleert werden.");
      const reference = getItemContainerId(item);
      const containerId = reference ? Array.from(actor.items).find(candidate => betterInvContainerReferenceMatches(reference, candidate))?.id ?? reference : null;
      if (!getBetterInvGroundFeaturePlanFor(user, actor, containerId).itemTransfer) throw new Error("Gegenstandshandel ist für diesen Spieler oder Rucksack gesperrt.");
      return { id: item.id, quantity, name: item.name, img: item.img, snapshot: JSON.stringify(item.toObject()) };
    });
    const wallet = getBetterInvCurrencyWallet(actor);
    const coinKeys = new Set();
    const coins = offer.coins.map(entry => {
      const currency = wallet.find(c => c.key === entry.key);
      const amount = integer(entry.amount);
      if (!currency || coinKeys.has(entry.key) || amount > currency.value) throw new Error("Der angebotene Münzbetrag ist nicht verfügbar.");
      coinKeys.add(entry.key);
      return { key: currency.key, amount, abbreviation: currency.abbreviation };
    }).filter(c => c.amount);
    if (coins.length && !getBetterInvGroundFeaturePlanFor(user, actor, null).currencyTransfer) throw new Error("Geldhandel ist für diesen Spieler gesperrt.");
    return { items, coins };
  }
  function publicState(session) {
    return { id: session.id, revision: session.revision, status: session.status, error: session.error,
      sides: session.sides.map(side => ({ actorId: side.actorId, userId: side.userId, name: game.actors.get(side.actorId)?.name,
        ready: side.ready, offer: { items: side.offer.items.map(({ snapshot, ...item }) => item), coins: side.offer.coins } })) };
  }
  function publish(session) {
    const message = { kind: "betterinvTradeState", gmId: game.user.id, state: publicState(session) };
    game.socket.emit(channel, message);
    receive(message);
    return message.state;
  }
  async function commit(session) {
    const actors = session.sides.map(side => game.actors.get(side.actorId));
    if (actors.some(actor => actorLocks.has(actor.id) || betterInvCurrencyTransactions.has(getBetterInvCurrencyActorKey(actor)))) throw new Error("Für einen Charakter läuft bereits eine Übertragung.");
    const offers = session.sides.map((side, i) => validateOffer(actors[i], game.users.get(side.userId), side.offer));
    for (let i = 0; i < 2; i++) {
      if (offers[i].items.some((item, j) => item.snapshot !== session.sides[i].offer.items[j].snapshot)) throw new Error("Ein Gegenstand wurde geändert. Bitte das Angebot erneut speichern und bestätigen.");
    }
    if (!offers.some(offer => offer.items.length || offer.coins.length)) throw new Error("Lege zuerst Gegenstände oder Münzen ins Handelsfenster.");
    actors.forEach(actor => { actorLocks.add(actor.id); betterInvCurrencyTransactions.add(getBetterInvCurrencyActorKey(actor)); });
    const undo = [];
    try {
      const wallets = actors.map(getBetterInvCurrencyWallet);
      const balances = wallets.map(cloneBetterInvCurrencyBalances);
      for (let i = 0; i < 2; i++) for (const coin of offers[i].coins) {
        const source = balances[i].get(coin.key), target = balances[1-i].get(coin.key);
        if (!target || !Number.isSafeInteger(target.value + coin.amount)) throw new Error("Ungültiger Zielmünzbestand.");
        source.value -= coin.amount; target.value += coin.amount;
      }
      // Credit new copies first, retaining source documents until rollback is no longer needed.
      for (let i = 0; i < 2; i++) for (const entry of offers[i].items) {
        const item = actors[i].items.get(entry.id);
        const native = await resolveBetterInvNativeTransferSource(item);
        const data = prepareBetterInvTransferredItemData(native.document ?? item, entry.quantity);
        const operation = getBetterInvTransferOperation(actors[i], item, actors[1-i], entry.quantity);
        const created = await createBetterInvTransferredItem(actors[1-i], data, operation);
        if (!created) throw new Error("Der Gegenstand konnte nicht erstellt werden.");
        undo.push(() => created.delete({ betterInventoryRollback: true }));
        if (getItemQuantityData(created).value !== entry.quantity) await setItemQuantity(created, entry.quantity, operation);
        await setItemCategory(created, "__unsorted", null);
        const oldQuantity = getItemQuantityData(item).value;
        if (JSON.stringify(item.toObject()) !== entry.snapshot) throw new Error("Ein Gegenstand wurde während des Handels geändert.");
        undo.push(() => setItemQuantity(actors[i].items.get(entry.id), oldQuantity, { betterInventoryRollback: true }));
        await setItemQuantity(item, oldQuantity - entry.quantity, operation);
      }
      for (let i = 0; i < 2; i++) {
        const { updateData } = buildBetterInvCurrencyUpdateData(wallets[i], balances[i]);
        if (!Object.keys(updateData).length) continue;
        const fresh = getBetterInvCurrencyWallet(actors[i]);
        if (wallets[i].some(coin => fresh.find(c => c.key === coin.key)?.value !== coin.value)) throw new Error("Der Münzbestand wurde während des Handels geändert.");
        const previous = Object.fromEntries(wallets[i].filter(coin => coin.storage.updatePath in updateData).map(coin => [coin.storage.updatePath, coin.value]));
        undo.push(() => actors[i].update(previous, { betterInventoryCurrencyTransferRollback: true }));
        await actors[i].update(updateData, { betterInventoryCurrencyTransfer: true });
        if (getBetterInvCurrencyWallet(actors[i]).some(coin => coin.value !== balances[i].get(coin.key).value)) throw new Error("Der Münzbestand konnte nicht bestätigt werden.");
      }
      // Delete depleted sources last. Save full data so later failures can restore them with their IDs.
      for (let i = 0; i < 2; i++) for (const entry of offers[i].items) {
        const item = actors[i].items.get(entry.id);
        if (getItemQuantityData(item).value) continue;
        const saved = JSON.parse(entry.snapshot);
        undo.push(async () => {
          if (!actors[i].items.get(entry.id)) await actors[i].createEmbeddedDocuments("Item", [saved], { keepId: true, betterInventoryRollback: true });
        });
        await item.delete({ betterInventoryTransfer: true });
      }
    } catch (error) {
      let rollbackFailed = false;
      for (const revert of undo.reverse()) { try { await revert(); } catch (failure) { rollbackFailed = true; console.error("BetterInv trade rollback", failure); } }
      if (rollbackFailed) {
        session.status = "failed";
        error.message = "Der Handel ist unklar. Beide Charakterbögen vom GM prüfen lassen; nicht erneut ausführen.";
      }
      throw error;
    } finally {
      actors.forEach(actor => { actorLocks.delete(actor.id); betterInvCurrencyTransactions.delete(getBetterInvCurrencyActorKey(actor)); });
      scheduleBetterInvRefresh();
    }
  }
  globalThis.executeBetterInvGmGroundAction = async function(action, payload = {}, userId = null) {
    if (!String(action).startsWith("trade:")) return originalAction(action, payload, userId);
    if (!game.user.isGM || game.user.id !== getBetterInvPrimaryActiveGm()?.id) throw new Error("Handel benötigt den aktiven Haupt-GM.");
    const user = game.users.get(userId);
    if (!user?.active) throw new Error("Der Spieler ist nicht online.");
    if (action === "trade:open") {
      const actor = game.actors.get(payload.sourceActorId), target = game.actors.get(payload.targetActorId);
      if (!actor || !target || actor.id === target.id || !canBetterInvUserModifyActorAs(actor, user) || !isBetterInvPlayerCharacterActor(target)) throw new Error("Ungültige Handelspartner.");
      const features = getBetterInvGroundFeaturePlanFor(user, actor, null);
      if (!features.itemTransfer && !features.currencyTransfer) throw new Error("Handel ist für diesen Spieler gesperrt.");
      const owner = getBetterInvUsersArray().filter(u => u.active && !u.isGM && canBetterInvUserModifyActorAs(target, u))
        .sort((a,b) => Number(b.character?.id === target.id) - Number(a.character?.id === target.id) || String(a.id).localeCompare(String(b.id)))[0]
        ?? (canBetterInvUserModifyActorAs(target, user) ? user : null);
      if (!owner) throw new Error("Der Besitzer dieses Charakters muss für den Handel online sein.");
      for (const session of sessions.values()) if (session.status === "open" && session.sides.some(s => [actor.id, target.id].includes(s.actorId))) throw new Error("Ein Charakter hat bereits ein offenes Handelsfenster.");
      const session = { id: createBetterInvRequestId(), revision: 0, status: "open", sides: [
        { actorId: actor.id, userId: user.id, ready: false, offer: validateOffer(actor, user, payload.offer ?? emptyOffer()) },
        { actorId: target.id, userId: owner.id, ready: false, offer: emptyOffer() }
      ] };
      sessions.set(session.id, session);
      return publish(session);
    }
    const session = sessions.get(payload.id);
    if (!session || session.status !== "open") throw new Error("Dieser Handel ist nicht mehr offen.");
    const side = session.sides.find(s => s.userId === userId && s.actorId === payload.actorId);
    if (!side) throw new Error("Du bist kein Teilnehmer dieses Handels.");
    if (action === "trade:cancel") { session.status = "cancelled"; const state = publish(session); sessions.delete(session.id); return state; }
    if (payload.revision !== session.revision) throw new Error("Das Angebot wurde geändert. Prüfe die aktuelle Version.");
    if (!session.sides.every(s => game.users.get(s.userId)?.active && canBetterInvUserModifyActorAs(game.actors.get(s.actorId), game.users.get(s.userId)))) throw new Error("Ein Handelspartner ist offline oder hat keine Besitzrechte mehr.");
    if (action === "trade:offer") {
      side.offer = validateOffer(game.actors.get(side.actorId), user, payload.offer);
      session.revision++; session.sides.forEach(s => s.ready = false); session.error = null;
    } else if (action === "trade:ready") {
      side.ready = true;
      if (session.sides.every(s => s.ready)) {
        session.status = "committing"; publish(session);
        try { await commit(session); session.status = "completed"; }
        catch (error) { if (session.status !== "failed") session.status = "open"; session.error = error.message; session.revision++; session.sides.forEach(s => s.ready = false); }
      }
    } else throw new Error("Unbekannte Handelsaktion.");
    const state = publish(session);
    if (["completed", "failed"].includes(session.status)) sessions.delete(session.id);
    return state;
  };
  function receive(message) {
    if (message?.kind !== "betterinvTradeState" || message.gmId !== getBetterInvPrimaryActiveGm()?.id) return;
    const state = message.state;
    if (!state?.sides?.some(side => side.userId === game.user.id)) return;
    const previous = receivedStates.get(state.id);
    if (previous && (previous.revision > state.revision || ["completed", "cancelled", "failed"].includes(previous.status))) return;
    receivedStates.set(state.id, state);
    if (state.status === "completed" || state.status === "cancelled" || state.status === "failed") {
      const dialog = windows.get(state.id);
      if (dialog) { dialog.betterInvTradeStatus = state.status; dialog.close(); }
      windows.delete(state.id);
      ui.notifications[state.status === "failed" ? "error" : "info"](state.error || (state.status === "completed" ? "Handel abgeschlossen." : "Handel abgebrochen."));
      return;
    }
    renderTrade(state);
  }
  async function send(state, side, action, offer) {
    try {
      await requestBetterInvGmGroundAction(`trade:${action}`, { id: state.id, actorId: side.actorId, revision: state.revision, offer });
    } catch (error) { ui.notifications.error(error.message); }
  }
  function renderTrade(state) {
    const owned = state.sides.filter(side => side.userId === game.user.id);
    const content = `<div class="betterinv-trade"><p>Beide Seiten bestätigen dasselbe Angebot. Änderungen setzen beide Bestätigungen zurück.</p>
      ${state.error ? `<p role="alert">${escapeHtml(state.error)}</p>` : ""}<div class="betterinv-trade-sides">${state.sides.map(side => {
        const editable = owned.includes(side) && state.status === "open";
        const actor = game.actors.get(side.actorId);
        return `<section data-trade-side="${escapeAttr(side.actorId)}"><h3>${escapeHtml(side.name)} · ${side.ready ? "✓ Bestätigt" : "Wartet"}</h3>
          <div class="betterinv-trade-drop" data-trade-drop>${side.offer.items.map(item => `<div><img src="${escapeAttr(item.img || "icons/svg/item-bag.svg")}" alt="">${escapeHtml(item.name)} × ${item.quantity}${editable ? `<button type="button" data-remove-item="${escapeAttr(item.id)}" aria-label="Entfernen">×</button>` : ""}</div>`).join("") || "Items hier hineinziehen"}</div>
          ${editable ? `<div class="betterinv-trade-add"><select data-trade-item aria-label="Gegenstand">${Array.from(actor.items).filter(item => isBetterInvInventoryItemType(item.type) && getItemQuantityData(item).value > 0).map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)} (${getItemQuantityData(item).value})</option>`).join("")}</select><input data-trade-quantity type="number" min="1" step="1" value="1" aria-label="Menge"><button type="button" data-add-item>Hinzufügen</button></div>` : ""}
          <div class="betterinv-trade-coins">${(editable ? getBetterInvCurrencyWallet(actor) : getBetterInvCurrencies()).map(coin => `<label>${escapeHtml(coin.abbreviation)}${editable ? ` (${coin.value})<input data-trade-coin="${escapeAttr(coin.key)}" type="number" min="0" max="${coin.value}" step="1" value="${side.offer.coins.find(c => c.key === coin.key)?.amount ?? 0}">` : `<strong>${side.offer.coins.find(c => c.key === coin.key)?.amount ?? 0}</strong>`}</label>`).join("")}</div>
          ${editable ? `<button type="button" data-save-offer>Angebot speichern</button><button type="button" data-ready ${side.ready ? "disabled" : ""}>Handel bestätigen</button><button type="button" data-cancel>Abbrechen</button>` : ""}</section>`;
      }).join("")}</div>${state.status === "committing" ? "Handel wird ausgeführt …" : ""}</div>`;
    let dialog = windows.get(state.id);
    const bind = html => {
      const root = decorateBetterInvDialog({ element: html }, { classes: ["betterinv-trade-window"] });
      if (!root) return;
      for (const side of owned) {
        const section = root.querySelector(`[data-trade-side="${side.actorId}"]`);
        if (!section || state.status !== "open") continue;
        let draft = side.offer.items.map(({ id, quantity }) => ({ id, quantity }));
        let dirty = false;
        const ready = section.querySelector("[data-ready]");
        const markDirty = () => { dirty = true; ready.disabled = true; };
        const offer = () => ({ items: draft, coins: Array.from(section.querySelectorAll("[data-trade-coin]")).map(input => ({ key: input.dataset.tradeCoin, amount: input.value })) });
        section.querySelectorAll("[data-trade-coin]").forEach(input => input.addEventListener("input", markDirty));
        section.querySelector("[data-save-offer]").onclick = () => send(state, side, "offer", offer());
        ready.onclick = () => { if (!dirty) send(state, side, "ready"); };
        section.querySelector("[data-cancel]").onclick = () => send(state, side, "cancel");
        section.querySelectorAll("[data-remove-item]").forEach(button => button.onclick = () => {
          draft = draft.filter(item => item.id !== button.dataset.removeItem); button.parentElement.remove(); markDirty();
        });
        const add = (id, quantity) => {
          try {
            quantity = integer(quantity);
            const item = game.actors.get(side.actorId).items.get(id);
            if (!item || !quantity) throw new Error("Wähle einen Gegenstand und eine gültige Menge.");
            const existing = draft.find(entry => entry.id === id);
            const total = (existing?.quantity ?? 0) + quantity;
            if (total > getItemQuantityData(item).value) throw new Error("Nicht genug Gegenstände vorhanden.");
            if (existing) existing.quantity = total; else draft.push({ id, quantity });
            send(state, side, "offer", offer());
          } catch (error) { ui.notifications.error(error.message); }
        };
        section.querySelector("[data-add-item]").onclick = () => add(section.querySelector("[data-trade-item]").value, section.querySelector("[data-trade-quantity]").value);
        const drop = section.querySelector("[data-trade-drop]");
        drop.ondragover = event => event.preventDefault();
        drop.ondrop = async event => {
          event.preventDefault(); event.stopPropagation();
          try {
            const data = getBetterInvDragEventData(event);
            if (data?.sourceActorId === side.actorId && data.sourceItemId) add(data.sourceItemId, 1);
            else if (data?.uuid) {
              const item = await fromUuid(data.uuid);
              if (item?.parent?.id !== side.actorId) throw new Error("Ziehe einen Gegenstand aus deinem eigenen Inventar hinein.");
              add(item.id, 1);
            }
          } catch (error) { ui.notifications.error(error.message); }
        };
      }
    };
    if (dialog) { dialog.betterInvTradeStatus = state.status; dialog.betterInvTradeState = state; dialog.data.content = content; dialog.data.render = bind; dialog.render(true); }
    else {
      dialog = new Dialog({ title: "Handel · Items & Gold", content, buttons: {}, render: bind,
        close: () => { windows.delete(state.id); if (dialog.betterInvTradeStatus === "open") send(dialog.betterInvTradeState, owned[0], "cancel"); }
      }, { width: 760, height: "auto", resizable: true });
      dialog.betterInvTradeStatus = state.status; dialog.betterInvTradeState = state;
      windows.set(state.id, dialog); dialog.render(true);
    }
  }
  globalThis.openBetterInvTrade = async function(sourceActor, targetActor, offer = emptyOffer()) {
    if (!getBetterInvPrimaryActiveGm()) throw new Error("Für den Handel muss ein GM online sein.");
    const state = await requestBetterInvGmGroundAction("trade:open", { sourceActorId: sourceActor.id, targetActorId: targetActor.id, offer });
    receive({ kind: "betterinvTradeState", gmId: getBetterInvPrimaryActiveGm().id, state });
    return state;
  };
  Hooks.once("ready", () => {
    game.socket.on(channel, receive);
    Hooks.on("updateUser", (user, changes) => {
      if (game.user.id !== getBetterInvPrimaryActiveGm()?.id || changes.active !== false) return;
      for (const session of sessions.values()) if (session.status === "open" && session.sides.some(s => s.userId === user.id)) {
        session.status = "cancelled"; publish(session); sessions.delete(session.id);
      }
    });
  });
})();
