import { $, esc } from "../lib/charts.js";

let data = null,
  loading = false,
  initialized = false,
  showDependencies = false;
const HIDDEN_SOURCES = new Set(["/opt/homebrew/bin", "/opt/homebrew/share/google-cloud-sdk/bin"]);

function sourceOrder(a, b) {
  return Number(a.startsWith("/")) - Number(b.startsWith("/")) || a.localeCompare(b);
}

function packageKey(tool) {
  return JSON.stringify([tool.package ? "package" : "command", tool.package || tool.name, tool.version || ""]);
}

function packageCount(tools) {
  return `${new Set(tools.map(packageKey)).size} ${tools.every((t) => t.package) ? "package" : "mục"}`;
}

function packageCards(matches, inventory, search, source) {
  const keys = new Set(matches.map(packageKey));
  const packages = new Map();
  inventory
    .filter((t) => t.source === source && keys.has(packageKey(t)))
    .forEach((t) => {
      const key = packageKey(t);
      if (!packages.has(key)) packages.set(key, []);
      packages.get(key).push(t);
    });
  const sections = (
    source === "Homebrew"
      ? [
          ["app", "Cài trực tiếp"],
          ["dependency", "Dependency"],
          ["unknown", "Chưa rõ cách cài"],
        ]
      : [[null, "Các gói và lệnh đã cài"]]
  )
    .map(([kind, label]) => {
      const entries = [...packages.values()]
        .filter((tools) => kind === null || (tools[0].install_kind || "unknown") === kind)
        .sort((a, b) => (a[0].package || a[0].name).localeCompare(b[0].package || b[0].name));
      if (!entries.length) return "";
      return `<section class="cli-package-section" aria-label="${label}">
      ${kind !== null ? `<h2 class="cli-package-section-title">${label} <span class="muted small">${packageCount(entries.map((tools) => tools[0]))}</span></h2>` : ""}
      <div class="cli-cards cli-package-cards">${entries
        .map((tools) => {
          const first = tools[0];
          const name = first.package || first.name;
          const description =
            tools.find((t) => t.description && t.description_source?.startsWith(source + " · ")) ||
            tools.find((t) => t.name === name && t.description) ||
            tools.find((t) => t.description);
          const priority = (t) => (search && t.name.toLocaleLowerCase().includes(search) ? 0 : t.name === name ? 1 : 2);
          const commands = tools.slice().sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name));
          const commandList = (items) =>
            `<ul class="cli-package-commands">${items
              .map((t) => `<li><code title="${esc([t.description, t.path].filter(Boolean).join(" · "))}">${esc(t.name)}</code></li>`)
              .join("")}</ul>`;
          return `<article class="cli-card cli-package-card">
          <header class="cli-package-card-head"><h3><code>${esc(name)}</code></h3>${first.version ? `<span class="cli-package-version small">${esc(first.version)}</span>` : ""}</header>
          <p class="cli-description${description ? "" : " muted"}"${description ? ` title="${esc(description.description_source)}"` : ""}>${esc(description?.description || "Chưa có mô tả trong metadata cục bộ.")}</p>
          <div class="cli-package-command-list"><p class="muted small">${commands.length} lệnh</p>
          ${commandList(commands.slice(0, 6))}
          ${commands.length > 6 ? `<details class="cli-package-more"${search ? " open" : ""}><summary>${commands.length - 6} lệnh khác</summary>${commandList(commands.slice(6))}</details>` : ""}</div>
        </article>`;
        })
        .join("")}</div></section>`;
    })
    .join("");
  return sections;
}

export function renderCliTools(inventory, query = "", source = "", showDependencies = false) {
  const search = query.trim().toLocaleLowerCase();
  const matches = inventory.tools.filter(
    (t) =>
      !HIDDEN_SOURCES.has(t.source) &&
      (!source || t.source === source) &&
      [t.name, t.description, t.source, t.package, t.path, t.resolved_path].join(" ").toLocaleLowerCase().includes(search),
  );
  const rows = matches.filter((t) => showDependencies || t.source !== "Homebrew" || t.install_kind !== "dependency");
  const groups = new Map();
  rows.forEach((t) => {
    if (!groups.has(t.source)) groups.set(t.source, []);
    groups.get(t.source).push(t);
  });
  if (!groups.has("Homebrew") && matches.some((t) => t.source === "Homebrew")) groups.set("Homebrew", []);
  $("#cli-message").textContent = inventory.warnings.join(" · ");
  $("#cli-message").hidden = !inventory.warnings.length;
  $("#cli-list").innerHTML = groups.size
    ? [...groups]
        .sort(([a], [b]) => sourceOrder(a, b))
        .map(
          ([name, tools]) =>
            `<details class="cli-group"${name === "Homebrew" ? ' id="cli-homebrew"' : ""}${name === "Homebrew" || search || source ? " open" : ""}><summary>${esc(name)} <span class="muted small">(${packageCount(tools)})</span></summary>
    ${name === "Homebrew" ? `<label class="cli-dependencies"><input id="cli-dependencies" type="checkbox"${showDependencies ? " checked" : ""}>Hiện dependency Homebrew</label>` : ""}
    ${tools.length ? packageCards(tools, inventory.tools, search, name) : '<p class="empty">Không tìm thấy lệnh phù hợp. Bật hiển thị dependency để xem thêm.</p>'}</details>`,
        )
        .join("")
    : '<p class="empty">Không tìm thấy lệnh phù hợp.</p>';
}

function render() {
  if (!data) return;
  const selected = $("#cli-source").value;
  $("#cli-source").innerHTML =
    '<option value="">Mọi nguồn</option>' +
    Object.entries(data.sources)
      .filter(([name]) => !HIDDEN_SOURCES.has(name))
      .sort(([a], [b]) => sourceOrder(a, b))
      .map(([name]) => {
        const tools = data.tools.filter((t) => t.source === name && (showDependencies || name !== "Homebrew" || t.install_kind !== "dependency"));
        return `<option value="${esc(name)}">${esc(name)} (${packageCount(tools)})</option>`;
      })
      .join("");
  $("#cli-source").value = selected in data.sources && !HIDDEN_SOURCES.has(selected) ? selected : "";
  renderCliTools(data, $("#cli-query").value, $("#cli-source").value, showDependencies);
}

async function load() {
  if (loading) return;
  loading = true;
  $("#cli-refresh").disabled = true;
  $("#cli-list").setAttribute("aria-busy", "true");
  $("#cli-refresh").setAttribute("aria-busy", "true");
  $("#cli-message").hidden = true;
  try {
    const response = await fetch("/api/cli-tools", { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const next = await response.json();
    data = next;
    render();
  } catch (error) {
    $("#cli-message").hidden = false;
    $("#cli-message").textContent =
      "Không quét được CLI tools: " + error.message + (data ? ". Đang giữ kết quả lần quét trước. " : ". ") + "Bấm Quét lại để thử lại.";
  } finally {
    loading = false;
    $("#cli-refresh").disabled = false;
    $("#cli-refresh").setAttribute("aria-busy", "false");
    $("#cli-list").setAttribute("aria-busy", "false");
  }
}

export function showCliTools() {
  if (!initialized) {
    initialized = true;
    $("#cli-query").addEventListener("input", render);
    $("#cli-source").addEventListener("change", render);
    $("#cli-list").addEventListener("change", (event) => {
      if (event.target.id !== "cli-dependencies") return;
      showDependencies = event.target.checked;
      render();
      $("#cli-dependencies")?.focus();
    });
    $("#cli-refresh").addEventListener("click", load);
  }
  if (data) render();
  else return load();
}
