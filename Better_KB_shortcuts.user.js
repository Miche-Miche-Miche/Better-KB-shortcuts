// ==UserScript==
// @name         Better KB shortcuts
// @namespace    local.servicenow.better-kb-shortcuts
// @version      0.9.6
// @description  Adds copy, edit and Workspace shortcuts and a tidy, aligned header to knowledge portal articles.
// @author       Miche (based on LPS KB Portal view by Lucas Vieites)
// @homepageURL  https://github.com/Miche-Miche-Miche/Better-KB-shortcuts
// @match        https://*.service-now.com/lps*
// @icon         https://images.icon-icons.com/2699/PNG/512/servicenow_logo_icon_168835.png
// @updateURL    https://raw.githubusercontent.com/Miche-Miche-Miche/Better-KB-shortcuts/main/Better_KB_shortcuts.user.js
// @downloadURL  https://raw.githubusercontent.com/Miche-Miche-Miche/Better-KB-shortcuts/main/Better_KB_shortcuts.user.js
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

/*
Better KB shortcuts: a tidier header for knowledge portal (/lps) articles.
Line 1: KB number, Copy link, Edit article, Flag article, Open in Workspace.
Line 2: KB number and title, linked to the article.
Bell next to the heart: subscribe or unsubscribe.
Never saves anything automatically; changes occur only when you click an action.
Based on "LPS KB Portal view" v0.8.4 by Lucas Vieites:
https://gist.github.com/lucasvieites/3e1543562b88b9f51c22fcd13c4ea1f9
Maintainers: keep this note and the changelog up to date.
*/

/** ChangeLog (newest first):
v0.9.6: - Subscribe button replaced by a bell next to the heart, with a short confirmation
v0.9.5: - Shorter description and changelog
v0.9.4: - Hide the Edit article link in the views and rating row
v0.9.3: - Edit article opens the latest version, like the portal's own Edit
v0.9.2: - Actions menu items moved into line 1; Actions menu hidden
v0.9.1: - Responsive header: the heart moves below only when space is short
v0.9.0: - First release of the fork: two-line header, no company references

Original "LPS KB Portal view" changelog (Lucas Vieites):
v0.8.4: - Updated @updateURL and @downloadURL
v0.8.3: - Fix <title> for article with a dash in the title
v0.8.2: - Fix title capture after <title> content was reorganized
v0.8: - Make full link domain agnostic
v0.7: - Added "Edit" button
v0.6: - Added another sub-production instance
v0.5: - Show hidden Actions menu (was previously done in Stylus CSS)
v0.4: - Added @icon in meta block and fixed bug with article titles that contain a dash
v0.3: - Added link in the Actions menu to Workspace (for easier version comparison)
v0.2: - Added ChangeLog
v0.1: - Initial release for the production and sub-production instances
      - Adds Link to the article for easier copy/paste
      - Updates tab title to: KBnumber - Title
*/

