# Better KB shortcuts

A [Tampermonkey](https://www.tampermonkey.net/) userscript that gives knowledge articles in the ServiceNow knowledge portal (`/lps`) a tidier header with quick shortcuts for editors.

- **Line 1:** 🔖 KB number · 📋 Copy link · ✏️ Edit article · 🚩 Flag article · 🗂️ Open in Workspace. The heart stays on the right; the Actions menu is hidden because line 1 replaces it.
- **Line 2:** "KB number - title", linked to the article.
- **Edit article** opens the latest version, like the portal's own Edit.
- The browser tab shows "KB number - title".

The script never saves or changes anything in ServiceNow.

## Install

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Open the [raw script file](https://raw.githubusercontent.com/Miche-Miche-Miche/Better-KB-shortcuts/main/Better_KB_shortcuts.user.js) and select **Install**.
3. If you also use the original **LPS KB Portal view** script, disable it.

Updates install automatically from the same file.

## Credits

Based on [LPS KB Portal view](https://gist.github.com/lucasvieites/3e1543562b88b9f51c22fcd13c4ea1f9) (v0.8.4) by Lucas Vieites.
