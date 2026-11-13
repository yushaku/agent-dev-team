// Inject before page scripts (CDP Page.addScriptToEvaluateOnNewDocument).
// Placeholders: __URL_PART__ (substring of the API URL), __N__ (target item count),
// __ITEMS_PATH__ (dot path to the item array in the JSON body, e.g. "data" or "data.tasks"; "" = body is the array),
// __SUFFIX_KEYS__ (comma list of string keys made unique per clone, e.g. "id,code,parentId").
// Patches XMLHttpRequest and fetch. Sets window.__bench = { base, n } on success, window.__benchErr on failure.
(() => {
  const URL_PART = '__URL_PART__';
  const N = Number('__N__');
  const PATH = '__ITEMS_PATH__'.split('.').filter(Boolean);
  const KEYS = '__SUFFIX_KEYS__'.split(',').map((k) => k.trim()).filter(Boolean);
  const amplify = (text) => {
    try {
      const body = JSON.parse(text);
      let holder = null, key = null, items = body;
      for (const p of PATH) { holder = items; key = p; items = items[p]; }
      if (!Array.isArray(items) || !items.length) throw new Error('no item array at ' + PATH.join('.'));
      const out = []; let k = 0;
      while (out.length < N) {
        for (const t of items) {
          if (out.length >= N) break;
          const sfx = k ? '-x' + k : '';
          const c = { ...t };
          for (const f of KEYS) if (c[f] !== undefined && c[f] !== null && c[f] !== '') c[f] = String(c[f]) + sfx;
          out.push(c);
        }
        k++;
      }
      window.__bench = { base: items.length, n: out.length };
      if (!holder) return JSON.stringify(out);
      holder[key] = out;
      return JSON.stringify(body);
    } catch (e) { window.__benchErr = String(e); return text; }
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url) { this.__amp = String(url).includes(URL_PART); return open.apply(this, arguments); };
  for (const prop of ['responseText', 'response']) {
    const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, prop);
    Object.defineProperty(XMLHttpRequest.prototype, prop, {
      configurable: true,
      get() {
        const v = desc.get.call(this);
        if (!this.__amp || this.readyState !== 4 || typeof v !== 'string') return v;
        if (this.__ampOut === undefined) this.__ampOut = amplify(v);
        return this.__ampOut;
      },
    });
  }
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!String(url).includes(URL_PART)) return res;
    const text = amplify(await res.clone().text());
    return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
})();
