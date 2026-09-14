(function () {
  "use strict";

  const STORAGE_KEY = "content_pipeline_v1";
  const STATUSES = [
    "Idee",
    "PT",
    "Einkauf",
    "Gedreht",
    "Caption final",
    "Gepostet",
    "Review",
    "Kill"
  ];
  const SHOP_STATUSES = new Set(["Einkauf", "Gedreht", "Caption final"]);

  /** @type {{cards: object[]}} */
  let state = { cards: [] };
  let editingId = null;
  let pendingKillId = null;

  // ——— Storage ———
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state = { cards: structuredClone(window.CONTENT_PIPELINE_SEED || []) };
        save();
        return;
      }
      const parsed = JSON.parse(raw);
      state = {
        cards: Array.isArray(parsed.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : []
      };
      if (state.cards.length === 0 && window.CONTENT_PIPELINE_SEED) {
        state.cards = structuredClone(window.CONTENT_PIPELINE_SEED);
        save();
      }
    } catch (e) {
      console.warn("load failed", e);
      state = { cards: structuredClone(window.CONTENT_PIPELINE_SEED || []) };
      save();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function emptyCard() {
    const t = nowIso();
    return {
      id: uid(),
      title: "",
      rank: null,
      status: "Idee",
      killReason: null,
      refLink: "",
      localClipPath: "",
      creatorUsername: "",
      sourceMode: "A",
      patternTags: [],
      hookType: "",
      kochkarte: "",
      drehbrief: "",
      caption: "",
      captionHookAlt: "",
      macros: { kcal: null, proteinG: null, note: "" },
      cutFit: false,
      shopping: "",
      timeMinutes: null,
      difficultyOnCam: "",
      shootDurationSec: null,
      platformSlot: "beide",
      postWindow: "",
      performance48h: null,
      performance7d: null,
      createdAt: t,
      updatedAt: t
    };
  }

  /**
   * After PT + macros/cutFit documented → status Einkauf = drehbereit.
   * Heuristic: has macros kcal+protein OR cutFit true, and was advancing from PT.
   */
  function isDrehbereit(card) {
    const m = card.macros || {};
    const hasMacros =
      (m.kcal != null && m.kcal !== "" && Number(m.kcal) > 0) ||
      (m.proteinG != null && m.proteinG !== "" && Number(m.proteinG) > 0);
    return !!(card.cutFit || hasMacros);
  }

  // ——— Render ———
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    renderFilter();
    renderRank();
    renderKanban();
  }

  function renderFilter() {
    const sel = document.getElementById("statusFilter");
    const cur = sel.value || "all";
    sel.innerHTML =
      '<option value="all">Alle Spalten</option>' +
      STATUSES.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    sel.value = STATUSES.includes(cur) || cur === "all" ? cur : "all";
  }

  function renderRank() {
    const list = document.getElementById("rankList");
    const ranked = state.cards
      .filter((c) => c.rank != null && c.rank >= 1 && c.rank <= 7 && c.status !== "Kill")
      .sort((a, b) => a.rank - b.rank);
    if (!ranked.length) {
      list.innerHTML = '<li class="rank-empty">Noch keine Ranks 1–7 gesetzt.</li>';
      return;
    }
    list.innerHTML = ranked
      .map(
        (c) => `
      <li class="rank-item" data-id="${escapeHtml(c.id)}" role="button" tabindex="0">
        <span class="rank-num">${c.rank}</span>
        <div>
          <div class="t">${escapeHtml(c.title || "Ohne Titel")}</div>
          <div class="meta">${escapeHtml(c.status)}${c.cutFit ? " · cutFit" : ""}${
          c.macros && c.macros.kcal != null ? ` · ${c.macros.kcal} kcal` : ""
        }</div>
        </div>
      </li>`
      )
      .join("");
    list.querySelectorAll(".rank-item").forEach((el) => {
      el.addEventListener("click", () => openEdit(el.dataset.id));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openEdit(el.dataset.id);
        }
      });
    });
  }

  function renderKanban() {
    const filter = document.getElementById("statusFilter").value;
    const cols = filter === "all" ? STATUSES : [filter];
    const root = document.getElementById("kanban");
    root.innerHTML = cols
      .map((status) => {
        const cards = state.cards.filter((c) => c.status === status);
        const colClass = "col-" + status.replace(/\s+/g, "-");
        return `
        <div class="column ${colClass}" data-status="${escapeHtml(status)}">
          <div class="column-head">
            <h3>${escapeHtml(status)}</h3>
            <span class="badge">${cards.length}</span>
          </div>
          <div class="column-body">
            ${cards.map(cardHtml).join("") || '<p class="rank-empty">Leer</p>'}
          </div>
        </div>`;
      })
      .join("");

    root.querySelectorAll(".card").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-move]")) return;
        openEdit(el.dataset.id);
      });
    });
    root.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveStatus(btn.closest(".card").dataset.id, btn.dataset.move);
      });
    });
  }

  function cardHtml(c) {
    const macros =
      c.macros && (c.macros.kcal != null || c.macros.proteinG != null)
        ? `${c.macros.kcal ?? "–"} kcal · ${c.macros.proteinG ?? "–"} g P`
        : "";
    const tags = (c.patternTags || []).slice(0, 3).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
    const nextIdx = STATUSES.indexOf(c.status);
    const next = nextIdx >= 0 && nextIdx < STATUSES.length - 1 ? STATUSES[nextIdx + 1] : null;
    const prev = nextIdx > 0 ? STATUSES[nextIdx - 1] : null;
    const dreh = c.status === "Einkauf" && isDrehbereit(c) ? '<span class="chip ok">drehbereit</span>' : "";
    return `
      <article class="card ${c.status === "Kill" ? "kill" : ""}" data-id="${escapeHtml(c.id)}">
        <h4 class="card-title">${escapeHtml(c.title || "Ohne Titel")}</h4>
        <div class="card-meta">
          ${c.rank != null ? `<span class="chip rank">#${c.rank}</span>` : ""}
          ${c.cutFit ? '<span class="chip ok">cutFit</span>' : ""}
          ${dreh}
          ${c.platformSlot ? `<span class="chip">${escapeHtml(c.platformSlot)}</span>` : ""}
          ${tags}
        </div>
        ${macros ? `<div class="card-macros">${escapeHtml(macros)}</div>` : ""}
        ${c.status === "Kill" && c.killReason ? `<div class="card-macros">Kill: ${escapeHtml(c.killReason)}</div>` : ""}
        <div class="status-btns">
          ${prev ? `<button type="button" data-move="${escapeHtml(prev)}">← ${escapeHtml(prev)}</button>` : ""}
          ${next && next !== "Kill" ? `<button type="button" data-move="${escapeHtml(next)}">${escapeHtml(next)} →</button>` : ""}
        </div>
      </article>`;
  }

  function moveStatus(id, status) {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return;
    if (status === "Kill") {
      openKill(id);
      return;
    }
    // Auto-hint: leaving PT with macros/cutFit → often go to Einkauf (drehbereit)
    card.status = status;
    if (status === "Einkauf" && !isDrehbereit(card)) {
      // still allow, but user should fill macros/cutFit
    }
    card.updatedAt = nowIso();
    if (status !== "Kill") card.killReason = null;
    save();
    render();
  }

  // ——— Modal form ———
  function openEdit(id) {
    editingId = id || null;
    const card = id ? state.cards.find((c) => c.id === id) : emptyCard();
    if (!card) return;
    if (!id) {
      // staging new card in memory via form only
      editingId = null;
    }
    document.getElementById("modalTitle").textContent = id ? "Karte bearbeiten" : "Neue Karte";
    const m = card.macros || {};
    const fields = document.getElementById("modalFields");
    fields.innerHTML = `
      <label class="field full"><span>Titel</span>
        <input name="title" required value="${escapeHtml(card.title)}" /></label>
      <label class="field"><span>Status</span>
        <select name="status">${STATUSES.map((s) => `<option ${s === card.status ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></label>
      <label class="field"><span>Rank (1–7 oder leer)</span>
        <input name="rank" type="number" min="1" max="7" value="${card.rank ?? ""}" /></label>
      <label class="field"><span>Creator @</span>
        <input name="creatorUsername" value="${escapeHtml(card.creatorUsername || "")}" /></label>
      <label class="field"><span>Source Mode</span>
        <select name="sourceMode">
          <option value="A" ${card.sourceMode === "A" ? "selected" : ""}>A</option>
          <option value="B" ${card.sourceMode === "B" ? "selected" : ""}>B</option>
        </select></label>
      <label class="field"><span>Platform Slot</span>
        <select name="platformSlot">
          ${["IG", "TT", "beide"].map((p) => `<option ${card.platformSlot === p ? "selected" : ""}>${p}</option>`).join("")}
        </select></label>
      <label class="field"><span>Ref-Link</span>
        <input name="refLink" type="url" value="${escapeHtml(card.refLink || "")}" /></label>
      <label class="field"><span>Local Clip Path</span>
        <input name="localClipPath" value="${escapeHtml(card.localClipPath || "")}" /></label>
      <label class="field"><span>Pattern Tags (Komma)</span>
        <input name="patternTags" value="${escapeHtml((card.patternTags || []).join(", "))}" /></label>
      <label class="field"><span>Hook Type</span>
        <input name="hookType" value="${escapeHtml(card.hookType || "")}" /></label>
      <label class="field"><span>kcal</span>
        <input name="kcal" type="number" value="${m.kcal ?? ""}" /></label>
      <label class="field"><span>Protein (g)</span>
        <input name="proteinG" type="number" value="${m.proteinG ?? ""}" /></label>
      <label class="field full"><span>Macros Note</span>
        <input name="macroNote" value="${escapeHtml(m.note || "")}" /></label>
      <label class="field checkbox-row full">
        <input name="cutFit" type="checkbox" ${card.cutFit ? "checked" : ""} />
        <span>cutFit (PT-Slot passt)</span>
      </label>
      <label class="field"><span>Zeit (Min)</span>
        <input name="timeMinutes" type="number" value="${card.timeMinutes ?? ""}" /></label>
      <label class="field"><span>Schwierigkeit on cam</span>
        <input name="difficultyOnCam" value="${escapeHtml(card.difficultyOnCam || "")}" /></label>
      <label class="field"><span>Dreh-Dauer (Sek)</span>
        <input name="shootDurationSec" type="number" value="${card.shootDurationSec ?? ""}" /></label>
      <label class="field"><span>Post Window</span>
        <input name="postWindow" value="${escapeHtml(card.postWindow || "")}" /></label>
      <label class="field"><span>Perf 48h</span>
        <input name="performance48h" value="${escapeHtml(card.performance48h ?? "")}" /></label>
      <label class="field"><span>Perf 7d</span>
        <input name="performance7d" value="${escapeHtml(card.performance7d ?? "")}" /></label>
      <label class="field full"><span>Shopping (eine Zeile pro Zutat)</span>
        <textarea name="shopping" rows="5">${escapeHtml(card.shopping || "")}</textarea></label>
      <label class="field full"><span>Kochkarte</span>
        <textarea name="kochkarte" rows="6">${escapeHtml(card.kochkarte || "")}</textarea></label>
      <label class="field full"><span>Drehbrief</span>
        <textarea name="drehbrief" rows="6">${escapeHtml(card.drehbrief || "")}</textarea></label>
      <label class="field full"><span>Caption</span>
        <textarea name="caption" rows="5">${escapeHtml(card.caption || "")}</textarea></label>
      <label class="field full"><span>Caption Hook Alt</span>
        <input name="captionHookAlt" value="${escapeHtml(card.captionHookAlt || "")}" /></label>
      ${
        card.status === "Kill" || card.killReason
          ? `<label class="field full"><span>Kill Reason</span>
        <textarea name="killReason" rows="2">${escapeHtml(card.killReason || "")}</textarea></label>`
          : ""
      }
      <p class="hint-block full" style="padding:0;grid-column:1/-1">
        <strong>Hinweis:</strong> Nach <em>PT</em> mit Macros und/oder cutFit → Status <em>Einkauf</em> = <strong>drehbereit</strong>.
      </p>
    `;
    document.getElementById("cardModal").showModal();
  }

  function readForm() {
    const f = document.getElementById("cardForm");
    const g = (n) => f.elements[n];
    const numOrNull = (v) => {
      if (v === "" || v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const rankRaw = g("rank").value;
    let rank = numOrNull(rankRaw);
    if (rank != null && (rank < 1 || rank > 7)) rank = null;

    const tags = (g("patternTags").value || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    return {
      title: g("title").value.trim(),
      status: g("status").value,
      rank,
      creatorUsername: g("creatorUsername").value.trim(),
      sourceMode: g("sourceMode").value,
      platformSlot: g("platformSlot").value,
      refLink: g("refLink").value.trim(),
      localClipPath: g("localClipPath").value.trim(),
      patternTags: tags,
      hookType: g("hookType").value.trim(),
      macros: {
        kcal: numOrNull(g("kcal").value),
        proteinG: numOrNull(g("proteinG").value),
        note: g("macroNote").value.trim()
      },
      cutFit: !!g("cutFit").checked,
      timeMinutes: numOrNull(g("timeMinutes").value),
      difficultyOnCam: g("difficultyOnCam").value.trim(),
      shootDurationSec: numOrNull(g("shootDurationSec").value),
      postWindow: g("postWindow").value.trim(),
      performance48h: g("performance48h").value.trim() || null,
      performance7d: g("performance7d").value.trim() || null,
      shopping: g("shopping").value,
      kochkarte: g("kochkarte").value,
      drehbrief: g("drehbrief").value,
      caption: g("caption").value,
      captionHookAlt: g("captionHookAlt").value.trim(),
      killReason: g("killReason") ? g("killReason").value.trim() || null : null
    };
  }

  function saveFromForm(e) {
    e.preventDefault();
    const data = readForm();
    if (!data.title) return;

    // Auto-promote hint: if status is PT and user set macros/cutFit, suggest Einkauf
    // We don't force — but if they already chose Einkauf and have macros, it's drehbereit.
    if (data.status === "Kill" && !data.killReason) {
      document.getElementById("cardModal").close();
      openKill(editingId);
      // stash form data temporarily
      window.__pendingCardData = data;
      return;
    }

    if (editingId) {
      const idx = state.cards.findIndex((c) => c.id === editingId);
      if (idx >= 0) {
        const prev = state.cards[idx];
        state.cards[idx] = {
          ...prev,
          ...data,
          killReason: data.status === "Kill" ? data.killReason || prev.killReason : null,
          updatedAt: nowIso()
        };
      }
    } else {
      const card = { ...emptyCard(), ...data, updatedAt: nowIso() };
      state.cards.push(card);
    }
    save();
    document.getElementById("cardModal").close();
    render();
  }

  function openKill(id) {
    pendingKillId = id;
    document.getElementById("killReasonInput").value = "";
    document.getElementById("killModal").showModal();
  }

  function confirmKill(e) {
    e.preventDefault();
    const reason = document.getElementById("killReasonInput").value.trim();
    if (!reason) return;
    const id = pendingKillId;
    if (id) {
      const card = state.cards.find((c) => c.id === id);
      if (card) {
        card.status = "Kill";
        card.killReason = reason;
        card.updatedAt = nowIso();
      }
    } else if (window.__pendingCardData) {
      const data = window.__pendingCardData;
      window.__pendingCardData = null;
      if (editingId) {
        const idx = state.cards.findIndex((c) => c.id === editingId);
        if (idx >= 0) {
          state.cards[idx] = {
            ...state.cards[idx],
            ...data,
            status: "Kill",
            killReason: reason,
            updatedAt: nowIso()
          };
        }
      } else {
        state.cards.push({
          ...emptyCard(),
          ...data,
          status: "Kill",
          killReason: reason,
          updatedAt: nowIso()
        });
      }
    }
    save();
    document.getElementById("killModal").close();
    document.getElementById("cardModal").close();
    pendingKillId = null;
    render();
  }

  function deleteCard() {
    if (!editingId) {
      document.getElementById("cardModal").close();
      return;
    }
    if (!confirm("Karte wirklich löschen?")) return;
    state.cards = state.cards.filter((c) => c.id !== editingId);
    save();
    document.getElementById("cardModal").close();
    render();
  }

  // ——— Shopping ———
  function buildShoppingList() {
    const lines = [];
    const seen = new Map();
    state.cards
      .filter((c) => SHOP_STATUSES.has(c.status))
      .forEach((c) => {
        lines.push(`## ${c.title || "Ohne Titel"} (${c.status})`);
        const items = (c.shopping || "")
          .split(/\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (!items.length) {
          lines.push("(keine Shopping-Zeilen)");
        } else {
          items.forEach((item) => {
            lines.push("- " + item);
            const key = item.toLowerCase();
            seen.set(key, (seen.get(key) || 0) + 1);
          });
        }
        lines.push("");
      });
    if (!lines.length) return "Keine Karten in Einkauf / Gedreht / Caption final.";
    const agg = ["## Aggregat (dedup-Hinweis)", ""];
    [...seen.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "de"))
      .forEach(([k, n]) => {
        // show original-ish: find first matching line
        const sample = state.cards
          .filter((c) => SHOP_STATUSES.has(c.status))
          .flatMap((c) => (c.shopping || "").split(/\n/))
          .map((l) => l.trim())
          .find((l) => l.toLowerCase() === k);
        agg.push(`- ${sample || k}${n > 1 ? ` (×${n})` : ""}`);
      });
    return lines.join("\n") + "\n" + agg.join("\n");
  }

  function openShop() {
    document.getElementById("shopList").textContent = buildShoppingList();
    document.getElementById("shopModal").showModal();
  }

  // ——— Import / Export ———
  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `content-pipeline-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const cards = Array.isArray(parsed.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : null;
        if (!cards) throw new Error("Ungültiges Format");
        if (!confirm(`Import: ${cards.length} Karten ersetzen die aktuelle Board-Daten?`)) return;
        state = { cards };
        save();
        render();
      } catch (err) {
        alert("Import fehlgeschlagen: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ——— Wire up ———
  function init() {
    load();
    render();

    document.getElementById("btnNew").addEventListener("click", () => openEdit(null));
    document.getElementById("btnExport").addEventListener("click", exportJson);
    document.getElementById("importFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importJson(f);
      e.target.value = "";
    });
    document.getElementById("statusFilter").addEventListener("change", renderKanban);
    document.getElementById("btnShopping").addEventListener("click", openShop);

    document.getElementById("cardForm").addEventListener("submit", saveFromForm);
    document.getElementById("btnCloseModal").addEventListener("click", () => document.getElementById("cardModal").close());
    document.getElementById("btnCancel").addEventListener("click", () => document.getElementById("cardModal").close());
    document.getElementById("btnDelete").addEventListener("click", deleteCard);
    document.getElementById("btnKill").addEventListener("click", () => {
      if (editingId) openKill(editingId);
      else {
        // new card — need title at least; collect form then kill
        try {
          window.__pendingCardData = readForm();
        } catch (_) {
          window.__pendingCardData = emptyCard();
        }
        editingId = null;
        openKill(null);
      }
    });

    document.getElementById("killForm").addEventListener("submit", confirmKill);
    document.getElementById("btnCloseKill").addEventListener("click", () => document.getElementById("killModal").close());
    document.getElementById("btnCancelKill").addEventListener("click", () => document.getElementById("killModal").close());

    document.getElementById("btnCloseShop").addEventListener("click", () => document.getElementById("shopModal").close());
    document.getElementById("btnCloseShop2").addEventListener("click", () => document.getElementById("shopModal").close());
    document.getElementById("btnCopyShop").addEventListener("click", async () => {
      const text = document.getElementById("shopList").textContent;
      try {
        await navigator.clipboard.writeText(text);
        alert("Kopiert.");
      } catch {
        prompt("Kopieren:", text);
      }
    });
  }

  init();
})();
