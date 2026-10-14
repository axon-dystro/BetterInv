/* Axon's Inventory: non-invasive trade action on another visible token. */
(() => {
  let menu = null;
  function closeMenu() { menu?.remove(); menu = null; }
  function sourceActor() {
    const actorId = globalThis.getBetterInvInventoryActorId?.();
    return game.user?.character ?? game.actors?.get?.(actorId)
      ?? canvas?.tokens?.controlled?.[0]?.actor ?? null;
  }
  function canTradeWith(token) {
    const source = sourceActor();
    const doc = token?.document ?? token;
    if (!source || !doc || doc.actorId === source.id || doc.hidden) return false;
    if (typeof globalThis.isBetterInvValidTokenTransferTarget !== "function") return false;
    return Boolean(globalThis.isBetterInvValidTokenTransferTarget(token,source.id));
  }
  async function tradeWith(token) {
    closeMenu();
    try { await globalThis.openBetterInvTradeWithToken?.(token); }
    catch (error) { ui.notifications.error(error.message || "Handel konnte nicht geöffnet werden."); }
  }
  function showMenu(token,event) {
    closeMenu();
    const origin = event?.nativeEvent ?? event?.originalEvent ?? event;
    const native = origin?.data?.originalEvent ?? origin?.nativeEvent ?? origin;
    let x = Number(native?.clientX), y = Number(native?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const bounds = canvas?.app?.view?.getBoundingClientRect?.();
      x = (bounds?.left ?? 0) + (Number(event?.data?.global?.x) || 80);
      y = (bounds?.top ?? 0) + (Number(event?.data?.global?.y) || 90);
    }
    menu = document.createElement("div");
    menu.className = "betterinv-token-trade-menu";
    menu.setAttribute("role","menu");
    menu.innerHTML = '<button type="button" role="menuitem"><i class="fas fa-handshake" aria-hidden="true"></i> Mit Wesen handeln <small>≤ 5 ft</small></button>';
    document.body.appendChild(menu);
    menu.style.left = Math.max(8, Math.min(window.innerWidth - 230,x + 12)) + "px";
    menu.style.top = Math.max(8, Math.min(window.innerHeight - 54,y + 8)) + "px";
    menu.querySelector("button").addEventListener("click",e => {e.preventDefault();void tradeWith(token);});
    const dismiss = e => {if (menu && !menu.contains(e.target)) closeMenu();};
    setTimeout(() => document.addEventListener("pointerdown",dismiss,{once:true,capture:true}),0);
  }
  Hooks.on("rightClickToken",(token,event) => {
    if (!canTradeWith(token)) return;
    showMenu(token,event);
  });
  Hooks.on("renderTokenHUD",(hud,html) => {
    const token = hud?.object ?? canvas?.tokens?.hud?.object;
    if (!canTradeWith(token)) return;
    const root = html?.[0] ?? html ?? hud?.element?.[0] ?? hud?.element;
    const col = root?.querySelector?.(".col.right, .col-right, [data-column='right']");
    if (!col || col.querySelector(".betterinv-token-hud-trade")) return;
    const button = document.createElement("div");
    button.className = "control-icon betterinv-token-hud-trade";
    button.title = "Mit diesem Wesen handeln (≤ 5 ft)";
    button.setAttribute("role","button");
    button.tabIndex = 0;
    button.innerHTML = '<i class="fas fa-handshake" aria-hidden="true"></i>';
    button.addEventListener("click",e => { e.preventDefault();e.stopPropagation();void tradeWith(token); });
    button.addEventListener("keydown",e => {if(e.key==="Enter"||e.key===" "){e.preventDefault();void tradeWith(token);}});
    col.prepend(button);
  });
  Hooks.on("canvasReady",closeMenu);
})();
