// The Agents tools panel's launcher. A panel entry cannot carry a query, and navigating away from the entry document
// would lose Orca's bridge (window.orca), so this loads the shared dashboard page into the entry document itself.
// Until the page is there the launcher shows what is happening; if the page cannot be had it says so and offers a
// retry, and it only replaces itself (document.open) once it holds a real page. Pure of globals: agents-tools.html
// passes them in, and tests pass stubs.

/** @param {{ fetch: typeof fetch, doc: { getElementById(id: string): any, open(): void, write(html: string): void, close(): void },
 *  target: { __orcaView?: string }, view: string, page?: string }} env */
export function launch({ fetch, doc, target, view, page = 'index.html' }) {
  const text = doc.getElementById('state'), retry = doc.getElementById('retry')
  const show = (message, failed) => { text.textContent = message; retry.hidden = !failed }
  async function attempt() {
    show('Đang tải dashboard…', false)
    try {
      const res = await fetch(page, { cache: 'no-store' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const html = await res.text()
      if (!/^\s*<!doctype html/i.test(html)) throw new Error('not the dashboard page')
      target.__orcaView = view
      doc.open()
      doc.write(html)
      doc.close()
    } catch (e) {
      show('Không tải được dashboard (' + (e && e.message ? e.message : 'lỗi') + ').', true)
    }
  }
  retry.onclick = () => { void attempt() }
  return attempt()
}
