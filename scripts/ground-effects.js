/* Axon’s Inventory - Bodenobjekt-Interaktion und Effekt-Editor (Phase 10.5) */
/* SPDX-License-Identifier: LicenseRef-Axons-Inventory-1.0 */
(() => {
  "use strict";

  const API_NAME = "AxonsInventoryGround";
  const RULE_TRIGGERS = Object.freeze({
    click: "Beim Anklicken",
    pickup: "Beim Aufheben",
    enter: "Beim Betreten",
    leave: "Beim Verlassen",
    proximity: "Beim Annähern innerhalb einer Reichweite",
    stay: "Wenn ein Token darauf stehen bleibt",
    activate: "Beim Aktivieren durch einen Spieler"
  });
  const ACTION_TYPES = Object.freeze({
    chat: "Chatnachricht anzeigen",
    damage: "Schaden würfeln",
    heal: "Heilung würfeln",
    activeEffect: "Active Effect anwenden",
    hide: "Objekt unsichtbar machen",
    show: "Objekt sichtbar machen",
    delete: "Objekt löschen",
    pickupAllow: "Aufheben erlauben",
    pickupPrevent: "Aufheben verhindern",
    light: "Licht erzeugen",
    darkness: "Dunkelheit erzeugen",
    sound: "Sound abspielen",
    activateOther: "Andere Bodenobjekte aktivieren",
    macro: "Makro ausführen"
  });
  const CHECK_TYPES = Object.freeze({
    none: "Kein Wurf",
    ability: "Attributsprobe",
    save: "Rettungswurf",
    skill: "Fertigkeitsprobe"
  });
  const ABILITY_OPTIONS = Object.freeze({
    str: "Stärke",
    dex: "Geschicklichkeit",
    con: "Konstitution",
    int: "Intelligenz",
    wis: "Weisheit",
    cha: "Charisma"
  });
  const SKILL_OPTIONS = Object.freeze({
    acr: "Akrobatik",
    ani: "Mit Tieren umgehen",
    arc: "Arkane Kunde",
    ath: "Athletik",
    dec: "Täuschen",
    his: "Geschichte",
    ins: "Motiv erkennen",
    itm: "Einschüchtern",
    inv: "Nachforschungen",
    med: "Heilkunde",
    nat: "Naturkunde",
    prc: "Wahrnehmung",
    prf: "Auftreten",
    per: "Überzeugen",
    rel: "Religion",
    slt: "Fingerfertigkeit",
    ste: "Heimlichkeit",
    sur: "Überleben"
  });
  const OUTCOMES = Object.freeze({
    always: "Immer",
    success: "Bei Erfolg",
    failure: "Bei Fehlschlag"
  });

  let interactionController = null;
  let pointerState = null;
  let hoverTileId = "";
  let selectedTileId = "";
  let hitAreaDebugEnabled = false;
  let debugGraphics = null;
  const tokenScanTimers = new Map();
  const tokenMotionTimers = new Map();
  const tokenMotionOrigins = new Map();
  const tokenScanInFlight = new Set();
  const tokenRuleStates = new Map();
  const localRuleRuntime = new Map();
  const socketPending = new Map();
  let socketReady = false;

  const esc = value => {
    try { return escapeHtml(String(value ?? "")); }
    catch (_error) {
      const div = document.createElement("div");
      div.textContent = String(value ?? "");
      return div.innerHTML;
    }
  };
  const attr = value => {
    try { return escapeAttr(String(value ?? "")); }
    catch (_error) { return esc(value).replace(/"/g, "&quot;"); }
  };
  const randomId = () => {
    try { return foundry.utils.randomID(16); }
    catch (_error) { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
  };
  const clone = value => {
    try { return foundry.utils.deepClone(value); }
    catch (_error) { return JSON.parse(JSON.stringify(value ?? null)); }
  };

  function getView() {
    try { return getBetterInvCanvasView(); }
    catch (_error) {
      return canvas?.app?.canvas ?? canvas?.app?.view ?? document.querySelector("#board canvas") ?? null;
    }
  }

  function getInteractionHost() {
    // Bind directly to Foundry's render canvas. Using the outer #board element
    // caused pointer events to be swallowed by overlays and active canvas tools.
    return getView();
  }

  function clientToCanvas(clientX, clientY) {
    const view = getView();
    if (!view || !canvas?.stage) return null;
    const x = Number(clientX);
    const y = Number(clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const PointClass = globalThis.PIXI?.Point;
    if (!PointClass) return null;
    const renderer = canvas?.app?.renderer;

    try {
      if (typeof canvas?.canvasCoordinatesFromClient === "function") {
        const local = canvas.canvasCoordinatesFromClient(new PointClass(x, y));
        if (Number.isFinite(local?.x) && Number.isFinite(local?.y)) return { x: local.x, y: local.y };
      }
    } catch (_error) {}

    try {
      const screen = new PointClass();
      if (renderer?.events?.mapPositionToPoint) {
        renderer.events.mapPositionToPoint(screen, x, y);
        const local = canvas.stage.toLocal?.(screen) ?? canvas.stage.worldTransform?.applyInverse?.(screen);
        if (Number.isFinite(local?.x) && Number.isFinite(local?.y)) return { x: local.x, y: local.y };
      }
    } catch (_error) {}

    const rect = view.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;

    const logicalWidth = Number(renderer?.screen?.width) || rect.width;
    const logicalHeight = Number(renderer?.screen?.height) || rect.height;
    const screen = new PointClass(
      (x - rect.left) * (logicalWidth / rect.width),
      (y - rect.top) * (logicalHeight / rect.height)
    );
    try {
      const local = canvas.stage.toLocal?.(screen) ?? canvas.stage.worldTransform?.applyInverse?.(screen);
      if (Number.isFinite(local?.x) && Number.isFinite(local?.y)) return { x: local.x, y: local.y };
    } catch (_error) {}
    return null;
  }

  function getStageScale() {
    const transform = canvas?.stage?.worldTransform;
    const sx = Math.hypot(Number(transform?.a) || 1, Number(transform?.b) || 0);
    const sy = Math.hypot(Number(transform?.c) || 0, Number(transform?.d) || 1);
    return Math.max(0.01, (sx + sy) / 2 || 1);
  }

  function getTileDocument(tileOrDocument) {
    return tileOrDocument?.document ?? tileOrDocument ?? null;
  }

  function getTilePlaceable(documentOrTile) {
    const document = getTileDocument(documentOrTile);
    if (!document) return null;
    return documentOrTile?.document
      ? documentOrTile
      : canvas?.tiles?.get?.(document.id)
        ?? Array.from(canvas?.tiles?.placeables ?? []).find(tile => String(getTileDocument(tile)?.id ?? "") === String(document.id))
        ?? document.object
        ?? null;
  }

  function getGroundTiles() {
    return Array.from(canvas?.tiles?.placeables ?? [])
      .filter(tile => {
        try { return Boolean(getBetterInvGroundLoot(tile)); }
        catch (_error) { return false; }
      });
  }

  function transformPoint(transform, point, inverse = false) {
    const PointClass = globalThis.PIXI?.Point;
    if (!PointClass || !transform) return null;
    try {
      const input = new PointClass(Number(point?.x) || 0, Number(point?.y) || 0);
      const output = inverse ? transform.applyInverse(input) : transform.apply(input);
      if (Number.isFinite(output?.x) && Number.isFinite(output?.y)) return { x: output.x, y: output.y };
    } catch (_error) {}
    return null;
  }

  function displayObjectPolygonInScene(displayObject) {
    if (!displayObject || !canvas?.stage) return null;
    try {
      const bounds = displayObject.getLocalBounds?.();
      const transform = displayObject.worldTransform;
      const stageTransform = canvas.stage.worldTransform;
      if (!bounds || !transform || !stageTransform) return null;
      const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height }
      ];
      const points = corners.map(corner => {
        const global = transformPoint(transform, corner, false);
        return global ? transformPoint(stageTransform, global, true) : null;
      });
      if (points.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))) return points;
    } catch (_error) {}
    return null;
  }

  function getFallbackTilePolygon(document) {
    const width = Math.max(1, Number(document?.width) || 1);
    const height = Math.max(1, Number(document?.height) || 1);
    const cx = Number(document?.x) + width / 2;
    const cy = Number(document?.y) + height / 2;
    const radians = (Number(document?.rotation) || 0) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [width / 2, height / 2],
      [-width / 2, height / 2]
    ].map(([dx, dy]) => ({
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    }));
  }

  function getTileVisualPolygon(tileOrDocument) {
    const tile = getTilePlaceable(tileOrDocument);
    const document = getTileDocument(tileOrDocument);
    // Foundry v14 renders the Tile artwork in a separate SpriteMesh. Its actual
    // world transform is therefore the reliable source of truth for the visible
    // rectangle. Using document.x/y here caused the half-width/half-height offset
    // seen in the selection frame and click area.
    const meshPolygon = displayObjectPolygonInScene(tile?.mesh);
    if (meshPolygon?.length === 4) return meshPolygon;
    return document ? getFallbackTilePolygon(document) : [];
  }

  function pointInsideConvexPolygon(points, x, y) {
    if (!Array.isArray(points) || points.length < 3) return false;
    let sign = 0;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      const cross = (b.x - a.x) * (Number(y) - a.y) - (b.y - a.y) * (Number(x) - a.x);
      if (Math.abs(cross) < 0.0001) continue;
      const current = Math.sign(cross);
      if (!sign) sign = current;
      else if (current !== sign) return false;
    }
    return true;
  }

  function pointInsideTile(tileOrDocument, x, y) {
    // Clicking, pickup, selection and dragging all use this exact same visual
    // rectangle. Transparent pixels still count because the complete mesh bounds
    // are tested, not the image's opaque pixels.
    return pointInsideConvexPolygon(getTileVisualPolygon(tileOrDocument), x, y);
  }

  function getTokenVisualPolygon(tokenDocument) {
    const object = tokenDocument?.object ?? canvas?.tokens?.get?.(tokenDocument?.id) ?? tokenDocument;
    const meshPolygon = displayObjectPolygonInScene(object?.mesh);
    if (meshPolygon?.length === 4) return meshPolygon;

    const document = tokenDocument?.document ?? tokenDocument;
    const gridSize = Math.max(1, Number(document?.parent?.grid?.size ?? canvas?.grid?.size ?? 100) || 100);
    const width = Math.max(1, Number(document?.width) || 1) * gridSize;
    const height = Math.max(1, Number(document?.height) || 1) * gridSize;
    const x = Number(document?.x ?? object?.x ?? 0);
    const y = Number(document?.y ?? object?.y ?? 0);
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height }
    ];
  }

  function lineOrientation(a, b, c) {
    return (Number(b.y) - Number(a.y)) * (Number(c.x) - Number(b.x))
      - (Number(b.x) - Number(a.x)) * (Number(c.y) - Number(b.y));
  }

  function pointOnSegment(a, b, point) {
    const epsilon = 0.001;
    return Number(point.x) <= Math.max(Number(a.x), Number(b.x)) + epsilon
      && Number(point.x) >= Math.min(Number(a.x), Number(b.x)) - epsilon
      && Number(point.y) <= Math.max(Number(a.y), Number(b.y)) + epsilon
      && Number(point.y) >= Math.min(Number(a.y), Number(b.y)) - epsilon;
  }

  function segmentsIntersect(a, b, c, d) {
    const o1 = lineOrientation(a, b, c);
    const o2 = lineOrientation(a, b, d);
    const o3 = lineOrientation(c, d, a);
    const o4 = lineOrientation(c, d, b);
    const epsilon = 0.001;
    if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
      && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
    if (Math.abs(o1) <= epsilon && pointOnSegment(a, b, c)) return true;
    if (Math.abs(o2) <= epsilon && pointOnSegment(a, b, d)) return true;
    if (Math.abs(o3) <= epsilon && pointOnSegment(c, d, a)) return true;
    if (Math.abs(o4) <= epsilon && pointOnSegment(c, d, b)) return true;
    return false;
  }

  function convexPolygonsOverlap(left, right) {
    if (!Array.isArray(left) || left.length < 3 || !Array.isArray(right) || right.length < 3) return false;
    if (left.some(point => pointInsideConvexPolygon(right, point.x, point.y))) return true;
    if (right.some(point => pointInsideConvexPolygon(left, point.x, point.y))) return true;
    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
      const a = left[leftIndex];
      const b = left[(leftIndex + 1) % left.length];
      for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
        const c = right[rightIndex];
        const d = right[(rightIndex + 1) % right.length];
        if (segmentsIntersect(a, b, c, d)) return true;
      }
    }
    return false;
  }

  function tokenOverlapsTile(tokenDocument, tileOrDocument) {
    return convexPolygonsOverlap(getTokenVisualPolygon(tokenDocument), getTileVisualPolygon(tileOrDocument));
  }

  function tokenSweptOverlapsTile(tokenDocument, tileOrDocument, fromCenter, toCenter = getTokenCenter(tokenDocument)) {
    if (!fromCenter || !toCenter) return false;
    const dx = Number(toCenter.x) - Number(fromCenter.x);
    const dy = Number(toCenter.y) - Number(fromCenter.y);
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance < 0.25) return false;

    const tokenPolygon = getTokenVisualPolygon(tokenDocument);
    const tilePolygon = getTileVisualPolygon(tileOrDocument);
    if (tokenPolygon.length < 3 || tilePolygon.length < 3) return false;

    const edgeLengths = tilePolygon.map((point, index) => {
      const next = tilePolygon[(index + 1) % tilePolygon.length];
      return Math.hypot(Number(next.x) - Number(point.x), Number(next.y) - Number(point.y));
    }).filter(Number.isFinite);
    const smallestTileEdge = Math.max(4, Math.min(...edgeLengths, 32));
    const steps = Math.min(250, Math.max(2, Math.ceil(distance / Math.max(4, smallestTileEdge / 4))));

    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const sampleCenter = {
        x: Number(fromCenter.x) + dx * t,
        y: Number(fromCenter.y) + dy * t
      };
      const offsetX = sampleCenter.x - Number(toCenter.x);
      const offsetY = sampleCenter.y - Number(toCenter.y);
      const samplePolygon = tokenPolygon.map(point => ({
        x: Number(point.x) + offsetX,
        y: Number(point.y) + offsetY
      }));
      if (convexPolygonsOverlap(samplePolygon, tilePolygon)) return true;
    }
    return false;
  }

  function findTileAtPoint(x, y) {
    const pointX = Number(x);
    const pointY = Number(y);
    if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;

    return getGroundTiles()
      .filter(tile => {
        const document = getTileDocument(tile);
        if (!document) return false;
        if (document.hidden && !game.user?.isGM) return false;
        try { return isBetterInvGroundTileLocallyVisible(tile); }
        catch (_error) { return true; }
      })
      .sort((left, right) => {
        const a = getTileDocument(left);
        const b = getTileDocument(right);
        return (Number(b?.elevation) || 0) - (Number(a?.elevation) || 0)
          || (Number(b?.sort) || 0) - (Number(a?.sort) || 0);
      })
      .find(tile => pointInsideTile(tile, pointX, pointY)) ?? null;
  }

  function stopEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  }

  function readDisplayPosition(target) {
    const x = Number(target?.position?.x ?? target?.x);
    const y = Number(target?.position?.y ?? target?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function setDisplayPosition(target, x, y) {
    if (!target || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (target.position?.set) target.position.set(x, y);
    else {
      try { target.x = x; target.y = y; } catch (_error) {}
    }
  }

  function sceneDeltaForDisplayObject(target, dx, dy) {
    const PointClass = globalThis.PIXI?.Point;
    const stageTransform = canvas?.stage?.worldTransform;
    const parentTransform = target?.parent?.worldTransform;
    if (!PointClass || !stageTransform || !parentTransform) return { x: dx, y: dy };
    try {
      const globalStart = stageTransform.apply(new PointClass(0, 0));
      const globalEnd = stageTransform.apply(new PointClass(dx, dy));
      const localStart = parentTransform.applyInverse(globalStart);
      const localEnd = parentTransform.applyInverse(globalEnd);
      return { x: localEnd.x - localStart.x, y: localEnd.y - localStart.y };
    } catch (_error) {
      return { x: dx, y: dy };
    }
  }

  function captureTileVisualState(tile) {
    if (!tile) return null;
    return {
      control: readDisplayPosition(tile),
      mesh: readDisplayPosition(tile.mesh)
    };
  }

  function applyTileVisualDelta(tile, visualState, dx, dy) {
    if (!tile || !visualState) return;
    if (visualState.control) {
      const delta = sceneDeltaForDisplayObject(tile, dx, dy);
      setDisplayPosition(tile, visualState.control.x + delta.x, visualState.control.y + delta.y);
    }
    if (tile.mesh && visualState.mesh) {
      const delta = sceneDeltaForDisplayObject(tile.mesh, dx, dy);
      setDisplayPosition(tile.mesh, visualState.mesh.x + delta.x, visualState.mesh.y + delta.y);
    }
    tile._betterInvGroundDragDelta = { x: dx, y: dy };
    drawHitAreas();
  }

  function restoreTileVisualState(tile, visualState) {
    if (!tile || !visualState) return;
    if (visualState.control) setDisplayPosition(tile, visualState.control.x, visualState.control.y);
    if (tile.mesh && visualState.mesh) setDisplayPosition(tile.mesh, visualState.mesh.x, visualState.mesh.y);
    delete tile._betterInvGroundDragDelta;
    drawHitAreas();
  }

  function setCursorForTile(tile, dragging = false) {
    const host = getInteractionHost();
    if (!host?.style) return;
    if (!tile) {
      host.style.cursor = "";
      hoverTileId = "";
      return;
    }
    const document = getTileDocument(tile);
    const loot = getBetterInvGroundLoot(document);
    const canDrag = Boolean(game.user?.isGM || loot?.permissions?.playerMove === true);
    host.style.cursor = dragging ? "grabbing" : (canDrag ? "grab" : "pointer");
    hoverTileId = String(document?.id ?? "");
  }

  function installInteraction() {
    uninstallInteraction();
    const host = getInteractionHost();
    if (!host || !canvas?.ready) return;

    interactionController = new AbortController();
    const signal = interactionController.signal;
    const hostOptions = { capture: true, signal };
    const globalOptions = { capture: true, signal };

    host.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      const point = clientToCanvas(event.clientX, event.clientY);
      const tile = point ? findTileAtPoint(point.x, point.y) : null;
      if (!tile) {
        pointerState = null;
        selectedTileId = "";
        drawHitAreas();
        return;
      }

      const document = getTileDocument(tile);
      const loot = getBetterInvGroundLoot(document);
      const canDrag = Boolean(game.user?.isGM || loot?.permissions?.playerMove === true);
      selectedTileId = String(document.id ?? "");
      pointerState = {
        pointerId: event.pointerId,
        tileId: String(document.id ?? ""),
        sceneId: String(document.parent?.id ?? canvas?.scene?.id ?? ""),
        clientX: Number(event.clientX),
        clientY: Number(event.clientY),
        startCanvasX: Number(point.x),
        startCanvasY: Number(point.y),
        originalX: Number(document.x ?? tile.x ?? 0),
        originalY: Number(document.y ?? tile.y ?? 0),
        nextX: Number(document.x ?? tile.x ?? 0),
        nextY: Number(document.y ?? tile.y ?? 0),
        canDrag,
        dragging: false,
        visualState: captureTileVisualState(tile)
      };
      try { host.setPointerCapture?.(event.pointerId); } catch (_error) {}
      setCursorForTile(tile, false);
      drawHitAreas();
      stopEvent(event);
    }, hostOptions);

    window.addEventListener("pointermove", event => {
      const state = pointerState;
      if (!state) {
        const point = clientToCanvas(event.clientX, event.clientY);
        const tile = point ? findTileAtPoint(point.x, point.y) : null;
        setCursorForTile(tile, false);
        return;
      }
      if (state.pointerId != null && event.pointerId !== state.pointerId) return;
      if (!(event.buttons & 1)) return;

      const screenDistance = Math.hypot(Number(event.clientX) - state.clientX, Number(event.clientY) - state.clientY);
      if (!state.dragging && screenDistance < 6) return;
      if (!state.canDrag) {
        stopEvent(event);
        return;
      }

      const point = clientToCanvas(event.clientX, event.clientY);
      if (!point) return;
      state.dragging = true;
      state.nextX = state.originalX + (Number(point.x) - state.startCanvasX);
      state.nextY = state.originalY + (Number(point.y) - state.startCanvasY);
      const tile = getTilePlaceable({ id: state.tileId, parent: { id: state.sceneId } })
        ?? getGroundTiles().find(candidate => String(getTileDocument(candidate)?.id ?? "") === state.tileId);
      applyTileVisualDelta(tile, state.visualState, Number(point.x) - state.startCanvasX, Number(point.y) - state.startCanvasY);
      setCursorForTile(tile, true);
      stopEvent(event);
    }, globalOptions);

    window.addEventListener("pointerup", event => {
      const state = pointerState;
      if (!state || (state.pointerId != null && event.pointerId !== state.pointerId)) return;
      pointerState = null;
      const tile = getGroundTiles().find(candidate => String(getTileDocument(candidate)?.id ?? "") === state.tileId) ?? null;
      setCursorForTile(tile, false);
      stopEvent(event);
      if (!tile || !getBetterInvGroundLoot(tile)) return;

      if (state.dragging) {
        void (async () => {
          try {
            const document = getTileDocument(tile);
            if (game.user?.isGM) {
              await document.update({ x: Math.round(state.nextX), y: Math.round(state.nextY) }, {
                betterInventoryGroundMove: true,
                requestUserId: game.user.id,
                animate: false
              });
              delete tile._betterInvGroundDragDelta;
            } else {
              await requestBetterInvGmGroundAction("moveTile", {
                sceneId: state.sceneId,
                tileId: state.tileId,
                x: state.nextX,
                y: state.nextY
              });
              delete tile._betterInvGroundDragDelta;
            }
          } catch (error) {
            restoreTileVisualState(tile, state.visualState);
            ui.notifications.error(error?.betterInvUserMessage || error?.message || "Das Bodenobjekt konnte nicht verschoben werden.");
          } finally {
            drawHitAreas();
          }
        })();
        return;
      }

      const distance = Math.hypot(Number(event.clientX) - state.clientX, Number(event.clientY) - state.clientY);
      if (!state.dragging && distance < 6) {
        void openBetterInvGroundPickupDialog(getTileDocument(tile), { triggerClick: true });
      }
    }, globalOptions);

    window.addEventListener("pointercancel", () => {
      const state = pointerState;
      pointerState = null;
      if (!state?.dragging) return;
      const tile = getGroundTiles().find(candidate => String(getTileDocument(candidate)?.id ?? "") === state.tileId) ?? null;
      restoreTileVisualState(tile, state.visualState);
      setCursorForTile(tile, false);
    }, globalOptions);

    host.addEventListener("contextmenu", event => {
      const point = clientToCanvas(event.clientX, event.clientY);
      const tile = point ? findTileAtPoint(point.x, point.y) : null;
      if (!tile) return;
      selectedTileId = String(getTileDocument(tile)?.id ?? "");
      drawHitAreas();
      stopEvent(event);
      void openBetterInvGroundPickupDialog(getTileDocument(tile), { triggerClick: false });
    }, hostOptions);

    host.addEventListener("pointerleave", () => {
      if (!pointerState) setCursorForTile(null);
    }, hostOptions);

    drawHitAreas();
  }

  function uninstallInteraction() {
    interactionController?.abort?.();
    interactionController = null;
    pointerState = null;
    setCursorForTile(null);
  }

  function getTilePolygon(tileOrDocument) {
    return getTileVisualPolygon(tileOrDocument);
  }

  function ensureDebugGraphics() {
    if (debugGraphics && !debugGraphics.destroyed) return debugGraphics;
    const Graphics = globalThis.PIXI?.Graphics;
    if (!Graphics || !canvas?.stage) return null;
    debugGraphics = new Graphics();
    debugGraphics.eventMode = "none";
    debugGraphics.zIndex = 999999;
    try { canvas.stage.sortableChildren = true; } catch (_error) {}
    canvas.stage.addChild(debugGraphics);
    return debugGraphics;
  }

  function drawPolygon(graphics, points, color, alpha = 1, width = 2) {
    if (!graphics || points.length < 2) return;
    const scale = getStageScale();
    const lineWidth = Math.max(0.5, width / scale);
    try {
      if (typeof graphics.poly === "function" && typeof graphics.stroke === "function") {
        const flat = points.flatMap(point => [point.x, point.y]);
        graphics.poly(flat, true).stroke({ color, alpha, width: lineWidth });
        return;
      }
    } catch (_error) {}
    try {
      graphics.lineStyle(lineWidth, color, alpha);
      graphics.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) graphics.lineTo(points[index].x, points[index].y);
      graphics.lineTo(points[0].x, points[0].y);
    } catch (_error) {}
  }

  function drawHitAreas() {
    const graphics = ensureDebugGraphics();
    if (!graphics) return;
    graphics.clear();
    const tiles = getGroundTiles().filter(tile => {
      if (game.user?.isGM) return true;
      try { return isBetterInvGroundTileLocallyVisible(tile); }
      catch (_error) { return true; }
    });
    for (const tile of tiles) {
      const document = getTileDocument(tile);
      const id = String(document?.id ?? "");
      const selected = id && id === selectedTileId;
      if (!hitAreaDebugEnabled && !selected) continue;
      drawPolygon(graphics, getTilePolygon(tile), selected ? 0xffcc55 : 0x42d9ff, selected ? 1 : 0.8, selected ? 3 : 2);
    }
  }

  function toggleHitAreas() {
    hitAreaDebugEnabled = !hitAreaDebugEnabled;
    drawHitAreas();
    ui.notifications.info(`Bodenobjekt-Trefferflächen ${hitAreaDebugEnabled ? "eingeblendet" : "ausgeblendet"}.`);
    return true;
  }

  function normalizeAction(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const type = Object.hasOwn(ACTION_TYPES, source.type) ? source.type : "chat";
    const outcome = Object.hasOwn(OUTCOMES, source.outcome) ? source.outcome : "always";
    return {
      id: String(source.id || randomId()),
      type,
      outcome,
      value: String(source.value ?? ""),
      secondary: String(source.secondary ?? ""),
      duration: Math.max(0, Number(source.duration) || 0),
      radius: Math.max(0, Number(source.radius) || 0)
    };
  }

  function getCheckKeyOptions(type) {
    if (type === "ability" || type === "save") return ABILITY_OPTIONS;
    if (type === "skill") return SKILL_OPTIONS;
    return {};
  }

  function getDefaultCheckKey(type) {
    return type === "skill" ? "prc" : "str";
  }

  function normalizeCheckKey(type, key) {
    const options = getCheckKeyOptions(type);
    const clean = String(key || "").trim().toLowerCase();
    if (Object.hasOwn(options, clean)) return clean;
    return getDefaultCheckKey(type);
  }

  function normalizeRule(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const trigger = Object.hasOwn(RULE_TRIGGERS, source.trigger) ? source.trigger : "activate";
    const checkType = Object.hasOwn(CHECK_TYPES, source?.check?.type) ? source.check.type : "none";

    let rawActions = [];
    if (Array.isArray(source.actions)) rawActions = source.actions;
    else if (source.actions && typeof source.actions === "object") {
      for (const outcome of Object.keys(OUTCOMES)) {
        const entries = Array.isArray(source.actions[outcome]) ? source.actions[outcome] : [];
        rawActions.push(...entries.map(action => ({ ...action, outcome })));
      }
    }
    // Backwards compatibility with the first Phase-10.5 rule format.
    if (!rawActions.length && source.action) {
      rawActions = [{ ...source.action, outcome: Object.hasOwn(OUTCOMES, source.outcome) ? source.outcome : "always" }];
    }

    return {
      id: String(source.id || randomId()),
      name: String(source.name || "Neuer Effekt"),
      enabled: source.enabled !== false,
      trigger,
      radius: Math.max(0, Number(source.radius) || 0),
      once: source.once === true,
      cooldown: Math.max(0, Number(source.cooldown) || 0),
      check: {
        type: checkType,
        key: normalizeCheckKey(checkType, source?.check?.key),
        dc: Math.max(0, Number(source?.check?.dc) || 10),
        blockOnFail: source?.check?.blockOnFail === true
      },
      actions: rawActions.map(normalizeAction)
    };
  }

  function getRules(tileOrLoot) {
    const loot = tileOrLoot?.kind ? tileOrLoot : getBetterInvGroundLoot(tileOrLoot);
    const rules = loot?.effects?.rules;
    return Array.isArray(rules) ? rules.map(normalizeRule) : [];
  }

  function hasTrigger(tileDocument, trigger) {
    return getRules(tileDocument).some(rule => rule.enabled && rule.trigger === trigger);
  }

  function canActivate(tileDocument) {
    if (!hasTrigger(tileDocument, "activate")) return false;
    if (game.user?.isGM) return true;
    const loot = getBetterInvGroundLoot(tileDocument);
    return loot?.permissions?.playerActivate !== false;
  }

  function optionsHtml(entries, selected) {
    return Object.entries(entries).map(([value, label]) =>
      `<option value="${attr(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`
    ).join("");
  }

  function checkKeyOptionsHtml(type, selected) {
    const entries = getCheckKeyOptions(type);
    if (!Object.keys(entries).length) return `<option value="">Kein Wurf ausgewählt</option>`;
    const clean = normalizeCheckKey(type, selected);
    return optionsHtml(entries, clean);
  }

  function actionCardHtml(action) {
    return `
      <div class="betterinv-ground-effect-action" data-effect-action data-action-id="${attr(action.id)}">
        <div class="betterinv-ground-effect-action-head">
          <select data-action-field="outcome" aria-label="Ausführungsbedingung">
            ${optionsHtml(OUTCOMES, action.outcome)}
          </select>
          <select data-action-field="type" aria-label="Aktion">
            ${optionsHtml(ACTION_TYPES, action.type)}
          </select>
          <button type="button" data-remove-action title="Aktion entfernen"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="betterinv-ground-effect-action-grid">
          <label>Wert / Formel / Text / Ziel
            <input type="text" data-action-field="value" value="${attr(action.value)}" placeholder="z. B. 2d6, Nachricht, Makroname oder Tile-ID">
          </label>
          <label>Dauer (Sek.)
            <input type="number" data-action-field="duration" min="0" step="1" value="${attr(action.duration)}">
          </label>
          <label>Radius (Fuß)
            <input type="number" data-action-field="radius" min="0" step="1" value="${attr(action.radius)}">
          </label>
        </div>
        <label>Zusatzdaten
          <textarea data-action-field="secondary" rows="2" placeholder='Active Effect: JSON-Array. Andere Bodenobjekte: optionaler Trigger, z. B. activate.'>${esc(action.secondary)}</textarea>
        </label>
      </div>`;
  }

  function ruleCardHtml(rule) {
    return `
      <article class="betterinv-ground-effect-rule" data-effect-rule data-rule-id="${attr(rule.id)}">
        <header>
          <label class="betterinv-ground-effect-enabled">
            <input type="checkbox" data-field="enabled" ${rule.enabled ? "checked" : ""}>
            <span>Aktiv</span>
          </label>
          <input type="text" data-field="name" value="${attr(rule.name)}" aria-label="Name des Effekts">
          <button type="button" data-remove-rule title="Effekt entfernen"><i class="fas fa-trash"></i></button>
        </header>

        <div class="betterinv-ground-effect-grid">
          <label>Trigger
            <select data-field="trigger">${optionsHtml(RULE_TRIGGERS, rule.trigger)}</select>
          </label>
          <label>Trigger-Reichweite (Fuß)
            <input type="number" data-field="radius" min="0" step="1" value="${attr(rule.radius)}">
          </label>
          <label>Abklingzeit (Sek.)
            <input type="number" data-field="cooldown" min="0" step="1" value="${attr(rule.cooldown)}">
          </label>
          <label class="betterinv-ground-effect-checkline">
            <input type="checkbox" data-field="once" ${rule.once ? "checked" : ""}> Nur einmal auslösen
          </label>
        </div>

        <fieldset>
          <legend>Optionaler Wurf</legend>
          <div class="betterinv-ground-effect-grid">
            <label>Art
              <select data-field="check.type">${optionsHtml(CHECK_TYPES, rule.check.type)}</select>
            </label>
            <label data-check-key-label><span data-check-key-title>Attribut / Fertigkeit</span>
              <select data-field="check.key" ${rule.check.type === "none" ? "disabled" : ""}>
                ${checkKeyOptionsHtml(rule.check.type, rule.check.key)}
              </select>
            </label>
            <label>SG
              <input type="number" data-field="check.dc" min="0" step="1" value="${attr(rule.check.dc)}">
            </label>
            <label class="betterinv-ground-effect-checkline">
              <input type="checkbox" data-field="check.blockOnFail" ${rule.check.blockOnFail ? "checked" : ""}> Interaktion bei Fehlschlag stoppen
            </label>
          </div>
        </fieldset>

        <fieldset class="betterinv-ground-effect-actions">
          <div class="betterinv-ground-effect-actions-title">
            <legend>Aktionen</legend>
            <button type="button" data-add-action><i class="fas fa-plus"></i> Aktion hinzufügen</button>
          </div>
          <div data-effect-actions>
            ${rule.actions.map(actionCardHtml).join("") || `<p class="betterinv-ground-actions-empty" data-actions-empty>Noch keine Aktion angelegt.</p>`}
          </div>
        </fieldset>
      </article>`;
  }

  function readActionCard(card) {
    const value = path => card.querySelector(`[data-action-field="${CSS.escape(path)}"]`);
    return normalizeAction({
      id: card.dataset.actionId || randomId(),
      outcome: value("outcome")?.value,
      type: value("type")?.value,
      value: value("value")?.value,
      duration: Number(value("duration")?.value),
      radius: Number(value("radius")?.value),
      secondary: value("secondary")?.value
    });
  }

  function readRuleCard(card) {
    const value = path => card.querySelector(`[data-field="${CSS.escape(path)}"]`);
    return normalizeRule({
      id: card.dataset.ruleId || randomId(),
      name: value("name")?.value,
      enabled: Boolean(value("enabled")?.checked),
      trigger: value("trigger")?.value,
      radius: Number(value("radius")?.value),
      cooldown: Number(value("cooldown")?.value),
      once: Boolean(value("once")?.checked),
      check: {
        type: value("check.type")?.value,
        key: value("check.key")?.value,
        dc: Number(value("check.dc")?.value),
        blockOnFail: Boolean(value("check.blockOnFail")?.checked)
      },
      actions: Array.from(card.querySelectorAll("[data-effect-action]")).map(readActionCard)
    });
  }

  async function saveRules(tileDocument, rules) {
    if (!game.user?.isGM) throw new Error("Nur ein GM kann Bodenobjekt-Effekte bearbeiten.");
    const loot = clone(getBetterInvGroundLoot(tileDocument) ?? {});
    loot.version = Math.max(3, Number(loot.version) || 0);
    loot.effects = {
      ...(loot.effects ?? {}),
      rules: Array.from(rules ?? []).map(normalizeRule)
    };
    await tileDocument.update({
      [`flags.${MODULE_ID}.${BETTER_INV_GROUND_FLAG}`]: loot
    }, { betterInventoryGroundEffects: true, userId: game.user.id });
    drawHitAreas();
    await primeTileRuleStates(tileDocument);
  }

  async function openEffectEditor(tileDocument) {
    if (!game.user?.isGM) {
      ui.notifications.warn("Nur ein GM kann die Effekte eines Bodenobjekts bearbeiten.");
      return false;
    }
    const loot = getBetterInvGroundLoot(tileDocument);
    if (!loot) return false;
    const initialRules = getRules(tileDocument);

    return await new Promise(resolve => {
      let settled = false;
      const done = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      let dialog;
      const bindEditor = html => {
        const rawElement = html?.[0] ?? html;
        const element = decorateBetterInvDialog(dialog, {
          classes: ["betterinv-standard-dialog", "betterinv-ground-effects-dialog"]
        }) ?? rawElement;
        if (!element || element.dataset.betterInvEffectsEditorBound === "true") return;
        element.dataset.betterInvEffectsEditorBound = "true";

        const list = element.querySelector?.("[data-effect-rules]");
        const refreshEmpty = () => {
          const existing = list?.querySelector?.("[data-effects-empty]");
          const hasRules = Boolean(list?.querySelector?.("[data-effect-rule]"));
          if (hasRules) existing?.remove?.();
          else if (list && !existing) list.insertAdjacentHTML("beforeend", `<p class="betterinv-ground-effects-empty" data-effects-empty>Noch keine Effekte angelegt.</p>`);
        };
        const refreshCheckKey = ruleCard => {
          const typeSelect = ruleCard?.querySelector?.('[data-field="check.type"]');
          const keySelect = ruleCard?.querySelector?.('[data-field="check.key"]');
          const title = ruleCard?.querySelector?.("[data-check-key-title]");
          if (!typeSelect || !keySelect) return;
          const type = String(typeSelect.value || "none");
          const previous = String(keySelect.value || "");
          keySelect.innerHTML = checkKeyOptionsHtml(type, previous);
          keySelect.disabled = type === "none";
          if (title) {
            title.textContent = type === "skill"
              ? "Fertigkeit"
              : type === "save"
                ? "Rettungswurf-Attribut"
                : type === "ability"
                  ? "Attribut"
                  : "Attribut / Fertigkeit";
          }
        };
        for (const ruleCard of Array.from(list?.querySelectorAll?.("[data-effect-rule]") ?? [])) refreshCheckKey(ruleCard);
        list?.addEventListener?.("change", event => {
          if (!event.target?.matches?.('[data-field="check.type"]')) return;
          refreshCheckKey(event.target.closest?.("[data-effect-rule]"));
        });
        element.querySelector?.("[data-add-rule]")?.addEventListener("click", () => {
          list?.querySelector?.("[data-effects-empty]")?.remove?.();
          const rule = normalizeRule({
            name: `Effekt ${(list?.querySelectorAll?.("[data-effect-rule]")?.length ?? 0) + 1}`,
            actions: [{ type: "chat", outcome: "always" }]
          });
          list?.insertAdjacentHTML?.("beforeend", ruleCardHtml(rule));
          refreshCheckKey(list?.lastElementChild);
          list?.lastElementChild?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
        });
        list?.addEventListener?.("click", event => {
          const removeRule = event.target?.closest?.("[data-remove-rule]");
          if (removeRule) {
            removeRule.closest?.("[data-effect-rule]")?.remove?.();
            refreshEmpty();
            return;
          }

          const addAction = event.target?.closest?.("[data-add-action]");
          if (addAction) {
            const ruleCard = addAction.closest?.("[data-effect-rule]");
            const actions = ruleCard?.querySelector?.("[data-effect-actions]");
            actions?.querySelector?.("[data-actions-empty]")?.remove?.();
            actions?.insertAdjacentHTML?.("beforeend", actionCardHtml(normalizeAction({ type: "chat", outcome: "always" })));
            return;
          }

          const removeAction = event.target?.closest?.("[data-remove-action]");
          if (removeAction) {
            const ruleCard = removeAction.closest?.("[data-effect-rule]");
            const actions = ruleCard?.querySelector?.("[data-effect-actions]");
            removeAction.closest?.("[data-effect-action]")?.remove?.();
            if (actions && !actions.querySelector("[data-effect-action]")) {
              actions.insertAdjacentHTML("beforeend", `<p class="betterinv-ground-actions-empty" data-actions-empty>Noch keine Aktion angelegt.</p>`);
            }
          }
        });
      };

      dialog = new Dialog({
        title: `Effekte: ${loot.name || tileDocument.name || "Bodenobjekt"}`,
        content: `
          <form class="betterinv-ground-effects-editor" autocomplete="off">
            <header class="betterinv-ground-effects-intro">
              <div>
                <strong>Trigger und automatische Aktionen</strong>
                <p>Jede Regel würfelt höchstens einmal. Danach können beliebig viele Aktionen immer, nur bei Erfolg oder nur bei Fehlschlag ausgeführt werden.</p>
              </div>
              <button type="button" data-add-rule><i class="fas fa-plus"></i> Effekt hinzufügen</button>
            </header>
            <div class="betterinv-ground-effect-rules" data-effect-rules>
              ${initialRules.map(ruleCardHtml).join("") || `<p class="betterinv-ground-effects-empty" data-effects-empty>Noch keine Effekte angelegt.</p>`}
            </div>
            <aside class="betterinv-ground-effects-help">
              <strong>Wichtige Eingaben:</strong>
              Schaden/Heilung: Formel wie <code>2d6+3</code>. Active Effect: Name bei „Wert“ und ein JSON-Array bei „Zusatzdaten“. Andere Bodenobjekte: ID, UUID oder exakter Name; mehrere Ziele mit Komma trennen.
            </aside>
          </form>`,
        buttons: {
          save: {
            icon: '<i class="fas fa-floppy-disk"></i>',
            label: "Effekte speichern",
            callback: html => {
              const root = html?.[0] ?? html;
              const rules = Array.from(root?.querySelectorAll?.("[data-effect-rule]") ?? []).map(readRuleCard);
              void saveRules(tileDocument, rules)
                .then(() => {
                  ui.notifications.info("Bodenobjekt-Effekte gespeichert.");
                  done(true);
                })
                .catch(error => {
                  ui.notifications.error(error?.message || "Effekte konnten nicht gespeichert werden.");
                  done(false);
                });
            }
          },
          cancel: {
            icon: '<i class="fas fa-xmark"></i>',
            label: "Abbrechen",
            callback: () => done(false)
          }
        },
        default: "save",
        render: bindEditor,
        close: () => done(false)
      }, {
        width: 820,
        height: 780,
        resizable: true,
        classes: ["betterinv-standard-dialog", "betterinv-ground-effects-dialog"]
      });
      dialog.render(true);
    });
  }

  function decorateObjectEditor(element, tileDocument) {
    if (!element || element.dataset.betterInvEffectsDecorated === "true") return;
    element.dataset.betterInvEffectsDecorated = "true";
    const button = element.querySelector("[data-ground-open-effects]");
    const count = element.querySelector("[data-ground-effect-count]");
    const updateCount = () => {
      if (count) {
        const rules = getRules(tileDocument);
        count.textContent = `${rules.filter(rule => rule.enabled).length} aktiv · ${rules.length} insgesamt`;
      }
    };
    button?.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      await openEffectEditor(tileDocument);
      updateCount();
    });
    updateCount();
  }

  function getContextActor(context = {}) {
    if (context.actor) return context.actor;
    if (context.actorId) return game.actors?.get?.(context.actorId) ?? null;
    if (context.token?.actor) return context.token.actor;
    try { return getCurrentActor(); }
    catch (_error) { return null; }
  }

  function getContextToken(context = {}, actor = null) {
    if (context.token) return context.token;
    if (context.tokenId) {
      return canvas?.tokens?.get?.(context.tokenId)
        ?? canvas?.scene?.tokens?.get?.(context.tokenId)?.object
        ?? null;
    }
    const controlled = Array.from(canvas?.tokens?.controlled ?? []).find(token => !actor || token.actor?.id === actor.id);
    if (controlled) return controlled;
    return Array.from(canvas?.tokens?.placeables ?? []).find(token => token.actor?.id === actor?.id) ?? null;
  }

  function getRuleRuntimeKey(tileDocument, rule) {
    return `${tileDocument?.parent?.id ?? canvas?.scene?.id}:${tileDocument?.id}:${rule.id}`;
  }

  function getStoredRuleRuntime(tileDocument, rule) {
    const loot = getBetterInvGroundLoot(tileDocument) ?? {};
    return loot?.effects?.runtime?.[rule.id] ?? localRuleRuntime.get(getRuleRuntimeKey(tileDocument, rule)) ?? {};
  }

  function ruleIsReady(tileDocument, rule) {
    const runtime = getStoredRuleRuntime(tileDocument, rule);
    if (rule.once && Number(runtime.count) > 0) return false;
    const cooldownMs = Math.max(0, Number(rule.cooldown) || 0) * 1000;
    if (cooldownMs && Date.now() - Number(runtime.lastAt || 0) < cooldownMs) return false;
    return true;
  }

  async function markRulesTriggered(tileDocument, rules) {
    if (!rules.length || !tileDocument) return;
    const now = Date.now();
    for (const rule of rules) {
      const key = getRuleRuntimeKey(tileDocument, rule);
      const previous = getStoredRuleRuntime(tileDocument, rule);
      localRuleRuntime.set(key, { lastAt: now, count: Number(previous.count || 0) + 1 });
    }
    if (!game.user?.isGM || !tileDocument.parent) return;
    const loot = clone(getBetterInvGroundLoot(tileDocument) ?? {});
    loot.effects = { ...(loot.effects ?? {}), runtime: { ...(loot.effects?.runtime ?? {}) } };
    for (const rule of rules) {
      const previous = loot.effects.runtime[rule.id] ?? {};
      loot.effects.runtime[rule.id] = { lastAt: now, count: Number(previous.count || 0) + 1 };
    }
    try {
      await tileDocument.update({
        [`flags.${MODULE_ID}.${BETTER_INV_GROUND_FLAG}.effects.runtime`]: loot.effects.runtime
      }, { betterInventoryGroundEffectRuntime: true });
    } catch (_error) {}
  }

  function getModifier(actor, type, key) {
    const clean = String(key || "").trim().toLowerCase();
    const firstNumber = values => {
      for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number)) return number;
      }
      return 0;
    };
    if (type === "skill") {
      return firstNumber([
        foundry.utils.getProperty(actor, `system.skills.${clean}.total`),
        foundry.utils.getProperty(actor, `system.skills.${clean}.mod`),
        foundry.utils.getProperty(actor, `system.skills.${clean}.value`)
      ]);
    }
    if (type === "save") {
      return firstNumber([
        foundry.utils.getProperty(actor, `system.abilities.${clean}.save.value`),
        foundry.utils.getProperty(actor, `system.abilities.${clean}.save.mod`),
        foundry.utils.getProperty(actor, `system.abilities.${clean}.save`),
        foundry.utils.getProperty(actor, `system.abilities.${clean}.mod`)
      ]);
    }
    return firstNumber([
      foundry.utils.getProperty(actor, `system.abilities.${clean}.check.value`),
      foundry.utils.getProperty(actor, `system.abilities.${clean}.mod`)
    ]);
  }

  async function evaluateRoll(formula, data = {}) {
    const RollClass = globalThis.Roll;
    if (!RollClass) throw new Error("Foundrys Würfelsystem ist nicht verfügbar.");
    const roll = new RollClass(String(formula || "0"), data);
    if (typeof roll.evaluate === "function") await roll.evaluate();
    else if (typeof roll.roll === "function") await roll.roll();
    return roll;
  }

  async function postRoll(roll, { actor, flavor } = {}) {
    try {
      if (typeof roll?.toMessage === "function") {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker?.({ actor }) ?? { alias: actor?.name ?? game.user?.name },
          flavor
        });
      }
    } catch (_error) {}
  }

  async function performCheck(rule, actor) {
    if (rule.check.type === "none") return { performed: false, success: true, total: null };
    if (!actor) return { performed: true, success: false, total: null, reason: "Kein Charakter für den Wurf verfügbar." };
    const modifier = getModifier(actor, rule.check.type, rule.check.key);
    const roll = await evaluateRoll(`1d20 + ${modifier}`);
    const total = Number(roll.total) || 0;
    const success = total >= Number(rule.check.dc || 0);
    await postRoll(roll, {
      actor,
      flavor: `${rule.name}: ${CHECK_TYPES[rule.check.type]} (${String(rule.check.key).toUpperCase()}) gegen SG ${rule.check.dc} – ${success ? "Erfolg" : "Fehlschlag"}`
    });
    return { performed: true, success, total };
  }

  async function updateActorHp(actor, amount, mode, rule) {
    if (!actor) throw new Error("Für Schaden oder Heilung wurde kein Charakter gefunden.");
    const current = Number(foundry.utils.getProperty(actor, "system.attributes.hp.value")) || 0;
    const max = Number(foundry.utils.getProperty(actor, "system.attributes.hp.max")) || current;
    const delta = Math.max(0, Number(amount) || 0);
    const next = mode === "heal" ? Math.min(max, current + delta) : Math.max(0, current - delta);
    await actor.update({ "system.attributes.hp.value": next }, { betterInventoryGroundEffect: true });
    return next;
  }

  function parseChanges(value) {
    const clean = String(value || "").trim();
    if (!clean) return [];
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) throw new Error("Die Active-Effect-Zusatzdaten müssen ein JSON-Array sein.");
    return parsed;
  }

  function getLinkedLights(scene, tileId, ruleId = null) {
    const lights = Array.from(scene?.lights?.contents ?? scene?.lights ?? []);
    return lights.filter(light => {
      const link = light.getFlag?.(MODULE_ID, "groundEffectLight")
        ?? foundry.utils.getProperty(light, `flags.${MODULE_ID}.groundEffectLight`);
      return String(link?.tileId ?? "") === String(tileId ?? "")
        && (ruleId == null || String(link?.ruleId ?? "") === String(ruleId));
    });
  }

  async function createLinkedLight(tileDocument, rule, darkness = false) {
    const scene = tileDocument.parent ?? canvas?.scene;
    if (!scene) throw new Error("Die Szene wurde nicht gefunden.");
    const radius = Math.max(0, Number(rule.action.radius || rule.radius) || Number(scene.grid?.distance) || 5);
    const center = getTileVisualCenter(tileDocument);
    const data = {
      name: `${darkness ? "Dunkelheit" : "Licht"}: ${getBetterInvGroundLoot(tileDocument)?.name || tileDocument.name || "Bodenobjekt"}`,
      x: Math.round(center.x),
      y: Math.round(center.y),
      rotation: 0,
      walls: true,
      vision: false,
      hidden: false,
      config: {
        dim: radius,
        bright: darkness ? 0 : Math.max(0, radius / 2),
        angle: 360,
        color: darkness ? "#000000" : "#ffb347",
        alpha: darkness ? 0.72 : 0.35,
        attenuation: 0.5,
        luminosity: darkness ? -1 : 0.5,
        coloration: 1,
        contrast: 0,
        saturation: darkness ? -1 : 0,
        shadows: darkness ? 1 : 0,
        negative: darkness
      },
      flags: {
        [MODULE_ID]: {
          groundEffectLight: {
            tileId: tileDocument.id,
            ruleId: rule.id,
            darkness
          }
        }
      }
    };
    const existing = getLinkedLights(scene, tileDocument.id, rule.id)[0] ?? null;
    let light;
    try {
      if (existing) {
        await existing.update(data, { betterInventoryGroundEffect: true });
        light = existing;
      } else {
        const created = await scene.createEmbeddedDocuments("AmbientLight", [data], { betterInventoryGroundEffect: true });
        light = created?.[0] ?? null;
      }
    } catch (error) {
      console.error(`${MODULE_ID} | ${darkness ? "Dunkelheit" : "Licht"} konnte nicht erzeugt werden`, { data, error });
      throw new Error(`${darkness ? "Dunkelheit" : "Licht"} konnte nicht erzeugt werden: ${error?.message || "Unbekannter Foundry-Fehler"}`);
    }
    const durationMs = Math.max(0, Number(rule.action.duration) || 0) * 1000;
    try {
      light?.object?.draw?.();
      canvas?.perception?.update?.({ refreshLighting: true, refreshVision: true }, true);
    } catch (_error) {}
    if (light && durationMs) {
      setTimeout(() => {
        if (light.parent) {
          void light.delete({ betterInventoryGroundEffectExpired: true })
            .then(() => {
              try { canvas?.perception?.update?.({ refreshLighting: true, refreshVision: true }, true); }
              catch (_error) {}
            })
            .catch(() => {});
        }
      }, durationMs);
    }
    return light;
  }

  async function updateGroundLoot(tileDocument, updater) {
    const loot = clone(getBetterInvGroundLoot(tileDocument) ?? {});
    const next = updater(loot) ?? loot;
    await tileDocument.update({
      [`flags.${MODULE_ID}.${BETTER_INV_GROUND_FLAG}`]: next
    }, { betterInventoryGroundEffect: true });
    return next;
  }

  async function resolveOtherGroundTiles(scene, rawTargets, sourceTile) {
    const selectors = String(rawTargets || "")
      .split(/[\n,;]+/)
      .map(value => value.trim())
      .filter(Boolean);
    if (!selectors.length) return [];

    const sceneTiles = Array.from(scene?.tiles?.contents ?? scene?.tiles ?? [])
      .filter(tile => Boolean(getBetterInvGroundLoot(tile)));
    const result = new Map();

    for (const selector of selectors) {
      if (selector === "*") {
        for (const tile of sceneTiles) {
          if (String(tile.id) !== String(sourceTile?.id)) result.set(tile.id, tile);
        }
        continue;
      }

      const lowered = selector.toLocaleLowerCase("de-DE");
      for (const tile of sceneTiles) {
        const loot = getBetterInvGroundLoot(tile) ?? {};
        const candidates = [
          String(tile.id ?? ""),
          String(tile.uuid ?? ""),
          String(tile.name ?? ""),
          String(loot.name ?? "")
        ];
        if (candidates.some(candidate => candidate && candidate.toLocaleLowerCase("de-DE") === lowered)) {
          result.set(tile.id, tile);
        }
      }

      if (globalThis.fromUuid && selector.includes(".")) {
        try {
          const document = await fromUuid(selector);
          if (document?.documentName === "Tile" && getBetterInvGroundLoot(document)) result.set(document.id, document);
        } catch (_error) {}
      }
    }
    return Array.from(result.values());
  }

  async function executeAction(tileDocument, rule, action, context, check) {
    const actor = getContextActor(context);
    const token = getContextToken(context, actor);
    const scene = tileDocument.parent ?? canvas?.scene;
    const loot = getBetterInvGroundLoot(tileDocument) ?? {};
    const label = loot.name || tileDocument.name || "Bodenobjekt";

    switch (action.type) {
      case "chat": {
        const content = action.value || `${label}: ${rule.name}`;
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker?.({ actor, token }) ?? { alias: actor?.name ?? label },
          content: `<p><strong>${esc(label)}</strong>: ${esc(content)}</p>`
        });
        return;
      }
      case "damage":
      case "heal": {
        const roll = await evaluateRoll(action.value || "1");
        await postRoll(roll, { actor, flavor: `${label}: ${rule.name}` });
        await updateActorHp(actor, roll.total, action.type, rule);
        return;
      }
      case "activeEffect": {
        if (!actor) throw new Error("Für den Active Effect wurde kein Charakter gefunden.");
        const durationSeconds = Math.max(0, Number(action.duration) || 0);
        await actor.createEmbeddedDocuments("ActiveEffect", [{
          name: action.value || rule.name,
          img: loot.image || "icons/svg/aura.svg",
          icon: loot.image || "icons/svg/aura.svg",
          disabled: false,
          duration: durationSeconds ? { seconds: durationSeconds, startTime: game.time?.worldTime ?? 0 } : {},
          changes: parseChanges(action.secondary),
          flags: { [MODULE_ID]: { groundRuleId: rule.id, groundTileId: tileDocument.id } }
        }], { betterInventoryGroundEffect: true });
        return;
      }
      case "hide":
      case "show": {
        await updateGroundLoot(tileDocument, current => {
          current.display = {
            ...(current.display ?? {}),
            visibilityMode: action.type === "hide" ? "hidden" : "always"
          };
          return current;
        });
        scheduleBetterInvGroundVisibilityRefresh?.();
        return;
      }
      case "pickupAllow":
      case "pickupPrevent": {
        await updateGroundLoot(tileDocument, current => {
          current.interaction = {
            ...(current.interaction ?? {}),
            pickupEnabled: action.type === "pickupAllow"
          };
          return current;
        });
        return;
      }
      case "delete":
        await tileDocument.delete({ betterInventoryGroundEffect: true, ruleId: rule.id });
        return;
      case "macro": {
        const target = String(action.value || "").trim();
        const macro = game.macros?.get?.(target)
          ?? game.macros?.find?.(entry => entry.name === target)
          ?? null;
        if (!macro) throw new Error(`Das Makro „${target}“ wurde nicht gefunden.`);
        await macro.execute({ actor, token, tile: tileDocument, groundLoot: loot, rule, action, check });
        return;
      }
      case "light":
        await createLinkedLight(tileDocument, { ...rule, action }, false);
        return;
      case "darkness":
        await createLinkedLight(tileDocument, { ...rule, action }, true);
        return;
      case "sound": {
        const src = String(action.value || "").trim();
        if (!src) throw new Error("Für den Sound wurde kein Dateipfad angegeben.");
        const requestedVolume = Number(action.secondary);
        const volume = Number.isFinite(requestedVolume) ? Math.min(1, Math.max(0, requestedVolume)) : 0.8;
        if (globalThis.AudioHelper?.play) await AudioHelper.play({ src, volume, autoplay: true, loop: false }, true);
        else {
          const audio = new Audio(src);
          audio.volume = volume;
          await audio.play();
        }
        return;
      }
      case "activateOther": {
        if (!scene) throw new Error("Die Szene wurde nicht gefunden.");
        const targets = await resolveOtherGroundTiles(scene, action.value, tileDocument);
        if (!targets.length) throw new Error("Kein passendes Bodenobjekt wurde gefunden.");
        const requestedTrigger = String(action.secondary || "").trim();
        const targetTrigger = Object.hasOwn(RULE_TRIGGERS, requestedTrigger) ? requestedTrigger : "activate";
        for (const target of targets) {
          await runTriggerLocal(target, targetTrigger, {
            ...context,
            forceLocal: true,
            activationChain: context.activationChain
          });
        }
        return;
      }
      default:
        throw new Error(`Unbekannte Bodenobjekt-Aktion: ${action.type}`);
    }
  }

  async function runTriggerLocal(tileDocument, trigger, context = {}) {
    if (!tileDocument || !getBetterInvGroundLoot(tileDocument)) return { triggered: 0, blocked: false };

    const activationChain = context.activationChain instanceof Set ? context.activationChain : new Set();
    const chainKey = `${tileDocument.parent?.id ?? canvas?.scene?.id}:${tileDocument.id}:${trigger}`;
    if (activationChain.has(chainKey)) return { triggered: 0, blocked: false, cyclePrevented: true };
    activationChain.add(chainKey);

    try {
      const actor = getContextActor(context);
      const rules = getRules(tileDocument)
        .filter(rule => rule.enabled && rule.trigger === trigger)
        .filter(rule => ruleIsReady(tileDocument, rule));
      if (!rules.length) return { triggered: 0, blocked: false };

      let blocked = false;
      let triggered = 0;
      const marked = [];
      for (const rule of rules) {
        try {
          const check = await performCheck(rule, actor);
          if (check.performed && !check.success && rule.check.blockOnFail) blocked = true;

          for (const action of rule.actions) {
            const runAction = action.outcome === "always"
              || (action.outcome === "success" && check.success)
              || (action.outcome === "failure" && check.performed && !check.success);
            if (!runAction) continue;
            await executeAction(tileDocument, rule, action, { ...context, activationChain }, check);
            if (!tileDocument.parent) break;
          }

          marked.push(rule);
          triggered += 1;
          if (!tileDocument.parent) break;
        } catch (error) {
          console.error(`${MODULE_ID} | Bodenobjekt-Effekt fehlgeschlagen`, error);
          ui.notifications.error(`${rule.name}: ${error?.message || "Effekt fehlgeschlagen."}`);
        }
      }
      if (tileDocument.parent) await markRulesTriggered(tileDocument, marked);
      return { triggered, blocked };
    } finally {
      activationChain.delete(chainKey);
    }
  }


  function getSocketRequestContext(context = {}) {
    const actor = getContextActor(context);
    const token = getContextToken(context, actor);
    return {
      actorId: actor?.id ?? null,
      tokenId: token?.id ?? token?.document?.id ?? null
    };
  }

  function initializeSocket() {
    if (socketReady || !game?.socket?.on) return;
    socketReady = true;
    game.socket.on(BETTER_INV_GROUND_SOCKET, async message => {
      if (!message || typeof message !== "object") return;

      if (message.kind === "effect-trigger-response") {
        if (String(message.targetUserId ?? "") !== String(game.user?.id ?? "")) return;
        const pending = socketPending.get(String(message.requestId ?? ""));
        if (!pending) return;
        socketPending.delete(String(message.requestId));
        clearTimeout(pending.timer);
        if (message.ok) pending.resolve(message.result ?? { triggered: 0, blocked: false });
        else pending.reject(new Error(message.error || "Der Bodenobjekt-Effekt ist fehlgeschlagen."));
        return;
      }

      if (message.kind !== "effect-trigger-request") return;
      const primaryGm = getBetterInvPrimaryActiveGm();
      if (!game.user?.isGM || !primaryGm || primaryGm.id !== game.user.id) return;

      let response;
      try {
        const scene = game.scenes?.get?.(message.sceneId) ?? canvas?.scene ?? null;
        const tile = scene?.tiles?.get?.(message.tileId) ?? null;
        const actor = game.actors?.get?.(message.actorId) ?? null;
        const requestUser = game.users?.get?.(message.requestUserId) ?? null;
        if (!scene || !tile) throw new Error("Das Bodenobjekt wurde nicht gefunden.");
        if (actor && requestUser && !canBetterInvUserModifyActorAs(actor, requestUser)) {
          throw new Error("Der anfragende Spieler darf den angegebenen Charakter nicht steuern.");
        }
        const token = message.tokenId ? scene.tokens?.get?.(message.tokenId)?.object ?? null : null;
        const result = await runTriggerLocal(tile, message.trigger, { actor, token, requestUser });
        response = {
          kind: "effect-trigger-response",
          requestId: message.requestId,
          targetUserId: message.requestUserId,
          ok: true,
          result
        };
      } catch (error) {
        response = {
          kind: "effect-trigger-response",
          requestId: message.requestId,
          targetUserId: message.requestUserId,
          ok: false,
          error: error?.message || "Der Bodenobjekt-Effekt ist fehlgeschlagen."
        };
      }
      game.socket.emit(BETTER_INV_GROUND_SOCKET, response);
    });
  }

  async function requestTrigger(tileDocument, trigger, context = {}) {
    initializeSocket();
    const primaryGm = getBetterInvPrimaryActiveGm();
    if (game.user?.isGM || context.forceLocal) return await runTriggerLocal(tileDocument, trigger, context);
    if (!primaryGm) return await runTriggerLocal(tileDocument, trigger, context);

    const requestId = randomId();
    const ids = getSocketRequestContext(context);
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socketPending.delete(requestId);
        reject(new Error("Der GM hat den Effekt nicht rechtzeitig bestätigt."));
      }, 15000);
      socketPending.set(requestId, { resolve, reject, timer });
      game.socket.emit(BETTER_INV_GROUND_SOCKET, {
        kind: "effect-trigger-request",
        requestId,
        requestUserId: game.user.id,
        sceneId: tileDocument.parent?.id ?? canvas?.scene?.id,
        tileId: tileDocument.id,
        trigger,
        ...ids
      });
    });
  }

  function getPolygonCenter(points) {
    if (!Array.isArray(points) || !points.length) return null;
    const valid = points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    if (!valid.length) return null;
    return {
      x: valid.reduce((sum, point) => sum + Number(point.x), 0) / valid.length,
      y: valid.reduce((sum, point) => sum + Number(point.y), 0) / valid.length
    };
  }

  function getTokenCenter(tokenDocument) {
    const object = tokenDocument?.object ?? canvas?.tokens?.get?.(tokenDocument?.id) ?? tokenDocument;
    const meshCenter = getPolygonCenter(displayObjectPolygonInScene(object?.mesh));
    if (meshCenter) return meshCenter;
    if (object?.center && Number.isFinite(Number(object.center.x)) && Number.isFinite(Number(object.center.y))) {
      return { x: Number(object.center.x), y: Number(object.center.y) };
    }
    const document = tokenDocument?.document ?? tokenDocument;
    const gridSize = Number(document?.parent?.grid?.size ?? canvas?.grid?.size ?? 100) || 100;
    const width = Math.max(1, Number(document?.width) || 1) * gridSize;
    const height = Math.max(1, Number(document?.height) || 1) * gridSize;
    return {
      x: Number(document?.x ?? 0) + width / 2,
      y: Number(document?.y ?? 0) + height / 2
    };
  }

  function getTileVisualCenter(tileOrDocument) {
    return getPolygonCenter(getTileVisualPolygon(tileOrDocument)) ?? { x: 0, y: 0 };
  }

  function tokenDistanceToTile(tokenDocument, tileOrDocument) {
    const center = getTokenCenter(tokenDocument);
    const tileCenter = getTileVisualCenter(tileOrDocument);
    const tileDocument = getTileDocument(tileOrDocument);
    const gridSize = Math.max(1, Number(tileDocument?.parent?.grid?.size ?? canvas?.grid?.size ?? 100) || 100);
    const gridDistance = Math.max(0.0001, Number(tileDocument?.parent?.grid?.distance ?? canvas?.scene?.grid?.distance ?? 5) || 5);
    return Math.hypot(center.x - tileCenter.x, center.y - tileCenter.y) / gridSize * gridDistance;
  }

  function getTokenRuntimeKey(tokenDocument) {
    const sceneId = tokenDocument?.parent?.id ?? canvas?.scene?.id ?? "";
    const tokenId = tokenDocument?.id ?? tokenDocument?.document?.id ?? "";
    return `${sceneId}:${tokenId}`;
  }

  function clearTileRuleStates(tileDocument) {
    const sceneId = String(tileDocument?.parent?.id ?? canvas?.scene?.id ?? "");
    const tileId = String(tileDocument?.id ?? "");
    for (const key of Array.from(tokenRuleStates.keys())) {
      if (key.startsWith(`${sceneId}:${tileId}:`)) tokenRuleStates.delete(key);
    }
  }

  async function primeTileRuleStates(tileDocument) {
    if (!tileDocument?.id) return;
    clearTileRuleStates(tileDocument);
    const primaryGm = getBetterInvPrimaryActiveGm();
    if (!game.user?.isGM || !primaryGm || primaryGm.id !== game.user.id) return;
    const scene = tileDocument.parent ?? canvas?.scene;
    for (const token of Array.from(scene?.tokens?.contents ?? scene?.tokens ?? [])) {
      await scanTokenRules(token, { primeOnly: true, tileId: tileDocument.id });
    }
  }

  async function scanTokenRules(tokenDocument, { primeOnly = false, tileId = null, includeStay = false, sweptFrom = null } = {}) {
    const primaryGm = getBetterInvPrimaryActiveGm();
    if (!game.user?.isGM || !primaryGm || primaryGm.id !== game.user.id) return;
    // Actor-less tokens still have to trigger scene-only actions such as
    // darkness, light, sound or chained floor objects. Actor-dependent actions
    // report their own clear error only when they are actually selected.
    const actor = tokenDocument?.actor ?? tokenDocument?.object?.actor ?? game.actors?.get?.(tokenDocument?.actorId) ?? null;
    const sceneId = tokenDocument?.parent?.id ?? canvas?.scene?.id;
    const tokenId = String(tokenDocument?.id ?? tokenDocument?.document?.id ?? "");
    const scanKey = `${sceneId}:${tokenId}`;
    if (tokenScanInFlight.has(scanKey)) return;
    tokenScanInFlight.add(scanKey);

    try {
      for (const tile of getGroundTiles()) {
        const tileDocument = getTileDocument(tile);
        if (String(tileDocument?.parent?.id ?? "") !== String(sceneId ?? "")) continue;
        if (tileId != null && String(tileDocument?.id ?? "") !== String(tileId)) continue;

        const rules = getRules(tileDocument)
          .filter(entry => entry.enabled && ["enter", "leave", "proximity", "stay"].includes(entry.trigger));
        if (!rules.length) continue;

        const overlaps = tokenOverlapsTile(tokenDocument, tile);
        const sweptOverlap = !primeOnly && !overlaps && sweptFrom
          ? tokenSweptOverlapsTile(tokenDocument, tile, sweptFrom)
          : false;
        for (const rule of rules) {
          const key = `${sceneId}:${tileDocument.id}:${tokenId}:${rule.id}`;
          const radius = Math.max(0, Number(rule.radius) || Number(tileDocument.parent?.grid?.distance) || 5);
          const near = tokenDistanceToTile(tokenDocument, tile) <= radius;
          const current = rule.trigger === "proximity" ? near : overlaps;
          // A token can jump from one side of a small tile to the other between
          // two render frames. Treat a swept intersection as a temporary inside
          // state. The following scan then produces the matching leave event.
          const effectiveCurrent = ["enter", "leave"].includes(rule.trigger)
            ? (current || sweptOverlap)
            : current;
          const storedPrevious = tokenRuleStates.get(key);
          const previous = storedPrevious === undefined ? false : Boolean(storedPrevious);
          tokenRuleStates.set(key, effectiveCurrent);
          if (primeOnly) continue;

          const shouldRun = (rule.trigger === "enter" && !previous && effectiveCurrent)
            || (rule.trigger === "leave" && previous && !effectiveCurrent)
            || (rule.trigger === "proximity" && !previous && current)
            || (rule.trigger === "stay" && includeStay && current);
          if (!shouldRun) continue;

          await runTriggerLocal(tileDocument, rule.trigger, {
            actor,
            token: tokenDocument.object ?? tokenDocument,
            forceLocal: true
          });
        }
      }
    } finally {
      tokenScanInFlight.delete(scanKey);
    }
  }

  function stopTokenMotionScan(tokenDocument) {
    const key = getTokenRuntimeKey(tokenDocument);
    const timer = tokenMotionTimers.get(key);
    if (timer) clearTimeout(timer);
    tokenMotionTimers.delete(key);
  }

  function startTokenMotionScan(tokenDocument) {
    const runtimeKey = getTokenRuntimeKey(tokenDocument);
    stopTokenMotionScan(tokenDocument);

    const startedAt = performance.now();
    let previousCenter = tokenMotionOrigins.get(runtimeKey) ?? getTokenCenter(tokenDocument);
    tokenMotionOrigins.delete(runtimeKey);
    let lastVisualMovementAt = startedAt;

    const tick = async () => {
      const now = performance.now();
      const center = getTokenCenter(tokenDocument);
      await scanTokenRules(tokenDocument, { includeStay: false, sweptFrom: previousCenter });

      const distance = Math.hypot(
        Number(center?.x ?? 0) - Number(previousCenter?.x ?? 0),
        Number(center?.y ?? 0) - Number(previousCenter?.y ?? 0)
      );
      if (distance > 0.25) lastVisualMovementAt = now;
      previousCenter = center;

      const stable = now - lastVisualMovementAt >= 240;
      const timedOut = now - startedAt >= 12000;
      if ((stable && now - startedAt >= 260) || timedOut) {
        tokenMotionTimers.delete(runtimeKey);
        await scanTokenRules(tokenDocument, { includeStay: true });
        return;
      }

      tokenMotionTimers.set(runtimeKey, setTimeout(() => void tick(), 45));
    };

    tokenMotionTimers.set(runtimeKey, setTimeout(() => void tick(), 0));
  }

  function handleTokenPreMovement(tokenDocument, changes = {}) {
    const relevant = ["x", "y", "elevation", "width", "height", "rotation"].some(key => Object.hasOwn(changes ?? {}, key));
    if (!relevant) return;
    tokenMotionOrigins.set(getTokenRuntimeKey(tokenDocument), getTokenCenter(tokenDocument));
  }

  function handleTokenMovement(tokenDocument, changes = {}) {
    const relevant = ["x", "y", "elevation", "width", "height", "rotation"].some(key => Object.hasOwn(changes ?? {}, key));
    if (!relevant && Object.keys(changes ?? {}).length) return;
    const timerKey = getTokenRuntimeKey(tokenDocument);
    clearTimeout(tokenScanTimers.get(timerKey));
    tokenScanTimers.set(timerKey, setTimeout(() => {
      tokenScanTimers.delete(timerKey);
      startTokenMotionScan(tokenDocument);
    }, 10));
  }

  function handleTokenCreate(tokenDocument) {
    const sceneId = tokenDocument?.parent?.id ?? canvas?.scene?.id;
    const tokenId = String(tokenDocument?.id ?? "");
    for (const key of Array.from(tokenRuleStates.keys())) {
      if (key.startsWith(`${sceneId}:`) && key.includes(`:${tokenId}:`)) tokenRuleStates.delete(key);
    }
    void scanTokenRules(tokenDocument, { primeOnly: true });
  }

  function handleTokenDelete(tokenDocument) {
    const sceneId = tokenDocument?.parent?.id ?? canvas?.scene?.id;
    const tokenId = String(tokenDocument?.id ?? "");
    const runtimeKey = getTokenRuntimeKey(tokenDocument);
    clearTimeout(tokenScanTimers.get(runtimeKey));
    tokenScanTimers.delete(runtimeKey);
    stopTokenMotionScan(tokenDocument);
    tokenMotionOrigins.delete(runtimeKey);
    tokenScanInFlight.delete(runtimeKey);
    for (const key of Array.from(tokenRuleStates.keys())) {
      if (key.startsWith(`${sceneId}:`) && key.includes(`:${tokenId}:`)) tokenRuleStates.delete(key);
    }
  }

  function onCanvasReady() {
    installInteraction();
    drawHitAreas();
    tokenRuleStates.clear();
    initializeSocket();
    for (const token of Array.from(canvas?.scene?.tokens?.contents ?? canvas?.scene?.tokens ?? [])) {
      void scanTokenRules(token, { primeOnly: true });
    }
  }

  function onTileChanged(tileOrDocument) {
    drawHitAreas();
    const tileDocument = getTileDocument(tileOrDocument);
    const scene = tileDocument?.parent ?? canvas?.scene ?? null;
    if (!tileDocument?.id || !scene || !game.user?.isGM) return;
    const linkedLights = getLinkedLights(scene, tileDocument.id);
    if (!linkedLights.length) return;
    const tileStillExists = Boolean(scene.tiles?.get?.(tileDocument.id));
    if (!tileStillExists) {
      for (const light of linkedLights) void light.delete({ betterInventoryGroundEffectCleanup: true }).catch(() => {});
      return;
    }
    const visualCenter = getTileVisualCenter(tileDocument);
    const center = {
      x: Math.round(Number(visualCenter.x) || 0),
      y: Math.round(Number(visualCenter.y) || 0)
    };
    for (const light of linkedLights) {
      void light.update(center, { betterInventoryGroundEffectFollow: true }).catch(() => {});
    }
  }

  function onCanvasTearDown() {
    uninstallInteraction();
    debugGraphics?.destroy?.({ children: true });
    debugGraphics = null;
    tokenRuleStates.clear();
    for (const timer of tokenScanTimers.values()) clearTimeout(timer);
    tokenScanTimers.clear();
    for (const timer of tokenMotionTimers.values()) clearTimeout(timer);
    tokenMotionTimers.clear();
    tokenMotionOrigins.clear();
    tokenScanInFlight.clear();
  }

  globalThis[API_NAME] = Object.freeze({
    installInteraction,
    uninstallInteraction,
    findTileAtPoint,
    toggleHitAreas,
    drawHitAreas,
    onCanvasReady,
    onCanvasTearDown,
    onTileChanged,
    openEffectEditor,
    decorateObjectEditor,
    getRules,
    hasTrigger,
    canActivate,
    runTrigger: requestTrigger,
    handleTokenPreMovement,
    handleTokenMovement,
    handleTokenCreate,
    handleTokenDelete
  });

  Hooks.once("ready", () => {
    initializeSocket();
    try {
      if (typeof betterInvRuntimeOperational !== "undefined" && !betterInvRuntimeOperational) return;
    } catch (_error) {}
    if (canvas?.ready) onCanvasReady();
  });
})();
