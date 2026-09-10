(() => {
  const PATCH_FLAG = "__betterInvPeerTransfersV161";
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalTransferItemToActor = globalThis.transferBetterInvItemToActor;
  const originalCommitCurrencyTransfer = globalThis.commitBetterInvCurrencyTransfer;
  const originalHandleCanvasItemDrop = globalThis.handleBetterInvCanvasItemDrop;
  const originalExecuteGmGroundAction = globalThis.executeBetterInvGmGroundAction;

  if (
    typeof originalTransferItemToActor !== "function"
    || typeof originalCommitCurrencyTransfer !== "function"
    || typeof originalHandleCanvasItemDrop !== "function"
    || typeof originalExecuteGmGroundAction !== "function"
  ) {
    console.error("Axon’s Inventory | Peer-transfer patch konnte nicht initialisiert werden.");
    return;
  }

  function getPlayerUsers() {
    try {
      return getBetterInvUsersArray().filter(user => user && !user.isGM);
    } catch (_error) {
      return Array.from(game?.users?.contents ?? game?.users ?? []).filter(user => user && !user.isGM);
    }
  }

  function actorBelongsToPlayer(actor) {
    if (!actor) return false;
    const type = String(actor.type ?? "").trim().toLowerCase();
    if (type && type !== "character") return false;

    const players = getPlayerUsers();
    if (!players.length) return actor.hasPlayerOwner === true;
    return players.some(user => {
      if (String(user.character?.id ?? "") === String(actor.id ?? "")) return true;
      try { return canBetterInvUserModifyActorAs(actor, user); }
      catch (_error) {
        const ownerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
        return Number(actor.ownership?.[user.id] ?? actor.permission?.[user.id] ?? 0) >= ownerLevel;
      }
    });
  }

  globalThis.isBetterInvPlayerCharacterActor = actorBelongsToPlayer;

  globalThis.getBetterInvTransferTargetActors = function getBetterInvTransferTargetActorsPatched(sourceActor) {
    const actors = game.actors?.filter(actor => {
      if (!actor || actor.id === sourceActor?.id) return false;
      return actorBelongsToPlayer(actor);
    }) ?? [];

    actors.sort((left, right) => String(left.name ?? "").localeCompare(
      String(right.name ?? ""),
      game.i18n?.lang ?? undefined,
      { sensitivity: "base" }
    ));
    return actors;
  };

  globalThis.isBetterInvValidTokenTransferTarget = function isBetterInvValidTokenTransferTargetPatched(token, sourceActorId = null) {
    const actor = token?.actor;
    if (!actor || actor.id === sourceActorId) return false;
    return actorBelongsToPlayer(actor);
  };

  async function requestRemoteItemTransfer(sourceActor, item, targetActor, requestedQuantity = null, { notify = true } = {}) {
    if (!sourceActor || !item || !targetActor) return null;
    if (!canBetterInvUserModifyActor(sourceActor)) throw new Error("Du darfst den Quellcharakter nicht bearbeiten.");
    if (targetActor.id === sourceActor.id) throw new Error("Quell- und Zielcharakter sind identisch.");
    if (!actorBelongsToPlayer(targetActor)) throw new Error(`${targetActor.name || "Der Zielcharakter"} ist kein Spielercharakter.`);

    const availableQuantity = getItemQuantityData(item).value;
    if (availableQuantity < 1) throw new Error(`${item.name} besitzt keine übertragbare Menge.`);
    const quantity = requestedQuantity == null
      ? availableQuantity
      : Math.max(1, Math.min(availableQuantity, Math.trunc(Number(requestedQuantity) || 1)));
    const containerReference = getItemContainerId(item);
    const containerId = containerReference
      ? Array.from(sourceActor.items ?? []).find(candidate => betterInvContainerReferenceMatches(containerReference, candidate))?.id ?? containerReference
      : null;

    const result = await requestBetterInvGmGroundAction("transferItem", {
      sourceActorUuid: sourceActor.uuid ?? null,
      sourceActorId: sourceActor.id,
      sourceItemUuid: item.uuid ?? null,
      sourceItemId: item.id,
      targetActorId: targetActor.id,
      quantity,
      containerId
    });

    if (notify) {
      ui.notifications.info(`${formatBetterInvNumber(result?.quantity ?? quantity)} × ${result?.name ?? item.name} wurde an ${result?.actorName ?? targetActor.name} übertragen.`);
    }
    return result;
  }

  globalThis.transferBetterInvItemToActor = async function transferBetterInvItemToActorPatched(
    sourceActor,
    item,
    targetActor,
    requestedQuantity = null,
    options = {}
  ) {
    if (!sourceActor || !item || !targetActor) return null;
    if (canBetterInvUserModifyActor(targetActor)) {
      return await originalTransferItemToActor(sourceActor, item, targetActor, requestedQuantity, options);
    }
    return await requestRemoteItemTransfer(sourceActor, item, targetActor, requestedQuantity, options);
  };

  globalThis.commitBetterInvCurrencyTransfer = async function commitBetterInvCurrencyTransferPatched(sourceActor, targetActor, transfers) {
    if (!sourceActor || !targetActor) throw new Error("Quell- oder Zielcharakter fehlt.");
    if (sourceActor.id === targetActor.id) throw new Error("Quell- und Zielcharakter sind identisch.");
    if (!canBetterInvUserModifyActor(sourceActor)) throw new Error(`Du darfst den Charakter ${sourceActor.name} nicht bearbeiten.`);
    if (!actorBelongsToPlayer(targetActor)) throw new Error(`${targetActor.name || "Der Zielcharakter"} ist kein Spielercharakter.`);

    if (canBetterInvUserModifyActor(targetActor)) {
      return await originalCommitCurrencyTransfer(sourceActor, targetActor, transfers);
    }

    const transferList = Array.from(transfers ?? []).filter(entry => Number(entry?.amount) > 0);
    if (!transferList.length) {
      ui.notifications.warn("Gib zuerst die Münzen ein, die du handeln möchtest.");
      return false;
    }

    const result = await requestBetterInvGmGroundAction("transferCurrency", {
      sourceActorId: sourceActor.id,
      targetActorId: targetActor.id,
      transfers: transferList.map(({ key, amount }) => ({ key, amount }))
    });
    betterInvState.currencyDraft = {};
    betterInvState.currencyDraftActorId = sourceActor.id;
    ui.notifications.info(`${result?.summary ?? formatBetterInvCurrencyAmounts(transferList)} wurden an ${result?.actorName ?? targetActor.name} übertragen.`);
    return true;
  };

  globalThis.handleBetterInvCanvasItemDrop = async function handleBetterInvCanvasItemDropPatched(canvasInstance, data, event) {
    if (String(data?.type ?? "") !== "BetterInventoryItemTransfer") return;

    event?.preventDefault?.();
    event?.stopPropagation?.();

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
    if (!sourceActor || !sourceItem) throw new Error("Der gezogene Gegenstand existiert nicht mehr.");

    const features = getBetterInvGroundFeaturePlanFor(game.user, sourceActor, data.containerId ?? null);
    const token = findBetterInvTokenAtCanvasPoint(canvasInstance, data.x, data.y);
    const targetActor = token?.actor ?? null;
    const validTokenTransfer = Boolean(
      features.itemTransfer
      && targetActor
      && targetActor.id !== sourceActor.id
      && actorBelongsToPlayer(targetActor)
    );

    const quantity = getItemQuantityData(sourceItem).value;
    clearBetterInvTokenDropFeedback();

    if (validTokenTransfer) {
      const confirmed = await confirmBetterInvTokenItemTransfer(sourceItem, targetActor, quantity);
      if (!confirmed) return;
      await withBetterInvRefreshBatch(
        () => globalThis.transferBetterInvItemToActor(sourceActor, sourceItem, targetActor, quantity),
        { forceRefresh: true }
      );
      return;
    }

    if (!features.itemGroundDrop) {
      ui.notifications.warn("Lege den Gegenstand direkt auf einem erlaubten Spieler-Token ab.");
      return;
    }

    const dropX = Number(data.x);
    const dropY = Number(data.y);
    if (!Number.isFinite(dropX) || !Number.isFinite(dropY)) {
      throw new Error("Die Position auf der Karte konnte nicht bestimmt werden.");
    }
    const result = await requestBetterInvGmGroundAction("dropItem", {
      sceneId: canvasInstance?.scene?.id ?? canvas?.scene?.id,
      sourceActorUuid: sourceActor.uuid ?? null,
      sourceActorId: sourceActor.id,
      sourceItemUuid: sourceItem.uuid ?? null,
      sourceItemId: sourceItem.id,
      quantity,
      containerId: data.containerId ?? null,
      x: dropX,
      y: dropY
    });
    ui.notifications.info(`${formatBetterInvNumber(quantity)} × ${sourceItem.name} liegt jetzt auf dem Boden.`);
    return result;
  };

  globalThis.executeBetterInvGmGroundAction = async function executeBetterInvGmGroundActionPatched(action, payload = {}, requestUserId = null) {
    if (action !== "transferItem" && action !== "transferCurrency") {
      return await originalExecuteGmGroundAction(action, payload, requestUserId);
    }
    if (!game.user?.isGM) throw new Error("Nur ein GM kann eine Übergabe an einen anderen Spieler stellvertretend ausführen.");

    const requestUser = game.users?.get?.(requestUserId)
      ?? getPlayerUsers().find(user => String(user.id) === String(requestUserId))
      ?? null;
    if (!requestUser) throw new Error("Der anfragende Spieler wurde nicht gefunden.");

    if (action === "transferItem") {
      let sourceActor = null;
      let sourceItem = null;
      if (payload.sourceActorUuid && typeof globalThis.fromUuid === "function") {
        try { sourceActor = await globalThis.fromUuid(payload.sourceActorUuid); }
        catch (_error) {}
      }
      sourceActor ??= game.actors?.get?.(payload.sourceActorId) ?? null;
      if (payload.sourceItemUuid && typeof globalThis.fromUuid === "function") {
        try { sourceItem = await globalThis.fromUuid(payload.sourceItemUuid); }
        catch (_error) {}
      }
      sourceItem ??= sourceActor?.items?.get?.(payload.sourceItemId) ?? null;
      const targetActor = game.actors?.get?.(payload.targetActorId) ?? null;

      if (!sourceActor || !sourceItem || sourceItem.parent?.id !== sourceActor.id) throw new Error("Der Gegenstand existiert nicht mehr.");
      if (!targetActor) throw new Error("Der Zielcharakter wurde nicht gefunden.");
      if (sourceActor.id === targetActor.id) throw new Error("Quell- und Zielcharakter sind identisch.");
      if (!canBetterInvUserModifyActorAs(sourceActor, requestUser)) throw new Error("Du darfst den Quellcharakter nicht bearbeiten.");
      if (!actorBelongsToPlayer(targetActor)) throw new Error(`${targetActor.name || "Der Zielcharakter"} ist kein Spielercharakter.`);

      const sourceContainerReference = getItemContainerId(sourceItem);
      const sourceContainerId = sourceContainerReference
        ? Array.from(sourceActor.items ?? []).find(candidate => betterInvContainerReferenceMatches(sourceContainerReference, candidate))?.id ?? sourceContainerReference
        : payload.containerId ?? null;
      if (!getBetterInvGroundFeaturePlanFor(requestUser, sourceActor, sourceContainerId).itemTransfer) {
        throw new Error("Gegenstandshandel wurde für diesen Spieler oder diesen Rucksack deaktiviert.");
      }

      const available = getItemQuantityData(sourceItem).value;
      if (available < 1) throw new Error(`${sourceItem.name} besitzt keine übertragbare Menge.`);
      const quantity = Math.max(1, Math.min(available, Math.trunc(Number(payload.quantity) || available)));
      const createdItem = await originalTransferItemToActor(sourceActor, sourceItem, targetActor, quantity, { notify: false });
      return {
        kind: "itemTransfer",
        name: createdItem?.name ?? sourceItem.name,
        quantity,
        actorName: targetActor.name
      };
    }

    const sourceActor = game.actors?.get?.(payload.sourceActorId) ?? null;
    const targetActor = game.actors?.get?.(payload.targetActorId) ?? null;
    if (!sourceActor) throw new Error("Der Quellcharakter wurde nicht gefunden.");
    if (!targetActor) throw new Error("Der Zielcharakter wurde nicht gefunden.");
    if (sourceActor.id === targetActor.id) throw new Error("Quell- und Zielcharakter sind identisch.");
    if (!canBetterInvUserModifyActorAs(sourceActor, requestUser)) throw new Error("Du darfst den Quellcharakter nicht bearbeiten.");
    if (!actorBelongsToPlayer(targetActor)) throw new Error(`${targetActor.name || "Der Zielcharakter"} ist kein Spielercharakter.`);
    if (!getBetterInvGroundFeaturePlanFor(requestUser, sourceActor, null).currencyTransfer) {
      throw new Error("Geldhandel wurde für diesen Spieler deaktiviert.");
    }

    const transfers = normalizeBetterInvGroundTransfers(payload.transfers);
    if (!transfers.length) throw new Error("Es wurden keine Münzen zum Übertragen angegeben.");
    await originalCommitCurrencyTransfer(sourceActor, targetActor, transfers);
    return {
      kind: "currencyTransfer",
      summary: formatBetterInvCurrencyAmounts(transfers),
      actorName: targetActor.name
    };
  };

  console.log("Axon’s Inventory | Spielerhandel-Hotfix aktiv.");
})();