(() => {
  'use strict';

  // ---- Configuration ------------------------------------------------------
  const CONFIG = {
    // The portal renders its shell first and the article asynchronously, and
    // can swap articles without a page reload. Page changes are batched and
    // checked after this pause (milliseconds) instead of a fixed start delay.
    CHECK_DEBOUNCE_MS: 150,
    // How long "Copied" stays visible after Copy link (milliseconds).
    COPIED_FEEDBACK_MS: 2000,
    // Hide the portal's own "KB0000000" and "Copy Link" lines, which line 1
    // replaces. Set to false if the portal changes and something important
    // disappears; the new lines still appear.
    HIDE_NATIVE_NUMBER_AND_COPY: true,
    // Make the header row responsive: lines 1 and 2 take all the width the
    // heart and Actions do not need. Set to false to keep the portal's own
    // columns (5/12 for the lines on wide windows).
    RESPONSIVE_HEADER_ROW: true,
    // Keep the heart beside lines 1 and 2 while the lines get at least this
    // width (em, so it scales with the font and zoom); below it, the heart
    // moves under the lines. Line 1 items wrap onto a second row if needed.
    MIN_LINES_WIDTH_EM: 24,
    // Hide the Actions menu button and list; line 1 shows the same actions.
    // Set to false to keep the menu visible as well.
    HIDE_ACTIONS_MENU: true,
    // Show the portal's subscribe button as a bell next to the heart: empty
    // when not subscribed, filled when subscribed. Set to false to keep the
    // portal's own button.
    SUBSCRIBE_AS_BELL: true,
    // How long to wait for the portal to confirm a subscription change
    // before reporting that nothing changed (milliseconds).
    SUBSCRIBE_CONFIRM_MS: 8000,
    // Hide the Edit article link (and its dot) in the views and rating row
    // under the title. Set to false to show it again.
    HIDE_VIEWS_ROW_EDIT: true,
    // Where line 1's Edit article goes:
    // 'portal' - exactly where the Actions menu's Edit Article goes (same
    //            address and tab). Hidden if the portal offers no Edit action.
    // 'script' - kb_knowledge.do built from the page's sys_kb_id (the original
    //            script's edit button); falls back to the portal's Edit action
    //            when the page address has no valid sys_kb_id.
    // The two can open different records: the portal may pick another
    // version of the article than the one in the page address.
    EDIT_ARTICLE_SOURCE: 'portal',
    // Upper limit on tab-title rewrites per article, so the script can never
    // fight the portal indefinitely if both keep setting the title.
    MAX_TITLE_WRITES_PER_ARTICLE: 5,
    // Set to true to log troubleshooting steps (no titles or record IDs).
    DEBUG: false
  };

  const LOG_PREFIX = '## Better KB shortcuts => ';
  const PREFIX = 'bkbs'; // Namespace for injected IDs and classes.
  const thisDomain = window.location.host;

  function debug(message) {
    if (CONFIG.DEBUG) console.log(LOG_PREFIX + message);
  }

  // ---- Pure helpers (no page changes) ---------------------------------------

  // The KB number is read from the portal's "kb-number-info" element, as in
  // the original script, but without assuming a fixed number length. No
  // boundary is required after the digits: the element's text can run
  // straight on into "Copy Link" when the markup has no whitespace between.
  function extractNumber(text) {
    const match = /\bKB\d+/i.exec(String(text || ''));
    return match ? match[0].toUpperCase() : '';
  }

  // Same source as the original script: the sys_kb_id URL parameter.
  // A ServiceNow sys_id is 32 hexadecimal characters; anything else (or a
  // missing parameter) returns '' so no broken edit link is created.
  function getSysId(search) {
    const value = new URLSearchParams(search || '').get('sys_kb_id') || '';
    return /^[0-9a-f]{32}$/i.test(value) ? value : '';
  }

  // Title logic kept from the original: drop the final " - <knowledge base>"
  // part of the portal's tab title. If that does not match the article
  // heading on the page (e.g. the tab title is generic or still belongs to the
  // previous article), the heading text is used instead.
  function chooseTitlePart(documentTitle, headingText) {
    const heading = String(headingText || '').replace(/\s+/g, ' ').trim();
    const titleArray = String(documentTitle || '').split(' - ');
    let parsed = '';
    if (titleArray.length > 1) {
      titleArray.pop();
      parsed = titleArray.join(' - ').trim();
    }
    if (heading && parsed !== heading) return heading;
    return parsed || heading;
  }

  // Prefix the KB number. The original's replacement of the first "&amp;"
  // and the first "&" with "and" is kept unchanged.
  function buildNewTitle(thisNumber, titlePart) {
    if (!titlePart) return '';
    let newTitle = thisNumber + ' - ' + titlePart;
    newTitle = newTitle.replace('&amp;', 'and');
    newTitle = newTitle.replace('&', 'and');
    return newTitle;
  }

  // Latest published article, by number.
  function buildArticleUrl(thisNumber) {
    return 'https://' + thisDomain + '/lps?id=kb_article&sysparm_article=' + thisNumber;
  }

  // Same pattern and variables as the original edit button. %26 is a literal
  // "&" inside sysparm_stack and must stay encoded so the return address keeps
  // its sysparm_article parameter.
  function buildEditUrl(thisSysID, thisNumber) {
    return 'https://' + thisDomain + '/kb_knowledge.do?sys_id=' + thisSysID +
      '&sysparm_stack=/lps?id=kb_article%26sysparm_article=' + thisNumber;
  }

  // Unchanged from the original: open in Workspace on the 4th tab (Versions).
  // The tab index is a portal-specific assumption; verify it if the tab moves.
  function buildWorkspaceUrl(thisSysID) {
    return 'https://' + thisDomain + '/now/sow/kb_view/kb_knowledge/' + thisSysID +
      '/sub/record/kb_knowledge/' + thisSysID + '/params/selected-tab-index/4';
  }

  // ---- Page helpers ---------------------------------------------------------

  function isRendered(element) {
    return !!element && element.getClientRects().length > 0;
  }

  function ensureStyle() {
    if (document.getElementById(PREFIX + '-style')) return;
    const style = document.createElement('style');
    style.id = PREFIX + '-style';
    style.textContent = `
      /* !important: portal rules may set display on these native elements. */
      .${PREFIX}-native-hidden,
      .${PREFIX}-header [hidden] { display: none !important; }
      .${PREFIX}-header { display: block; box-sizing: border-box; min-width: 0; flex: 1 1 auto; }
      .${PREFIX}-line { margin: 0; overflow-wrap: break-word; }
      .${PREFIX}-line + .${PREFIX}-line { margin-top: .25em; }
      .${PREFIX}-line1 { display: flex; flex-wrap: wrap; align-items: baseline; gap: .15em 1.25em; }
      /* An item never breaks between its emoji and its text. */
      .${PREFIX}-item { white-space: nowrap; }
      /* The wrapper of mirrored portal actions adds no box of its own, so its
         items space and wrap like the other line 1 items. */
      .${PREFIX}-extra { display: contents; }
      /* Responsive header row. The portal's grid floats the two header
         columns at fixed widths (col-md-5 / col-md-7) on wide windows;
         !important overrides those width and float rules only. */
      .${PREFIX}-row { display: flex !important; flex-wrap: wrap !important; align-items: flex-start; }
      /* The grid's clearfix pseudo-elements are not needed in a flex row. */
      .${PREFIX}-row::before, .${PREFIX}-row::after { display: none !important; }
      .${PREFIX}-lines-col {
        float: none !important; width: auto !important; max-width: 100%;
        flex: 1 1 ${CONFIG.MIN_LINES_WIDTH_EM}em; min-width: 0;
      }
      .${PREFIX}-actions-col {
        float: none !important; width: auto !important; max-width: 100%;
        flex: 0 0 auto; margin-left: auto; padding-left: .5em !important;
      }
      .${PREFIX}-header a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      /* Subscription bell: sized and coloured like the heart (copied at run
         time); the confirmation floats below it without moving anything. */
      .${PREFIX}-bell-wrap { position: relative; display: inline-block; vertical-align: middle; margin-left: .5rem; }
      /* Defaults close to the heart; the heart's real size and colour are
         copied onto the icon when the heart can be found. */
      .${PREFIX}-bell { background: none; border: 0; padding: 0 .2em; margin: 0; cursor: pointer; color: #006ce4; font-size: 2.2rem; line-height: 1; }
      .${PREFIX}-bell:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .${PREFIX}-toast {
        position: absolute; top: calc(100% + .4em); right: 0; z-index: 1000;
        white-space: nowrap; font-size: 1.3rem; font-weight: 400; line-height: 1.4;
        padding: .2em .6em; border-radius: .4em; background: #333; color: #fff;
        box-shadow: 0 2px 6px rgba(0, 0, 0, .2); pointer-events: none;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Pick the article header that contains the KB number. The portal has
  // desktop and mobile variants; prefer the one actually displayed.
  function findHeading() {
    const headings = [...document.getElementsByClassName('kb-panel-heading')]
      .filter((heading) => heading.querySelector('.kb-number-info'));
    return headings.find(isRendered) || headings[0] || null;
  }

  // The article title heading in the same article panel (not modal headings).
  function findArticleTitle(heading) {
    const scope = heading.closest('.kb-article-wrapper') || heading.closest('.panel') || document;
    const candidates = [...scope.querySelectorAll('h1')]
      .filter((h1) => !h1.classList.contains('modal-title') && !h1.closest('.' + PREFIX + '-header'));
    return candidates.find(isRendered) || null;
  }

  function isCopyLinkControl(element) {
    return /^copy link$/i.test((element.textContent || '').replace(/\s+/g, ' ').trim());
  }

  const INTERACTIVE = 'a, button, [role="button"], [ng-click]';

  // Hide, never remove, the portal's own number and Copy Link controls.
  // The whole number element is hidden only if it contains nothing
  // interactive except Copy Link, so the heart/Actions controls stay visible.
  function hideNativeNumberAndCopy(heading, numberInfo, header) {
    if (!CONFIG.HIDE_NATIVE_NUMBER_AND_COPY) return;
    const controls = [...numberInfo.querySelectorAll(INTERACTIVE)];
    if (controls.every(isCopyLinkControl)) {
      addClass(numberInfo, PREFIX + '-native-hidden');
    } else {
      debug('Number area contains other controls; hiding Copy Link only.');
    }
    for (const control of heading.querySelectorAll(INTERACTIVE)) {
      if (!header.contains(control) && isCopyLinkControl(control)) {
        addClass(control, PREFIX + '-native-hidden');
      }
    }
  }

  // The direct child of `ancestor` that contains `node`, or null.
  function childContaining(ancestor, node) {
    let current = node;
    while (current && current.parentElement !== ancestor) current = current.parentElement;
    return current;
  }

  // Put lines 1-2 and the heart/Actions in one flexible, wrapping row. The
  // row and both columns are found from the DOM (the element holding our
  // header and the one holding the Actions controls), not from guessed grid
  // class names. Without Actions controls (e.g. the mobile view) nothing
  // changes.
  function applyResponsiveRow(heading, header) {
    if (!CONFIG.RESPONSIVE_HEADER_ROW) return;
    const actionsAnchor = heading.querySelector('.kb-end-buttons, #actionMenuLabel');
    if (!actionsAnchor || header.contains(actionsAnchor)) return;
    let row = header.parentElement;
    while (row && row !== heading && !row.contains(actionsAnchor)) row = row.parentElement;
    if (!row || !heading.contains(row)) return;
    const linesCol = childContaining(row, header);
    const actionsCol = childContaining(row, actionsAnchor);
    if (!linesCol || !actionsCol || linesCol === actionsCol) return;
    addClass(row, PREFIX + '-row');
    addClass(linesCol, PREFIX + '-lines-col');
    addClass(actionsCol, PREFIX + '-actions-col');
  }

  // The nearest element containing both a and b.
  function commonAncestor(a, b) {
    for (let node = a; node; node = node.parentElement) {
      if (node.contains(b)) return node;
    }
    return null;
  }

  // The portal's own Actions menu items, classified by their visible label.
  // Items this script (or the original script) adds are ignored.
  function nativeActions() {
    const menu = document.getElementById('kbActionMenuList');
    if (!menu) return [];
    return [...menu.querySelectorAll('li')]
      .filter((li) => !li.id.startsWith(PREFIX))
      .map((li) => {
        const control = li.querySelector('a, button');
        const label = control ? (control.textContent || '').replace(/\s+/g, ' ').trim() : '';
        let kind = 'other';
        if (/subscri/i.test(label)) kind = 'subscribe';
        else if (/^flag\b/i.test(label)) kind = 'flag';
        else if (/^edit\b/i.test(label)) kind = 'edit';
        else if (/workspace/i.test(label)) kind = 'workspace';
        return { control, label, kind };
      })
      .filter((action) => action.control && action.label);
  }

  // Run a portal action exactly as if its menu item had been clicked. The
  // item is looked up at click time because the portal can re-render it.
  function runNativeAction(kind, label) {
    const action = nativeActions().find((candidate) =>
      candidate.kind === kind && (label === undefined || candidate.label === label));
    if (action) action.control.click();
    else console.warn(LOG_PREFIX + 'The portal action is no longer available: ' + kind);
  }

  // Hide (never remove) the Actions button and list. The list items must stay
  // in the page because line 1 runs them. Hide the dropdown wrapper only if it
  // holds nothing else (so the heart is never hidden).
  function hideActionsMenu() {
    const label = document.getElementById('actionMenuLabel');
    const menu = document.getElementById('kbActionMenuList');
    if (!CONFIG.HIDE_ACTIONS_MENU) {
      // Kept from the original (v0.5): show the Actions menu button, which
      // the portal hides by default.
      if (label && label.style.display !== 'inline-block') label.style.display = 'inline-block';
      return;
    }
    if (!label && !menu) return;
    const wrapper = label && menu ? commonAncestor(label, menu) : null;
    const onlyMenu = wrapper && !wrapper.classList.contains(PREFIX + '-actions-col') &&
      [...wrapper.querySelectorAll(INTERACTIVE)].every((control) =>
        control === label || menu.contains(control));
    if (onlyMenu) {
      addClass(wrapper, PREFIX + '-native-hidden');
    } else {
      if (label) addClass(label, PREFIX + '-native-hidden');
      if (menu) addClass(menu, PREFIX + '-native-hidden');
    }
  }

  // ---- Subscription bell ----------------------------------------------------

  // The portal's subscribe button reads "Subscribe" when not subscribed and
  // "Subscribed" (or "Unsubscribe" while hovered) when subscribed. Any other
  // wording returns null, and the portal's own button is then left alone.
  function subscriptionState(text) {
    const label = String(text || '').replace(/\s+/g, ' ').trim();
    if (/^(subscribed|unsubscribe)$/i.test(label)) return true;
    if (/^subscribe$/i.test(label)) return false;
    return null;
  }

  function findSubscribeButton(heading) {
    return heading.querySelector('button.kb-subscribe');
  }

  // The control that changes the subscription: the button by the heart, or
  // the Actions menu item (used on narrow windows, where the button is not
  // shown).
  function subscribeControl() {
    const heading = findHeading();
    const button = heading && findSubscribeButton(heading);
    if (button) return button;
    const item = nativeActions().find((action) => action.kind === 'subscribe');
    return item ? item.control : null;
  }

  // Waiting for the portal to confirm a click: { from, where }.
  const subscription = { pending: null, timer: 0 };

  function requestSubscriptionChange(where) {
    const control = subscribeControl();
    const from = control ? subscriptionState(control.textContent) : null;
    if (from === null) {
      notifySubscription(where, EMOJI.copyFailed, 'Subscription unavailable');
      return;
    }
    subscription.pending = { from, where };
    window.clearTimeout(subscription.timer);
    subscription.timer = window.setTimeout(() => {
      if (!subscription.pending) return;
      const pending = subscription.pending;
      subscription.pending = null;
      notifySubscription(pending.where, EMOJI.copyFailed, 'Subscription not changed');
    }, CONFIG.SUBSCRIBE_CONFIRM_MS);
    control.click(); // The portal's own action does the change.
  }

  // Confirm only what the portal actually shows afterwards.
  function confirmSubscription(state) {
    const pending = subscription.pending;
    if (!pending || state === null || state === pending.from) return;
    subscription.pending = null;
    window.clearTimeout(subscription.timer);
    notifySubscription(pending.where, state ? EMOJI.subscribed : EMOJI.unsubscribed,
      state ? 'Subscribed' : 'Unsubscribed');
  }

  let toastTimer = 0;
  let itemFeedback = false;

  function notifySubscription(where, symbol, text) {
    if (where === 'bell') {
      const toast = document.querySelector('.' + PREFIX + '-toast');
      if (!toast) return;
      window.clearTimeout(toastTimer);
      toast.textContent = symbol + ' ' + text;
      toast.hidden = false;
      toastTimer = window.setTimeout(() => { toast.hidden = true; }, CONFIG.COPIED_FEEDBACK_MS);
      return;
    }
    const item = document.querySelector('.' + PREFIX + '-subscribe');
    if (!item) return;
    itemFeedback = true;
    item.querySelector('.' + PREFIX + '-emoji').textContent = symbol;
    item.querySelector('.' + PREFIX + '-label').textContent = text;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      itemFeedback = false;
      scheduleCheck(); // Restores the item's normal label.
    }, CONFIG.COPIED_FEEDBACK_MS);
  }

  function removeClass(element, name) {
    if (element.classList.contains(name)) element.classList.remove(name);
  }

  function buildBell() {
    const wrap = document.createElement('span');
    wrap.className = PREFIX + '-bell-wrap';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = PREFIX + '-bell';
    const icon = document.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    const toast = document.createElement('span');
    toast.className = PREFIX + '-toast';
    toast.setAttribute('role', 'status');
    toast.hidden = true;
    wrap.append(button, toast);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      requestSubscriptionChange('bell');
    });
    return wrap;
  }

  // The favourite heart next to the subscribe button (its exact markup can
  // vary, so a few likely forms are recognised).
  function findHeart(heading) {
    const candidate = heading.querySelector(
      '[class*="heart"], [class*="favorite"], [class*="favourite"], ' +
      '[aria-label*="avorit"], [aria-label*="avourit"], [title*="avorit"], [title*="avourit"]');
    if (!candidate || candidate.closest('.' + PREFIX + '-bell-wrap')) return null;
    // Prefer the drawn icon inside a button, which carries the real size.
    return candidate.querySelector('i, svg, [class*="heart"]') || candidate;
  }

  // Copy the heart's on-screen size and colour so the bell matches it.
  function matchHeart(heading, icon) {
    const heart = findHeart(heading);
    if (!heart) return;
    const color = getComputedStyle(heart).getPropertyValue('color');
    if (color && icon.style.getPropertyValue('color') !== color) icon.style.setProperty('color', color);
    const height = heart.getBoundingClientRect().height;
    if (height > 8) {
      const size = Math.round(height) + 'px';
      if (icon.style.getPropertyValue('font-size') !== size) icon.style.setProperty('font-size', size);
    }
  }

  // Replace (visually) the portal's subscribe button with a bell. The
  // portal's button stays in the page, hidden, and still does the work.
  // Returns the current state and whether the bell is on screen.
  function ensureBell(heading) {
    const nativeButton = findSubscribeButton(heading);
    const state = nativeButton ? subscriptionState(nativeButton.textContent) : null;
    let wrap = heading.querySelector('.' + PREFIX + '-bell-wrap');
    if (!CONFIG.SUBSCRIBE_AS_BELL || !nativeButton || state === null) {
      if (wrap) wrap.remove();
      if (nativeButton) removeClass(nativeButton, PREFIX + '-native-hidden');
      return { state, shown: false, nativeShown: isRendered(nativeButton) };
    }
    if (!wrap) wrap = buildBell();
    // Sit exactly where the portal's button is, so the bell follows its
    // layout (including being hidden on narrow windows, like the button).
    if (nativeButton.nextSibling !== wrap) {
      nativeButton.parentNode.insertBefore(wrap, nativeButton.nextSibling);
    }
    addClass(nativeButton, PREFIX + '-native-hidden');

    const button = wrap.querySelector('.' + PREFIX + '-bell');
    const icon = button.querySelector('i');
    setAttributeIfChanged(icon, 'class', state ? 'fa fa-bell' : 'fa fa-bell-o');
    const label = state ? 'Unsubscribe from this article' : 'Subscribe to this article';
    setAttributeIfChanged(button, 'aria-label', label);
    setAttributeIfChanged(button, 'title', label);
    setAttributeIfChanged(button, 'aria-pressed', String(state));
    matchHeart(heading, icon);
    return { state, shown: isRendered(wrap), nativeShown: false };
  }

  // ---- Views and rating row under the title --------------------------------

  // A separator is text made only of a dot, middle dot or bar (and spaces).
  const SEPARATOR_TEXT = /^[\s\u2022\u00B7|]*[\u2022\u00B7|][\s\u2022\u00B7|]*$/;

  function normalisedText(node) {
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isSeparator(node) {
    if (!node) return false;
    if (node.nodeType === 3) return SEPARATOR_TEXT.test(node.data);
    return node.nodeType === 1 && !node.querySelector(INTERACTIVE) &&
      SEPARATOR_TEXT.test(node.textContent || '');
  }

  // The nearest sibling that matters, skipping blank text and comments
  // (the portal's framework leaves comment nodes around conditional parts).
  function meaningfulSibling(node, step) {
    let sibling = step < 0 ? node.previousSibling : node.nextSibling;
    while (sibling && (sibling.nodeType === 8 ||
        (sibling.nodeType === 3 && !sibling.data.trim()))) {
      sibling = step < 0 ? sibling.previousSibling : sibling.nextSibling;
    }
    return sibling;
  }

  // An element with no text and nothing clickable, e.g. a pencil icon.
  function isIconOnly(node) {
    return !!node && node.nodeType === 1 && !normalisedText(node) &&
      !node.querySelector(INTERACTIVE) && !node.matches(INTERACTIVE);
  }

  // Hide a node without removing it. A bare text dot cannot be hidden with
  // a class, so it is moved into a hidden wrapper of its own (once).
  function hideNode(node) {
    if (node.nodeType === 1) {
      addClass(node, PREFIX + '-native-hidden');
      return;
    }
    const parent = node.parentNode;
    if (!parent || (parent.classList && parent.classList.contains(PREFIX + '-separator'))) return;
    const wrapper = document.createElement('span');
    wrapper.className = PREFIX + '-separator ' + PREFIX + '-native-hidden';
    parent.insertBefore(wrapper, node);
    wrapper.appendChild(node);
  }

  // The largest element around the link that holds only that link (with
  // its icon), so views, stars and dots are never inside what is hidden.
  function editUnit(link) {
    const linkText = normalisedText(link);
    let unit = link;
    while (unit.parentElement) {
      const parent = unit.parentElement;
      const onlyThisLink = [...parent.querySelectorAll(INTERACTIVE)]
        .every((control) => control === link || link.contains(control));
      if (!onlyThisLink || normalisedText(parent) !== linkText) break;
      unit = parent;
    }
    return unit;
  }

  function hideViewsRowEdit(heading, header) {
    if (!CONFIG.HIDE_VIEWS_ROW_EDIT) return;
    const scope = heading.closest('.kb-article-wrapper') || heading.closest('.panel');
    if (!scope) return;
    const menu = document.getElementById('kbActionMenuList');
    const links = [...scope.querySelectorAll('a')].filter((link) =>
      /^edit article$/i.test(normalisedText(link)) &&
      !header.contains(link) && !(menu && menu.contains(link)));
    for (const link of links) {
      const unit = editUnit(link);
      hideNode(unit);
      // A separate icon just before the link (outside it) goes too.
      let before = meaningfulSibling(unit, -1);
      if (isIconOnly(before)) {
        hideNode(before);
        before = meaningfulSibling(before, -1);
      }
      // Hide one dot: the one before the link, else the one after it. List
      // bullets drawn by the page's styles disappear with their list item.
      if (isSeparator(before)) hideNode(before);
      else {
        const after = meaningfulSibling(unit, 1);
        if (isSeparator(after)) hideNode(after);
      }
    }
  }

  // Use the font of the header block itself: the original script's full-link
  // line was a direct child of this block, so this reproduces its font.
  function applyHeadingFont(heading, header) {
    const computed = getComputedStyle(heading);
    for (const property of ['font-family', 'font-size', 'font-weight', 'line-height']) {
      const value = computed.getPropertyValue(property);
      if (value && header.style.getPropertyValue(property) !== value) {
        header.style.setProperty(property, value);
      }
    }
  }

  // Start both lines exactly where the article title's text starts, whatever
  // padding the portal adds to the header (e.g. its 1.6rem title padding).
  function alignWithTitle(heading, header) {
    const title = findArticleTitle(heading);
    if (!title || !isRendered(header)) return;
    const titleStyle = getComputedStyle(title);
    const target = title.getBoundingClientRect().left +
      (parseFloat(titleStyle.paddingLeft) || 0) + (parseFloat(titleStyle.borderLeftWidth) || 0);
    const current = parseFloat(header.style.marginLeft) || 0;
    const difference = target - header.getBoundingClientRect().left;
    // Only write when it matters, so layout changes cannot loop endlessly.
    if (Math.abs(difference) > 0.5) {
      header.style.marginLeft = Math.round((current + difference) * 100) / 100 + 'px';
    }
  }

  // Write only real changes, so a pass with nothing new is completely idle.
  function addClass(element, name) {
    if (!element.classList.contains(name)) element.classList.add(name);
  }

  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  // One line 1 item: exactly one emoji, one space, then the text. The emoji
  // is hidden from screen readers so the item is announced by its text.
  function makeItem(tag, className, symbol, text) {
    const item = document.createElement(tag);
    item.className = PREFIX + '-item ' + PREFIX + '-' + className;
    const emoji = document.createElement('span');
    emoji.className = PREFIX + '-emoji';
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = symbol;
    const label = document.createElement('span');
    label.className = PREFIX + '-label';
    label.textContent = text;
    item.append(emoji, document.createTextNode(' '), label);
    return { item, emoji, label };
  }

  // Make an anchor behave as a button for a portal action: focusable, Enter
  // and Space activate it, and it never navigates by itself.
  function makeActionButton(anchor, run) {
    anchor.setAttribute('href', '#');
    anchor.setAttribute('role', 'button');
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      run();
    });
    anchor.addEventListener('keydown', (event) => {
      if (event.key === ' ') {
        event.preventDefault();
        run();
      }
    });
  }

  const EMOJI = {
    number: '\u{1F516}',     // Bookmark
    copy: '\u{1F4CB}',       // Clipboard
    copied: '\u2705',        // Check mark
    copyFailed: '\u26A0\uFE0F', // Warning
    edit: '\u270F\uFE0F',     // Pencil
    flag: '\u{1F6A9}',       // Triangular flag
    workspace: '\u{1F5C2}\uFE0F', // Card index dividers
    subscribed: '\u{1F514}', // Bell
    unsubscribed: '\u{1F515}', // Bell with slash
    other: '\u2699\uFE0F'     // Gear, for portal actions without a known emoji
  };

  // GM_setClipboard needs no page focus or clipboard permission; the standard
  // Clipboard API is a fallback if the grant is unavailable.
  function copyText(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
        return Promise.resolve();
      }
    } catch (error) {
      return Promise.reject(error);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('No clipboard API available'));
  }

  // ---- Header build/update (idempotent) -------------------------------------

  function buildHeader() {
    const header = document.createElement('div');
    header.id = PREFIX + '-header';
    header.className = PREFIX + '-header';

    const line1 = document.createElement('div');
    line1.className = PREFIX + '-line ' + PREFIX + '-line1';

    const number = makeItem('span', 'number', EMOJI.number, '');

    const copy = makeItem('a', 'copy', EMOJI.copy, 'Copy link');
    copy.item.setAttribute('title', 'Copy the article link');
    copy.label.setAttribute('aria-live', 'polite');

    const edit = makeItem('a', 'edit', EMOJI.edit, 'Edit article');
    edit.item.setAttribute('title', 'Edit this article');
    edit.item.addEventListener('click', (event) => {
      // Portal mode: run the portal's own Edit action instead of navigating.
      if (edit.item.dataset.mode === 'portal') {
        event.preventDefault();
        runNativeAction('edit');
      }
    });

    const flag = makeItem('a', 'flag', EMOJI.flag, 'Flag article');
    flag.item.setAttribute('title', 'Flag this article');
    makeActionButton(flag.item, () => runNativeAction('flag'));

    // Shown only when the bell is not on screen (narrow windows).
    const subscribe = makeItem('a', 'subscribe', EMOJI.subscribed, 'Subscribe');
    makeActionButton(subscribe.item, () => requestSubscriptionChange('item'));

    // Any other portal actions are mirrored here, in their menu order.
    const extra = document.createElement('span');
    extra.className = PREFIX + '-extra';

    const workspace = makeItem('a', 'workspace', EMOJI.workspace, 'Open in Workspace');
    workspace.item.target = '_new'; // Kept from the original Workspace link.
    workspace.item.setAttribute('title', 'Open this article in Workspace');

    line1.append(number.item, copy.item, edit.item, flag.item, subscribe.item, extra, workspace.item);

    const line2 = document.createElement('div');
    line2.className = PREFIX + '-line ' + PREFIX + '-line2';
    const articleLink = document.createElement('a');
    articleLink.id = PREFIX + '-article-link';
    articleLink.target = '_new'; // Kept from the original full link.
    articleLink.setAttribute('title', 'Open the latest published version of this article');
    line2.append(articleLink);

    header.append(line1, line2);

    let feedbackTimer = 0;
    copy.item.addEventListener('click', (event) => {
      // The href stays a real address (right-click > Copy link address also
      // works); a normal click copies it instead of navigating.
      event.preventDefault();
      const url = copy.item.getAttribute('href');
      if (!url) return;
      copyText(url).then(
        () => showFeedback(EMOJI.copied, 'Copied'),
        (error) => {
          console.warn(LOG_PREFIX + 'Copy link failed: ' + (error && error.name ? error.name : 'unknown error'));
          showFeedback(EMOJI.copyFailed, 'Copy failed');
        }
      );
    });

    function showFeedback(symbol, text) {
      window.clearTimeout(feedbackTimer);
      copy.emoji.textContent = symbol;
      copy.label.textContent = text;
      feedbackTimer = window.setTimeout(() => {
        copy.emoji.textContent = EMOJI.copy;
        copy.label.textContent = 'Copy link';
      }, CONFIG.COPIED_FEEDBACK_MS);
    }

    return {
      header, numberText: number.label, copy: copy.item, edit: edit.item,
      flag: flag.item, subscribe: subscribe.item, extra, extraSignature: null,
      workspace: workspace.item, articleLink
    };
  }

  const headerParts = new WeakMap(); // header element -> its parts

  function setHidden(element, hidden) {
    if (element.hidden !== hidden) element.hidden = hidden;
  }

  // How the portal's own Edit action works: a real http(s) link (copied as
  // is, in the tab it uses) or, failing that, a click on the portal item.
  function portalEdit(nativeEdit) {
    if (!nativeEdit) return null;
    const control = nativeEdit.control;
    const raw = control.tagName === 'A' ? (control.getAttribute('href') || '') : '';
    let url = null;
    try {
      url = raw && raw !== '#' ? new URL(raw, window.location.href) : null;
    } catch (_) {
      url = null;
    }
    if (url && /^https?:$/.test(url.protocol)) {
      return { mode: 'link', href: url.href, target: control.getAttribute('target') || '' };
    }
    return { mode: 'portal' };
  }

  function chooseEdit(actions, thisSysID, thisNumber) {
    const nativeEdit = actions.find((action) => action.kind === 'edit');
    if (CONFIG.EDIT_ARTICLE_SOURCE !== 'script') return portalEdit(nativeEdit);
    if (thisSysID) {
      return { mode: 'script', href: buildEditUrl(thisSysID, thisNumber), target: '_blank' };
    }
    return portalEdit(nativeEdit);
  }

  function applyEdit(edit, choice) {
    if (!choice) {
      if (edit.hasAttribute('href')) edit.removeAttribute('href');
      setHidden(edit, true);
      return;
    }
    if (edit.dataset.mode !== choice.mode) edit.dataset.mode = choice.mode;
    if (choice.mode === 'portal') {
      setAttributeIfChanged(edit, 'href', '#');
      setAttributeIfChanged(edit, 'role', 'button');
      if (edit.hasAttribute('target')) edit.removeAttribute('target');
      if (edit.hasAttribute('rel')) edit.removeAttribute('rel');
    } else {
      setAttributeIfChanged(edit, 'href', choice.href);
      if (edit.hasAttribute('role')) edit.removeAttribute('role');
      if (choice.target) {
        setAttributeIfChanged(edit, 'target', choice.target);
        setAttributeIfChanged(edit, 'rel', 'noopener');
      } else {
        if (edit.hasAttribute('target')) edit.removeAttribute('target');
        if (edit.hasAttribute('rel')) edit.removeAttribute('rel');
      }
    }
    setHidden(edit, false);
  }

  function updateHeader(parts, thisNumber, thisSysID, newTitle, bell) {
    setText(parts.numberText, thisNumber);
    setAttributeIfChanged(parts.copy, 'href', buildArticleUrl(thisNumber));
    setAttributeIfChanged(parts.articleLink, 'href', buildArticleUrl(thisNumber));
    setText(parts.articleLink, newTitle || thisNumber);

    const actions = nativeActions();
    const hasNative = (kind) => actions.some((action) => action.kind === kind);

    applyEdit(parts.edit, chooseEdit(actions, thisSysID, thisNumber));

    // Flag article only exists if the portal offers it.
    setHidden(parts.flag, !hasNative('flag'));

    // Subscribe in line 1 only when neither the bell nor the portal's own
    // button is on screen, e.g. on narrow windows.
    const menuSubscribe = actions.find((action) => action.kind === 'subscribe');
    const menuState = menuSubscribe ? subscriptionState(menuSubscribe.label) : null;
    const showItem = !bell.shown && !bell.nativeShown && menuState !== null;
    setHidden(parts.subscribe, !showItem);
    if (showItem && !itemFeedback) {
      setText(parts.subscribe.querySelector('.' + PREFIX + '-emoji'),
        menuState ? EMOJI.unsubscribed : EMOJI.subscribed);
      setText(parts.subscribe.querySelector('.' + PREFIX + '-label'),
        menuState ? 'Unsubscribe' : 'Subscribe');
    }

    // Other portal actions: rebuild only when the set of labels changes.
    const others = actions.filter((action) => action.kind === 'other');
    const signature = others.map((action) => action.label).join('\n');
    if (signature !== parts.extraSignature) {
      parts.extraSignature = signature;
      const items = others.map((action) => {
        const mirrored = makeItem('a', 'other', EMOJI.other, action.label);
        makeActionButton(mirrored.item, () => runNativeAction('other', action.label));
        return mirrored.item;
      });
      parts.extra.replaceChildren(...items);
    }

    // Open in Workspace needs the record ID.
    if (thisSysID) setAttributeIfChanged(parts.workspace, 'href', buildWorkspaceUrl(thisSysID));
    else if (parts.workspace.hasAttribute('href')) parts.workspace.removeAttribute('href');
    setHidden(parts.workspace, !thisSysID);
  }

  const titleState = { number: '', title: '', writes: 0 };

  function updateTabTitle(thisNumber, newTitle) {
    if (!newTitle) return;
    if (titleState.number !== thisNumber) {
      titleState.number = thisNumber;
      titleState.writes = 0;
    }
    if (document.title === newTitle || titleState.writes >= CONFIG.MAX_TITLE_WRITES_PER_ARTICLE) return;
    document.title = newTitle;
    titleState.title = newTitle;
    titleState.writes += 1;
  }

  // ---- Main pass ------------------------------------------------------------

  function ensureEnhanced() {
    const heading = findHeading();
    if (!heading) return; // Not an article page, or not rendered yet.
    const numberInfo = heading.querySelector('.kb-number-info');
    const thisNumber = extractNumber(numberInfo && numberInfo.textContent);
    if (!thisNumber) {
      debug('Header found but no KB number yet.');
      return;
    }
    const thisSysID = getSysId(window.location.search);
    if (!thisSysID) debug('No valid sys_kb_id in the address; Open in Workspace hidden.');

    // Never re-parse a tab title this script wrote: it no longer ends in the
    // knowledge base name.
    const ownTitle = !!titleState.title && document.title === titleState.title;
    const titleHeading = findArticleTitle(heading);
    const headingText = titleHeading ? titleHeading.textContent : '';
    const titlePart = chooseTitlePart(ownTitle ? '' : document.title, headingText);
    let newTitle = buildNewTitle(thisNumber, titlePart);
    if (!newTitle && ownTitle && titleState.number === thisNumber) newTitle = titleState.title;

    ensureStyle();

    let header = heading.querySelector('.' + PREFIX + '-header');
    if (!header) {
      const parts = buildHeader();
      header = parts.header;
      headerParts.set(header, parts);
      // Take the place of the portal's number line, so the heart keeps its
      // position on the same row.
      numberInfo.parentNode.insertBefore(header, numberInfo);
      if (!heading.id) heading.id = 'custom-view'; // Kept from the original.
      debug('Header added.');
    }
    const parts = headerParts.get(header);
    if (!parts) return; // Header from another copy of this script; leave it.

    const bell = ensureBell(heading);
    updateHeader(parts, thisNumber, thisSysID, newTitle, bell);
    const menuSubscribe = nativeActions().find((action) => action.kind === 'subscribe');
    confirmSubscription(bell.state !== null ? bell.state :
      (menuSubscribe ? subscriptionState(menuSubscribe.label) : null));
    hideNativeNumberAndCopy(heading, numberInfo, header);
    applyResponsiveRow(heading, header);
    hideActionsMenu();
    hideViewsRowEdit(heading, header);
    applyHeadingFont(heading, header);
    alignWithTitle(heading, header);
    updateTabTitle(thisNumber, newTitle);
  }

  let pending = 0;
  function scheduleCheck() {
    if (pending) return;
    pending = window.setTimeout(() => {
      pending = 0;
      try {
        ensureEnhanced();
      } catch (error) {
        console.warn(LOG_PREFIX + 'Header update failed: ' + (error && error.message ? error.message : error));
      }
    }, CONFIG.CHECK_DEBOUNCE_MS);
  }

  // Watch for the article loading or changing; each pass writes only what
  // differs, so its own changes cause at most one extra, empty pass.
  new MutationObserver(scheduleCheck).observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true
  });
  window.addEventListener('resize', scheduleCheck);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleCheck);
  scheduleCheck();
})();
