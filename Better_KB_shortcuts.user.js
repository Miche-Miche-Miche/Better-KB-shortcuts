// ==UserScript==
// @name         Better KB shortcuts
// @namespace    local.servicenow.better-kb-shortcuts
// @version      0.9.11
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
Line 1: Copy link, Edit article, Flag article, Open in Workspace as grey
circles with blue line icons (Booking's icon style); hover for each name.
Line 2: KB number and title, linked to the article.
On the right, the heart and a bell (subscribe or unsubscribe), the same
size as the line 1 icons and lined up with them.
Never saves anything by itself: changes happen only when you click an action.
Based on "LPS KB Portal view" v0.8.4 by Lucas Vieites:
https://gist.github.com/lucasvieites/3e1543562b88b9f51c22fcd13c4ea1f9
Maintainers: keep this note and the changelog up to date.
*/

/** ChangeLog (newest first):
v0.9.11: - Heart and bell circles on every article, also without a subscribe button by the heart
v0.9.10: - Heart and bell match the size and alignment of the line 1 icons
v0.9.9: - Bell drawn exactly the size of the heart; neither icon is shrunk
v0.9.8: - Brand circles: line 1 actions, heart and bell as grey circles with blue icons
v0.9.7: - Line icons instead of emojis; standalone KB number removed; bell lined up with the heart
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
    // Colour of the line icons in line 1: Booking's Action Blue, which the
    // brand reserves for links and buttons. Set to 'currentColor' to use the
    // text colour instead.
    ICON_COLOR: '#006ce4',
    // How line 1 actions look:
    // 'circles' - icon-only grey circles with blue icons (Booking's icon
    //             style on white backgrounds); each name shows on hover or
    //             keyboard focus. The heart and bell icons become circles
    //             of the same size, centred on line 1's circles.
    // 'links'   - icon followed by the name, as in v0.9.7.
    ACTION_STYLE: 'circles',
    // Circle size (pixels), its grey and its hover colour.
    CIRCLE_SIZE_PX: 34,
    CIRCLE_COLOR: '#f2f3f5',
    CIRCLE_HOVER_COLOR: '#e6f0fc',
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
      /* An item never breaks between its icon and its text. */
      .${PREFIX}-item { white-space: nowrap; }
      /* Line icons drawn with SVG: sized to the text, aligned with it. */
      .${PREFIX}-icon {
        display: inline-block; width: 1.05em; height: 1.05em; margin-right: .35em;
        vertical-align: -.15em; color: ${CONFIG.ICON_COLOR};
        fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round;
      }
      .${PREFIX}-toast .${PREFIX}-icon { color: currentColor; margin-right: .3em; }
      /* Brand circles (ACTION_STYLE 'circles'). Each action is a grey circle
         with a blue icon; its name becomes a tooltip below it, still read by
         screen readers as the link's name. */
      .${PREFIX}-circles .${PREFIX}-line1 { align-items: center; gap: 8px; }
      .${PREFIX}-circles .${PREFIX}-item {
        position: relative; display: inline-flex; align-items: center; justify-content: center;
        width: ${CONFIG.CIRCLE_SIZE_PX}px; height: ${CONFIG.CIRCLE_SIZE_PX}px; border-radius: 50%;
        background: ${CONFIG.CIRCLE_COLOR}; text-decoration: none;
      }
      .${PREFIX}-circles .${PREFIX}-item:hover, .${PREFIX}-circles .${PREFIX}-item:focus-visible {
        background: ${CONFIG.CIRCLE_HOVER_COLOR}; text-decoration: none;
      }
      .${PREFIX}-circles .${PREFIX}-item .${PREFIX}-icon { width: 17px; height: 17px; margin: 0; vertical-align: 0; }
      .${PREFIX}-circles .${PREFIX}-label {
        position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 1000;
        white-space: nowrap; padding: 3px 8px; border-radius: 5px; font-size: 12px; font-weight: 400;
        line-height: 1.4; background: #1a1a1a; color: #fff; opacity: 0; pointer-events: none;
        transition: opacity .12s;
      }
      .${PREFIX}-circles .${PREFIX}-item:hover .${PREFIX}-label,
      .${PREFIX}-circles .${PREFIX}-item:focus-visible .${PREFIX}-label,
      .${PREFIX}-circles .${PREFIX}-flash .${PREFIX}-label { opacity: 1; }
      /* Heart and bell side by side on the right. Each icon element (the
         portal's heart and the script's bell) is itself drawn as a circle the
         same size as line 1's circles, with its glyph at line 1's icon size.
         The heart is restyled, never moved or replaced, so favouriting still
         works. alignFavWithLine1() sets "top" so the circles share line 1's
         centre line. !important: the portal's icon font rules set their own
         size, line height and spacing. */
      .${PREFIX}-fav-row { display: inline-flex; align-items: center; gap: 8px; }
      .${PREFIX}-fav-icon {
        position: relative; display: inline-flex !important; align-items: center; justify-content: center;
        box-sizing: border-box !important;
        width: ${CONFIG.CIRCLE_SIZE_PX}px !important; height: ${CONFIG.CIRCLE_SIZE_PX}px !important;
        margin: 0 !important; padding: 0 !important; border-radius: 50%;
        font-size: 17px !important; line-height: 1 !important; vertical-align: middle;
        background: ${CONFIG.CIRCLE_COLOR}; cursor: pointer;
      }
      .${PREFIX}-fav-icon:hover, :focus-visible > .${PREFIX}-fav-icon { background: ${CONFIG.CIRCLE_HOVER_COLOR}; }
      /* An SVG or image heart inside its circle: line 1's icon size. */
      .${PREFIX}-fav-icon > svg, .${PREFIX}-fav-icon > img {
        width: 17px !important; height: 17px !important; margin: 0 !important;
      }
      .${PREFIX}-bell[aria-disabled="true"] { cursor: default; opacity: .55; }
      .${PREFIX}-bell.${PREFIX}-bell-flat { display: inline-flex; padding: 0; line-height: 0; }
      .${PREFIX}-fav-row .${PREFIX}-bell-wrap { display: inline-flex; margin-left: 0; }
      @media (prefers-reduced-motion: reduce) { .${PREFIX}-circles .${PREFIX}-label { transition: none; } }
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
      /* alignFavWithLine1() sets "top" so the bell's centre matches line 1's
         circles (or the heart's), whatever markup and line height each has. */
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
    // "Subscribed ..." starts with "Subscribe", so it is tested first.
    const label = String(text || '').replace(/\s+/g, ' ').trim();
    if (/^(subscribed|unsubscribe)\b/i.test(label)) return true;
    if (/^subscribe\b/i.test(label)) return false;
    return null;
  }

  // Articles differ: some have the portal's button.kb-subscribe by the
  // heart, others another control or none at all. Only the article header is
  // searched (never the Actions menu, line 1 or the bell), so a subscribe
  // link elsewhere on the page (e.g. for a whole knowledge base) is ignored.
  function findSubscribeButton(heading) {
    const classic = heading.querySelector('button.kb-subscribe');
    if (classic) return classic;
    const menu = document.getElementById('kbActionMenuList');
    return [...heading.querySelectorAll('button, a, [role="button"]')].find((control) =>
      !control.closest('.' + PREFIX + '-header, .' + PREFIX + '-bell-wrap') &&
      !(menu && menu.contains(control)) &&
      subscriptionState(control.textContent) !== null) || null;
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
      notifySubscription(where, 'copyFailed', 'Subscription unavailable');
      return;
    }
    subscription.pending = { from, where };
    window.clearTimeout(subscription.timer);
    subscription.timer = window.setTimeout(() => {
      if (!subscription.pending) return;
      const pending = subscription.pending;
      subscription.pending = null;
      notifySubscription(pending.where, 'copyFailed', 'Subscription not changed');
    }, CONFIG.SUBSCRIBE_CONFIRM_MS);
    control.click(); // The portal's own action does the change.
  }

  // Confirm only what the portal actually shows afterwards.
  function confirmSubscription(state) {
    const pending = subscription.pending;
    if (!pending || state === null || state === pending.from) return;
    subscription.pending = null;
    window.clearTimeout(subscription.timer);
    notifySubscription(pending.where, state ? 'subscribed' : 'unsubscribed',
      state ? 'Subscribed' : 'Unsubscribed');
  }

  let toastTimer = 0;
  let itemFeedback = false;

  function notifySubscription(where, symbol, text) {
    if (where === 'bell') {
      const toast = document.querySelector('.' + PREFIX + '-toast');
      if (!toast) return;
      window.clearTimeout(toastTimer);
      toast.replaceChildren(makeIcon(symbol), document.createTextNode(text));
      toast.hidden = false;
      toastTimer = window.setTimeout(() => { toast.hidden = true; }, CONFIG.COPIED_FEEDBACK_MS);
      return;
    }
    const item = document.querySelector('.' + PREFIX + '-subscribe');
    if (!item) return;
    itemFeedback = true;
    setItemIcon(item, symbol);
    item.querySelector('.' + PREFIX + '-label').textContent = text;
    addClass(item, PREFIX + '-flash');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      itemFeedback = false;
      removeClass(item, PREFIX + '-flash');
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

  // The heart's drawn icon, the element drawn as a circle ("host") and the
  // control the bell goes after. An icon-font heart (<i> or <span>) is its
  // own circle, as in v0.9.10. An SVG or image heart is circled through the
  // control or wrapper holding only that icon; if there is none, the heart
  // keeps its own look rather than restyling something larger.
  function findHeartParts(heading) {
    const icon = findHeart(heading);
    if (!icon) return null;
    const control = icon.closest('button, a, [role="button"]');
    const outer = control && heading.contains(control) ? control : icon;
    let host = null;
    if (icon.tagName === 'I' || icon.tagName === 'SPAN') {
      host = icon;
    } else if (outer !== icon && !normalisedText(outer)) {
      host = outer;
    } else if (icon.parentElement && icon.parentElement !== heading &&
        icon.parentElement.children.length === 1 && !normalisedText(icon.parentElement)) {
      host = icon.parentElement;
    }
    return { icon, host, outer };
  }

  // Copy the heart's colour, font size and line height so the bell is drawn
  // the same size. The font size is used (not the box height), because the
  // heart's box includes line spacing and made the bell too big.
  function matchHeart(heading, icon) {
    const heart = findHeart(heading);
    if (!heart) return null;
    const computed = getComputedStyle(heart);
    for (const property of ['color', 'font-size', 'line-height']) {
      const value = computed.getPropertyValue(property);
      if (value && icon.style.getPropertyValue(property) !== value) icon.style.setProperty(property, value);
    }
    return heart;
  }

  // Line 1 style circles for the heart and bell. The bell is always a
  // circle in the circles style; the heart whenever it has a host (see
  // findHeartParts). Each is set independently, so a missing subscribe
  // button can no longer leave the heart large and plain.
  function applyFavCircles(heading, heartParts, wrap, bellButton, bellIcon) {
    const circles = CONFIG.ACTION_STYLE === 'circles';
    const host = heartParts && heartParts.host;
    for (const element of heading.querySelectorAll('.' + PREFIX + '-fav-icon')) {
      if (element !== host && element !== bellIcon) removeClass(element, PREFIX + '-fav-icon');
    }
    for (const element of [host, bellIcon]) {
      if (!element) continue;
      if (circles) addClass(element, PREFIX + '-fav-icon');
      else removeClass(element, PREFIX + '-fav-icon');
    }
    if (bellButton) {
      if (circles) addClass(bellButton, PREFIX + '-bell-flat');
      else removeClass(bellButton, PREFIX + '-bell-flat');
    }
    // Their common parent becomes a centred row, so they share one centre line.
    const heartOuter = heartParts && heartParts.outer;
    const row = heartOuter && wrap ? commonAncestor(heartOuter, wrap) : null;
    if (row && row !== heading && heading.contains(row) && !row.contains(heading.querySelector('.' + PREFIX + '-header'))) {
      if (circles) addClass(row, PREFIX + '-fav-row');
      else removeClass(row, PREFIX + '-fav-row');
    }
  }

  // Move `moved` vertically (via "top") so the centre of `measured` (itself
  // or an element inside it) is at targetY. Only written when it changes by
  // more than half a pixel, so it cannot loop. Returns false (and clears the
  // offset) when it is further away than one circle, i.e. on another row
  // (narrow windows).
  function centreAt(measured, moved, targetY) {
    const box = measured.getBoundingClientRect();
    const current = parseFloat(moved.style.top) || 0;
    const natural = box.top - current + box.height / 2;
    if (Math.abs(targetY - natural) > CONFIG.CIRCLE_SIZE_PX) {
      if (moved.style.top) moved.style.top = '';
      return false;
    }
    const top = Math.round((targetY - natural) * 100) / 100;
    if (Math.abs(top - current) > 0.5) moved.style.top = top + 'px';
    return true;
  }

  // Line the heart and bell up with line 1's circles (the Copy link circle).
  // Without line 1 on screen, or when the heart is on another row, the bell
  // lines up with the heart instead. `heart` is the element moved and
  // measured for the heart (its circle, or the icon when it has none).
  function alignFavWithLine1(heading, heart, wrap, bellIcon) {
    if (!wrap || !isRendered(bellIcon)) return;
    const heartShown = !!heart && isRendered(heart);
    const reference = heading.querySelector('.' + PREFIX + '-circles .' + PREFIX + '-copy');
    if (CONFIG.ACTION_STYLE === 'circles' && isRendered(reference)) {
      const box = reference.getBoundingClientRect();
      const targetY = box.top + box.height / 2;
      const heartOnLine = heartShown && heart.classList.contains(PREFIX + '-fav-icon')
        ? centreAt(heart, heart, targetY) : !heartShown;
      if (heartOnLine) {
        centreAt(bellIcon, wrap, targetY);
        return;
      }
    }
    if (!heartShown) return;
    const heartBox = heart.getBoundingClientRect();
    const iconBox = bellIcon.getBoundingClientRect();
    const difference = (heartBox.top + heartBox.height / 2) - (iconBox.top + iconBox.height / 2);
    if (Math.abs(difference) <= 0.5) return;
    const current = parseFloat(wrap.style.top) || 0;
    wrap.style.top = Math.round((current + difference) * 100) / 100 + 'px';
  }

  // Show a bell next to the heart on every article. Its state comes from
  // the portal's subscribe button when there is one (which stays in the
  // page, hidden, and still does the work), otherwise from the Actions menu
  // item. With neither, the bell is empty and says subscription is not
  // available; clicking it then only explains that.
  // Returns the current state and whether the bell is on screen.
  function ensureBell(heading) {
    const heartParts = findHeartParts(heading);
    const nativeButton = findSubscribeButton(heading);
    const nativeState = nativeButton ? subscriptionState(nativeButton.textContent) : null;
    const menuItem = nativeActions().find((action) => action.kind === 'subscribe');
    const menuState = menuItem ? subscriptionState(menuItem.label) : null;
    let wrap = heading.querySelector('.' + PREFIX + '-bell-wrap');
    const anchor = nativeButton || (heartParts && heartParts.outer);
    if (!CONFIG.SUBSCRIBE_AS_BELL || !anchor || !anchor.parentNode) {
      if (wrap) wrap.remove();
      if (nativeButton) removeClass(nativeButton, PREFIX + '-native-hidden');
      applyFavCircles(heading, heartParts, null, null, null);
      return { state: nativeButton ? nativeState : menuState, shown: false, nativeShown: isRendered(nativeButton) };
    }
    const state = nativeButton ? nativeState : menuState;
    if (!wrap) wrap = buildBell();
    // Sit right after the portal's button (so the bell follows its layout,
    // including being hidden on narrow windows) or, without one, right after
    // the heart's control (never inside it).
    if (anchor.nextSibling !== wrap) anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    if (nativeButton) addClass(nativeButton, PREFIX + '-native-hidden');

    const button = wrap.querySelector('.' + PREFIX + '-bell');
    const icon = button.querySelector('i');
    // Switch only the bell glyph classes, so the circle class is kept.
    addClass(icon, 'fa');
    addClass(icon, state ? 'fa-bell' : 'fa-bell-o');
    removeClass(icon, state ? 'fa-bell-o' : 'fa-bell');
    const label = state === null ? 'Subscription is not available for this article' :
      (state ? 'Unsubscribe from this article' : 'Subscribe to this article');
    setAttributeIfChanged(button, 'aria-label', label);
    setAttributeIfChanged(button, 'title', label);
    if (state === null) {
      if (button.hasAttribute('aria-pressed')) button.removeAttribute('aria-pressed');
      setAttributeIfChanged(button, 'aria-disabled', 'true');
    } else {
      setAttributeIfChanged(button, 'aria-pressed', String(state));
      if (button.hasAttribute('aria-disabled')) button.removeAttribute('aria-disabled');
    }
    matchHeart(heading, icon);
    applyFavCircles(heading, heartParts, wrap, button, icon);
    const heartMoved = heartParts ? (heartParts.host || heartParts.icon) : null;
    alignFavWithLine1(heading, heartMoved, wrap, icon);
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

  // Line icons on a 24 x 24 grid (the same style as Better KB editor),
  // drawn with currentColor. Built as SVG elements, never as markup strings.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    copy: [['rect', { x: 9, y: 9, width: 11, height: 11, rx: 2 }], ['path', { d: 'M5 15V5a2 2 0 0 1 2-2h8' }]],
    copied: [['path', { d: 'M5 12.5l4.5 4.5L19 7' }]],
    copyFailed: [['path', { d: 'M12 3 2 20h20L12 3z' }], ['path', { d: 'M12 10v4M12 17h.01' }]],
    edit: [['path', { d: 'M4 20h4L19 9l-4-4L4 16v4z' }], ['path', { d: 'M13.5 6.5l4 4' }]],
    flag: [['path', { d: 'M5 21V4' }], ['path', { d: 'M5 4h11l-2 4 2 4H5' }]],
    workspace: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }], ['path', { d: 'M9 4v16M9 10h12' }]],
    subscribed: [['path', { d: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2z' }], ['path', { d: 'M10 20a2 2 0 0 0 4 0' }]],
    unsubscribed: [['path', { d: 'M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l2 2H8' }], ['path', { d: 'M10 20a2 2 0 0 0 4 0M3 3l18 18' }]],
    other: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1' }]]
  };

  function makeIcon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', PREFIX + '-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.dataset.icon = name;
    for (const [tag, attributes] of ICONS[name] || ICONS.other) {
      const shape = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, String(value));
      svg.appendChild(shape);
    }
    return svg;
  }

  // Swap an item's icon only when it changes.
  function setItemIcon(item, name) {
    const current = item.querySelector('.' + PREFIX + '-icon');
    if (current && current.dataset.icon === name) return;
    const icon = makeIcon(name);
    if (current) current.replaceWith(icon);
    else item.prepend(icon);
  }

  // One line 1 item: an icon, then the text. The icon is hidden from screen
  // readers so the item is announced by its text.
  function makeItem(tag, className, iconName, text) {
    const item = document.createElement(tag);
    item.className = PREFIX + '-item ' + PREFIX + '-' + className;
    const label = document.createElement('span');
    label.className = PREFIX + '-label';
    label.textContent = text;
    item.append(makeIcon(iconName), label);
    return { item, label };
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
    header.className = PREFIX + '-header' + (CONFIG.ACTION_STYLE === 'circles' ? ' ' + PREFIX + '-circles' : '');

    const line1 = document.createElement('div');
    line1.className = PREFIX + '-line ' + PREFIX + '-line1';

    const copy = makeItem('a', 'copy', 'copy', 'Copy link');
    copy.item.setAttribute('title', 'Copy the article link');
    copy.label.setAttribute('aria-live', 'polite');

    const edit = makeItem('a', 'edit', 'edit', 'Edit article');
    edit.item.setAttribute('title', 'Edit this article');
    edit.item.addEventListener('click', (event) => {
      // Portal mode: run the portal's own Edit action instead of navigating.
      if (edit.item.dataset.mode === 'portal') {
        event.preventDefault();
        runNativeAction('edit');
      }
    });

    const flag = makeItem('a', 'flag', 'flag', 'Flag article');
    flag.item.setAttribute('title', 'Flag this article');
    makeActionButton(flag.item, () => runNativeAction('flag'));

    // Shown only when the bell is not on screen (narrow windows).
    const subscribe = makeItem('a', 'subscribe', 'subscribed', 'Subscribe');
    makeActionButton(subscribe.item, () => requestSubscriptionChange('item'));

    // Any other portal actions are mirrored here, in their menu order.
    const extra = document.createElement('span');
    extra.className = PREFIX + '-extra';

    const workspace = makeItem('a', 'workspace', 'workspace', 'Open in Workspace');
    workspace.item.target = '_new'; // Kept from the original Workspace link.
    workspace.item.setAttribute('title', 'Open this article in Workspace');

    line1.append(copy.item, edit.item, flag.item, subscribe.item, extra, workspace.item);
    // Circles show their own tooltip (the name); a browser tooltip as well
    // would appear on top of it.
    if (CONFIG.ACTION_STYLE === 'circles') {
      for (const item of [copy.item, edit.item, flag.item, workspace.item]) item.removeAttribute('title');
    }

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
        () => showFeedback('copied', 'Copied'),
        (error) => {
          console.warn(LOG_PREFIX + 'Copy link failed: ' + (error && error.name ? error.name : 'unknown error'));
          showFeedback('copyFailed', 'Copy failed');
        }
      );
    });

    // The tooltip stays visible while "Copied" shows (circles style).
    function showFeedback(iconName, text) {
      window.clearTimeout(feedbackTimer);
      setItemIcon(copy.item, iconName);
      copy.label.textContent = text;
      addClass(copy.item, PREFIX + '-flash');
      feedbackTimer = window.setTimeout(() => {
        setItemIcon(copy.item, 'copy');
        copy.label.textContent = 'Copy link';
        removeClass(copy.item, PREFIX + '-flash');
      }, CONFIG.COPIED_FEEDBACK_MS);
    }

    return {
      header, copy: copy.item, edit: edit.item,
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
      setItemIcon(parts.subscribe, menuState ? 'unsubscribed' : 'subscribed');
      setText(parts.subscribe.querySelector('.' + PREFIX + '-label'),
        menuState ? 'Unsubscribe' : 'Subscribe');
    }

    // Other portal actions: rebuild only when the set of labels changes.
    const others = actions.filter((action) => action.kind === 'other');
    const signature = others.map((action) => action.label).join('\n');
    if (signature !== parts.extraSignature) {
      parts.extraSignature = signature;
      const items = others.map((action) => {
        const mirrored = makeItem('a', 'other', 'other', action.label);
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
