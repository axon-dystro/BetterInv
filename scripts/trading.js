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
  const originalTargets = globalThis.getBetterInvTransferTargetActors;
  const originalTokenTarget = globalThis.isBetterInvValidTokenTransferTarget;
  const originalItemTransfer = globalThis.transferBetterInvItemToActor;
  const originalCoinTransfer = globalThis.commitBetterInvCurrencyTransfer;
  function tokenActorMatches(token, actor) {
    // Unlinked Foundry token documents expose synthetic actors. Those must not disappear
    // merely because actorLink is false, and the token's own actor must be used for writes.
    return Boolean(token && actor && (token.actor?.id === actor.id || token.actorId === actor.id));
  }
  const tradeableTarget = actor => Boolean(actor && (actor.type === "npc" || isBetterInvPlayerCharacterActor(actor)));
  function actorForSide(session, index) {
    const scene = game.scenes.get(session.sceneId);
    const tokenId = index ? session.targetTokenId : session.sourceTokenId;
    const token = scene?.tokens?.get(tokenId);
    return token?.actor ?? game.actors.get(session.sides[index].actorId);
  }
  function tokenPoints(token, scene) {
    const grid = scene.grid;
    const size = Number(grid.size);
    if (!Number.isFinite(size) || size <= 0) return [];
    const center = token.getCenterPoint?.() ?? {
      x: Number(token.x) + Number(token.width ?? 1) * size / 2,
      y: Number(token.y) + Number(token.height ?? 1) * size / 2,
      elevation: Number(token.elevation ?? 0)
    };
    if (!grid.isSquare) return [center];
    const cols = Math.min(8, Math.max(1, Math.ceil(Number(token.width ?? 1))));
    const rows = Math.min(8, Math.max(1, Math.ceil(Number(token.height ?? 1))));
    const points = [];
    for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) points.push({
      x: Number(token.x) + (col + .5) * Number(token.width ?? 1) * size / cols,
      y: Number(token.y) + (row + .5) * Number(token.height ?? 1) * size / rows,
      elevation: Number(token.elevation ?? 0)
    });
    return points;
  }
  function tokenDistance(source, target, scene) {
    if (!source || !target || !scene?.grid?.measurePath || source.hidden || target.hidden) return Infinity;
    // v14 levels can overlap in x/y without sharing physical space.
    if (source.level?.id && target.level?.id && source.level.id !== target.level.id) return Infinity;
    let distance = Infinity;
    for (const from of tokenPoints(source, scene)) for (const to of tokenPoints(target, scene)) {
      const measured = Number(scene.grid.measurePath([from, to]).distance);
      if (Number.isFinite(measured)) distance = Math.min(distance, convertBetterInvSceneDistanceToFeet(measured, scene));
    }
    return distance;
  }
  function findPair(sourceActor, targetActor, scene = canvas?.scene, sourceTokenId = null, targetTokenId = null) {
    const tokens = Array.from(scene?.tokens ?? []);
    let sources = tokens.filter(token => tokenActorMatches(token, sourceActor) && (!sourceTokenId || token.id === sourceTokenId));
    if (!sourceTokenId && scene?.id === canvas?.scene?.id) {
      const controlled = canvas?.tokens?.controlled?.map(token => token.document.id) ?? [];
      const selected = sources.filter(token => controlled.includes(token.id));
      if (selected.length) sources = selected;
    }
    const targets = tokens.filter(token => tokenActorMatches(token, targetActor) && (!targetTokenId || token.id === targetTokenId));
    let pair = null;
    for (const source of sources) for (const target of targets) {
      const distance = tokenDistance(source, target, scene);
      if (distance <= 5 + 1e-6 && (!pair || distance < pair.distance)) pair = {sourceTokenId:source.id, targetTokenId:target.id, sceneId:scene.id, distance};
    }
    return pair;
  }
  function assertRange(session) {
    const scene = game.scenes.get(session.sceneId);
    const source = scene?.tokens?.get(session.sourceTokenId), target = scene?.tokens?.get(session.targetTokenId);
    if (!tokenActorMatches(source, actorForSide(session,0)) || !tokenActorMatches(target, actorForSide(session,1)) || tokenDistance(source,target,scene) > 5 + 1e-6) {
      throw new Error("Die Handelspartner müssen auf derselben Szene innerhalb von 5 ft stehen.");
    }
  }
  globalThis.getBetterInvTradeTokenPair = findPair;
  globalThis.getBetterInvTransferTargetActors = sourceActor => {
    const candidates = new Map();
    for (const token of canvas?.scene?.tokens ?? []) {
      const target = token.actor;
      if (!tradeableTarget(target) || target.id === sourceActor?.id || !findPair(sourceActor,target)) continue;
      if (!candidates.has(target.id)) candidates.set(target.id,target);
    }
    return [...candidates.values()].sort((a,b) => String(a.name).localeCompare(String(b.name),game.i18n?.lang ?? undefined));
  };
  globalThis.isBetterInvValidTokenTransferTarget = (token, sourceActorId = null) => {
    const target = token?.actor;
    const source = game.actors.get(sourceActorId)
      ?? Array.from(canvas?.scene?.tokens ?? []).find(doc => doc.actor?.id === sourceActorId)?.actor;
    return Boolean(tradeableTarget(target) && source && target.id !== source.id
      && findPair(source,target,canvas?.scene,null,token?.document?.id ?? token?.id));
  };
  // All direct handoffs to a character become invitations, including canvas drops.
  globalThis.transferBetterInvItemToActor = async (sourceActor,item,targetActor,quantity = 1,options = {}) => {
    if (!tradeableTarget(targetActor)) return originalItemTransfer(sourceActor,item,targetActor,quantity,options);
    return openBetterInvTrade(sourceActor,targetActor,{items:[{id:item.id,quantity:quantity ?? 1}],coins:[]});
  };
  globalThis.commitBetterInvCurrencyTransfer = async (sourceActor,targetActor,transfers) => {
    if (!tradeableTarget(targetActor)) return originalCoinTransfer(sourceActor,targetActor,transfers);
    return openBetterInvTrade(sourceActor,targetActor,{items:[],coins:transfers.map(({key,amount}) => ({key,amount}))});
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
      sceneId: session.sceneId, sourceTokenId: session.sourceTokenId, targetTokenId: session.targetTokenId,
      sides: session.sides.map(side => ({ actorId: side.actorId, userId: side.userId, name: actorForSide(session,session.sides.indexOf(side))?.name,
        ready: side.ready, offer: { items: side.offer.items.map(({ snapshot, ...item }) => item), coins: side.offer.coins } })) };
  }
  function publish(session) {
    const message = { kind: "betterinvTradeState", gmId: game.user.id, state: publicState(session) };
    game.socket.emit(channel, message);
    receive(message);
    return message.state;
  }
  async function commit(session) {
    assertRange(session);
    const actors = session.sides.map((_,i) => actorForSide(session,i));
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
        assertRange(session);
        const oldQuantity = getItemQuantityData(item).value;
        if (JSON.stringify(item.toObject()) !== entry.snapshot) throw new Error("Ein Gegenstand wurde während des Handels geändert.");
        undo.push(() => setItemQuantity(actors[i].items.get(entry.id), oldQuantity, { betterInventoryRollback: true }));
        await setItemQuantity(item, oldQuantity - entry.quantity, operation);
      }
      for (let i = 0; i < 2; i++) {
        assertRange(session);
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
        assertRange(session);
        await item.delete({ betterInventoryTransfer: true });
      }
      assertRange(session);
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
      const scene = game.scenes.get(payload.sceneId);
      const sourceToken = scene?.tokens?.get(payload.sourceTokenId), targetToken = scene?.tokens?.get(payload.targetTokenId);
      const actor = sourceToken?.actor, target = targetToken?.actor;
      // Never accept an actor ID independently of its actual selected scene token.
      if (!actor || !target || !tokenActorMatches(sourceToken,{id:payload.sourceActorId})
          || !tokenActorMatches(targetToken,{id:payload.targetActorId})
          || actor.id === target.id || !canBetterInvUserModifyActorAs(actor, user)
          || !tradeableTarget(target)) throw new Error("Ungültige Handelspartner.");
      const features = getBetterInvGroundFeaturePlanFor(user, actor, null);
      if (!features.itemTransfer && !features.currencyTransfer) throw new Error("Handel ist für diesen Spieler gesperrt.");
      const owner = getBetterInvUsersArray().filter(u => u.active && !u.isGM && canBetterInvUserModifyActorAs(target, u))
        .sort((a,b) => Number(b.character?.id === target.id) - Number(a.character?.id === target.id) || String(a.id).localeCompare(String(b.id)))[0]
        ?? (target.type === "npc" ? getBetterInvPrimaryActiveGm() : (canBetterInvUserModifyActorAs(target, user) ? user : null));
      if (!owner) throw new Error("Der Besitzer dieses Charakters muss für den Handel online sein.");
      const pair = findPair(actor,target,game.scenes.get(payload.sceneId),payload.sourceTokenId,payload.targetTokenId);
      if (!pair) throw new Error("Die Handelspartner müssen auf derselben Szene innerhalb von 5 ft stehen.");
      for (const session of sessions.values()) if (["pending", "open", "committing"].includes(session.status) && session.sides.some(s => [actor.id, target.id].includes(s.actorId))) throw new Error("Ein Charakter hat bereits ein offenes Handelsfenster.");
      const session = { id: createBetterInvRequestId(), revision: 0, status: "pending", ...pair, sides: [
        { actorId: actor.id, userId: user.id, ready: false, offer: validateOffer(actor, user, payload.offer ?? emptyOffer()) },
        { actorId: target.id, userId: owner.id, ready: false, offer: emptyOffer() }
      ] };
      sessions.set(session.id, session);
      return publish(session);
    }
    const session = sessions.get(payload.id);
    if (!session || !["pending", "open"].includes(session.status)) throw new Error("Dieser Handel ist nicht mehr offen.");
    const side = session.sides.find(s => s.userId === userId && s.actorId === payload.actorId);
    if (!side) throw new Error("Du bist kein Teilnehmer dieses Handels.");
    if (action === "trade:cancel") { session.status = "cancelled"; const state = publish(session); sessions.delete(session.id); return state; }
    if (session.status === "pending") {
      if (action !== "trade:accept" || side !== session.sides[1]) throw new Error("Der Empfänger muss die Handelsanfrage zuerst annehmen.");
      assertRange(session);
      if (!session.sides.every((s,i) => game.users.get(s.userId)?.active && canBetterInvUserModifyActorAs(actorForSide(session,i), game.users.get(s.userId)))) throw new Error("Ein Handelspartner ist offline oder hat keine Besitzrechte mehr.");
      session.status = "open"; session.revision++;
      return publish(session);
    }
    assertRange(session);
    if (payload.revision !== session.revision) throw new Error("Das Angebot wurde geändert. Prüfe die aktuelle Version.");
    if (!session.sides.every((s,i) => game.users.get(s.userId)?.active && canBetterInvUserModifyActorAs(actorForSide(session,i), game.users.get(s.userId)))) throw new Error("Ein Handelspartner ist offline oder hat keine Besitzrechte mehr.");
    if (action === "trade:offer") {
      side.offer = validateOffer(actorForSide(session,session.sides.indexOf(side)), user, payload.offer);
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
    if (state.status === "pending") renderInvitation(state);
    else renderTrade(state);
  }
  async function send(state, side, action, offer) {
    try {
      await requestBetterInvGmGroundAction(`trade:${action}`, { id: state.id, actorId: side.actorId, revision: state.revision, offer });
      return true;
    } catch (error) { ui.notifications.error(error.message); return false; }
  }
  function renderInvitation(state) {
    const recipient = state.sides[1];
    const isRecipient = recipient.userId === game.user.id;
    const side = isRecipient ? recipient : state.sides[0];
    const offered = state.sides[0].offer;
    const summary = [...offered.items.map(item => `${item.quantity} × ${item.name}`), ...offered.coins.map(coin => `${coin.amount} ${coin.abbreviation}`)].join(" · ");
    const content = `<div class="betterinv-trade-invitation"><span class="betterinv-trade-range">Innerhalb von 5 ft</span>
      <h3>${escapeHtml(state.sides[0].name)} möchte mit ${escapeHtml(recipient.name)} handeln</h3>
      <p>${escapeHtml(summary || "Items & Münzen im gemeinsamen Handelsfenster")}</p>
      <p>${isRecipient ? "Möchtest du die Handelsanfrage annehmen?" : "Warte auf die Antwort des anderen Spielers …"}</p>
      <p>Bis zum beidseitig bestätigten Austausch bleibt alles im ursprünglichen Inventar.</p></div>`;
    let dialog = windows.get(state.id);
    if (dialog) return;
    dialog = new Dialog({ title: isRecipient ? "Handelsanfrage" : "Handelsanfrage gesendet", content,
      buttons: isRecipient ? {
        accept: {label:"Annehmen",callback:async () => { dialog.betterInvTradeButton = true; if (!await send(state,side,"accept")) dialog.betterInvTradeButton = false; }},
        decline: {label:"Ablehnen",callback:() => { dialog.betterInvTradeButton = true; return send(state,side,"cancel"); }}
      } : {cancel:{label:"Anfrage zurückziehen",callback:() => { dialog.betterInvTradeButton = true; return send(state,side,"cancel"); }}},
      // Foundry closes button dialogs after callback; only the close X cancels a pending request.
      render: html => {
        const root = decorateBetterInvDialog({element:html},{classes:["betterinv-trade-window"]});
        root?.querySelectorAll(".dialog-button").forEach(button => button.addEventListener("click", () => { dialog.betterInvTradeButton = true; }, {capture:true}));
      },
      close: () => {
        if (windows.get(state.id) === dialog) windows.delete(state.id);
        if (dialog.betterInvTradeStatus === "pending" && !dialog.betterInvTradeButton) send(state,side,"cancel");
      }
    }, {width:520,height:"auto",classes:["betterinv-trade-window","betterinv-dialog-theme"]});
    dialog.betterInvTradeStatus = "pending"; windows.set(state.id,dialog); dialog.render(true);
  }
  function renderTrade(state) {
    const owned = state.sides.filter(side => side.userId === game.user.id);
    const orderedSides = [...state.sides].sort((a,b) => Number(owned.includes(b)) - Number(owned.includes(a)));
    const content = `<div class="betterinv-trade">
      <header class="betterinv-trade-heading"><div><span class="betterinv-trade-kicker">AXON’S INVENTORY</span><h2>Handel</h2></div><span class="betterinv-trade-range">≤ 5 ft · Verbunden</span></header>
      ${state.error ? `<p class="betterinv-trade-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      <div class="betterinv-trade-sides">${orderedSides.map(side => {
        const mine = owned.includes(side);
        const editable = mine && state.status === "open";
        const actor = actorForSide(state,state.sides.indexOf(side));
        const slots = side.offer.items.map(item => `<article class="betterinv-trade-slot is-filled"><img src="${escapeAttr(item.img || "icons/svg/item-bag.svg")}" alt=""><span class="betterinv-trade-item-name">${escapeHtml(item.name)}</span><strong class="betterinv-trade-quantity">×${item.quantity}</strong>${editable ? `<button type="button" data-remove-item="${escapeAttr(item.id)}" aria-label="${escapeAttr(item.name)} entfernen">×</button>` : ""}</article>`);
        while (slots.length < 6) slots.push(`<div class="betterinv-trade-slot is-empty" aria-hidden="true"><span>＋</span></div>`);
        return `<section data-trade-side="${escapeAttr(side.actorId)}" class="${mine ? "is-own" : "is-partner"}">
          <header class="betterinv-trade-player"><span class="betterinv-trade-kicker">${mine ? "DEIN ANGEBOT" : "ANGEBOT DEINES HANDELSPARTNERS"}</span><h3>${escapeHtml(side.name)}</h3><span class="betterinv-trade-status ${side.ready ? "is-ready" : ""}">${side.ready ? "✓ Bestätigt" : "Noch nicht bestätigt"}</span></header>
          <div class="betterinv-trade-section-label"><span>Gegenstände</span><span>${side.offer.items.length} angeboten</span></div>
          <div class="betterinv-trade-drop" data-trade-drop>${slots.join("")}</div>
          <div class="betterinv-trade-drop-hint">${editable ? "Items hier hineinziehen" : "Angebot wird gemeinsam angezeigt"}</div>
          <div class="betterinv-trade-section-label"><span>Münzen</span><span>Im Angebot</span></div>
          <div class="betterinv-trade-coins">${(editable ? getBetterInvCurrencyWallet(actor) : getBetterInvCurrencies()).map(coin => `<label><span class="betterinv-trade-coin-label"><span class="betterinv-trade-coin-icon" aria-hidden="true">●</span>${escapeHtml(coin.abbreviation)}</span>${editable ? `<input data-trade-coin="${escapeAttr(coin.key)}" aria-label="${escapeAttr(coin.abbreviation)} anbieten" type="number" min="0" max="${coin.value}" step="1" value="${side.offer.coins.find(c => c.key === coin.key)?.amount ?? 0}"><small>von ${coin.value}</small>` : `<strong>${side.offer.coins.find(c => c.key === coin.key)?.amount ?? 0}</strong>`}</label>`).join("")}</div>
          ${editable ? `<details class="betterinv-trade-picker"><summary>Gegenstand hinzufügen</summary><div class="betterinv-trade-add"><select data-trade-item aria-label="Gegenstand">${Array.from(actor.items).filter(item => isBetterInvInventoryItemType(item.type) && getItemQuantityData(item).value > 0).map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)} (${getItemQuantityData(item).value})</option>`).join("")}</select><input data-trade-quantity type="number" min="1" step="1" value="1" aria-label="Menge"><button type="button" data-add-item>Hinzufügen</button></div></details><footer class="betterinv-trade-actions"><button type="button" data-save-offer>Angebot speichern</button><button type="button" data-ready ${side.ready ? "disabled" : ""}>${side.ready ? "✓ Bestätigt" : "Handel bestätigen"}</button><button type="button" data-cancel>Abbrechen</button></footer>` : `<footer class="betterinv-trade-partner-status">${side.ready ? "✓ Dein Handelspartner ist bereit" : "Warte auf die Bestätigung deines Handelspartners"}</footer>`}
        </section>`;
      }).join("")}</div>
      <footer class="betterinv-trade-note">${state.status === "committing" ? "Handel wird ausgeführt …" : "Austausch erst, wenn beide bestätigen. Jede Änderung hebt beide Bestätigungen auf."}</footer></div>`;
    let dialog = windows.get(state.id);
    if (dialog?.betterInvTradeStatus === "pending") {
      dialog.betterInvTradeStatus = "accepted"; dialog.close(); windows.delete(state.id); dialog = null;
    }
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
        section.querySelectorAll("[data-trade-coin]").forEach(input => {
          input.addEventListener("input", markDirty);
          input.addEventListener("change", () => send(state, side, "offer", offer()));
        });
        section.querySelector("[data-save-offer]").onclick = () => send(state, side, "offer", offer());
        ready.onclick = () => { if (!dirty) send(state, side, "ready"); };
        section.querySelector("[data-cancel]").onclick = () => send(state, side, "cancel");
        section.querySelectorAll("[data-remove-item]").forEach(button => button.onclick = () => {
          draft = draft.filter(item => item.id !== button.dataset.removeItem); markDirty();
          send(state, side, "offer", offer());
        });
        const add = (id, quantity) => {
          try {
            quantity = integer(quantity);
            const item = actorForSide(state,state.sides.indexOf(side)).items.get(id);
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
      }, { width: 760, height: "auto", resizable: true, classes:["betterinv-trade-window","betterinv-dialog-theme"] });
      dialog.betterInvTradeStatus = state.status; dialog.betterInvTradeState = state;
      windows.set(state.id, dialog); dialog.render(true);
    }
  }
  globalThis.openBetterInvTrade = async function(sourceActor, targetActor, offer = emptyOffer()) {
    if (!getBetterInvPrimaryActiveGm()) throw new Error("Für den Handel muss ein GM online sein.");
    const pair = findPair(sourceActor,targetActor);
    if (!pair) throw new Error("Zum Handeln müssen beide Tokens innerhalb von 5 ft auf der Szene stehen.");
    const state = await requestBetterInvGmGroundAction("trade:open", { sourceActorId: sourceActor.id, targetActorId: targetActor.id, ...pair, offer });
    receive({ kind: "betterinvTradeState", gmId: getBetterInvPrimaryActiveGm().id, state });
    return state;
  };
  Hooks.once("ready", () => {
    game.socket.on(channel, receive);
    const checkSessions = () => {
      if (game.user.id !== getBetterInvPrimaryActiveGm()?.id) return;
      for (const session of sessions.values()) if (["pending","open"].includes(session.status)) {
        try { assertRange(session); } catch (error) {
          session.status = "cancelled"; session.error = error.message; publish(session); sessions.delete(session.id);
        }
      }
    };
    Hooks.on("updateToken", checkSessions);
    Hooks.on("deleteToken", checkSessions);
    Hooks.on("deleteScene", checkSessions);
    Hooks.on("updateUser", (user, changes) => {
      if (game.user.id !== getBetterInvPrimaryActiveGm()?.id || changes.active !== false) return;
      for (const session of sessions.values()) if (["pending", "open"].includes(session.status) && session.sides.some(s => s.userId === user.id)) {
        session.status = "cancelled"; publish(session); sessions.delete(session.id);
      }
    });
  });
})();
