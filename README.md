# OneTag AI - Ask AI box for Google Tag Manager

A Google Tag Manager tag template that adds an Ask AI box to your site. The box answers visitor questions from your own pages and shows links to the pages it used. It is [OneTag AI](https://onetagai.com/?ref=gtm)'s open-source `ask-docs.js`, loaded with one tag. There is no backend to run and no code to paste into your pages.

- Answers from your site's own content. It looks for an index next to the page and up to the site root: MkDocs `search/search_index.json`, a Pagefind `pagefind/` folder, then `llms-full.txt`. Without one it answers from the current page.
- Settings in the tag: site key, button label, position, accent color, language.
- Loads one script, `https://onetagai.com/ask-docs.js`. The template has one permission: inject that script.

<!-- Screenshot placeholder: add screenshot.png (the tag's settings in GTM next to the box on a page) and replace this comment with ![The OneTag AI tag in Google Tag Manager](screenshot.png) -->

## Install

1. In Google Tag Manager, open your container and go to **Templates**.
2. Under **Tag Templates**, click **Search Gallery**, search for **OneTag AI**, and click **Add to workspace**.
3. Go to **Tags**, click **New**, then **Tag Configuration**, and pick **OneTag AI - Ask AI box**.
4. Paste your **Site key**. Change the label, position, color or language if you want.
5. Under **Triggering**, pick **All Pages** (or **Initialization - All Pages**).
6. Save, click **Preview** to try it on your site, then **Submit** to publish.

Until the template is in the Gallery, import it by hand: download `template.tpl` from this repository, go to **Templates**, **Tag Templates**, **New**, open the menu at the top right, choose **Import**, pick the file, and **Save**. Then continue at step 3.

## Before you deploy: get a free key

Run this once. It needs an email address and no browser.

```sh
curl -X POST https://onetagai.com/api/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
```

The key is a site key. It is public by design, like an analytics ID, and it ends up in the page. The free plan is 1,000,000 tokens a month with a hard cap. When it runs out the box says so, and no bill can appear.

To try the box before you sign up, use the demo key `ot_demo000000000000000000000`. It answers on `localhost` only.

## Settings

| Field | What it does |
| --- | --- |
| Site key | Your OneTag AI site key (starts with `ot_`). Required. |
| Button label | Text on the button. Empty uses the default. |
| Position | Auto, floating bottom right, floating bottom left, or None. With None, open the box from your own code with `onetagAskDocs.open()`. |
| Accent color | Hex color without `#`, for example `0f766e`. |
| Language | Auto (follows the page), English, Simplified Chinese or Traditional Chinese. |

## How it works

The tag builds one URL and loads it with GTM's `injectScript`:

```
https://onetagai.com/ask-docs.js?key=ot_...&ref=gtm&label=Ask%20the%20docs&position=left&color=0f766e&lang=en
```

Empty fields are left out. Every value is encoded with `encodeUriComponent`.

Why the options are in the URL and not in `data-*` attributes: GTM adds scripts to the page asynchronously, so inside `ask-docs.js` `document.currentScript` is `null` and there is no tag of yours to put attributes on. The script finds itself by its URL instead and reads the options from the query string. On a normal page the same options also work as `data-key`, `data-label` and so on.

The script tag has a cache token, so the script loads once per page even if the tag fires twice. If the script cannot load, the tag reports a failure to GTM.

The box calls the OneTag AI API with the visitor's question and the matching parts of your pages.

## For maintainers

- `template.tpl`, `metadata.yaml` and `LICENSE` at the root are what the Gallery reads.
- `node tools/check-template.cjs` checks the template offline: the sections and their JSON, the fields, that the only permission is `inject_script` for `https://onetagai.com/ask-docs.js*`, runs the `___TESTS___` scenarios against stand-ins for the GTM APIs, and prints the URL built for sample inputs. It is not GTM; also run the **Tests** tab in the GTM template editor before a release.
- To release: commit `template.tpl`, put that commit's full SHA at the top of `versions` in `metadata.yaml` with a short `changeNotes`, and commit again.

## License

Apache License 2.0. See [LICENSE](LICENSE).
