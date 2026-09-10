/* Axon’s Inventory - Foundry VTT v14 compatibility fixes */
// SPDX-License-Identifier: LicenseRef-Axons-Inventory-1.0

(() => {
  const PATCH_FLAG = "__betterInvV14Compat161";
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  /**
   * Foundry v14 can briefly expose ApplicationV1/Dialog elements as an empty
   * jQuery-like wrapper while render is still settling. The original helper
   * treated that wrapper itself as a DOM element, which caused
   * `element.classList.add` to throw. Resolve only real DOM elements and fall
   * back to the most recently rendered Foundry dialog.
   */
  globalThis.decorateBetterInvDialog = function decorateBetterInvDialogV14(
    dialog,
    { classes = [], avoidOverlap = false, focusSelector = null, selectInput = false } = {}
  ) {
    try {
      globalThis.bringFoundryDialogsToFront?.({ avoidOverlap });
    } catch (_error) {}

    const rawElement = dialog?.element;
    const rawPrivateElement = dialog?._element;
    const candidates = [
      rawElement?.[0],
      rawElement?.get?.(0),
      rawElement,
      rawPrivateElement?.[0],
      rawPrivateElement?.get?.(0),
      rawPrivateElement
    ];

    let element = candidates.find(candidate =>
      candidate
      && typeof candidate.querySelector === "function"
      && candidate.classList
      && typeof candidate.classList.add === "function"
    ) ?? null;

    if (!element) {
      const fallback = Array.from(document.querySelectorAll(
        '.dialog.app.window-app, .application.dialog, .application[data-appid]'
      )).at(-1);
      if (fallback?.classList?.add) element = fallback;
    }

    if (!element) return null;

    element.classList.add("betterinv-dialog-theme", ...Array.from(classes ?? []).filter(Boolean));
    if (element.style) element.style.zIndex = "26000";

    if (focusSelector) {
      const input = element.querySelector(focusSelector);
      if (input) {
        ["keydown", "keyup", "keypress", "beforeinput", "input", "paste"].forEach(type => {
          input.addEventListener?.(type, event => event.stopPropagation(), { capture: true });
        });
        try { input.focus?.({ preventScroll: true }); } catch (_error) { input.focus?.(); }
        if (selectInput) input.select?.();
      }
    }
    return element;
  };

  console.log("Axon’s Inventory | Foundry-v14-Kompatibilitätsfix aktiv.");
})();
