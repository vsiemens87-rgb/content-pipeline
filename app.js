(function () {
  "use strict";

  const STORAGE_KEY = "content_pipeline_v1";
  const SHOP_CHECKS_KEY = "content_pipeline_shop_checks";
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

  function isMobile() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function getFilter() {
    const sel = document.getElementById("statusFilter");
    return sel ? sel.value || "all" : "all";
  }

  function setFilter(value, rerender) {
    const sel = document.getElementById("statusFilter");
    if (sel) sel.value = value;
    renderStatusTabs();
    if (rerender !== false) renderKanban();
  }

  function render() {
    renderFilter();
    renderStatusTabs();
    renderRank();
    renderKanban();
  }

  function renderFilter() {
    const sel = document.getElementById("statusFilter");
    const cur = sel.value || "all";
    sel.innerHTML =
      '<option value="all">Alle Spalten</option>' +
      STATUSES.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    let next = STATUSES.includes(cur) || cur === "all" ? cur : "all";
    // Mobile: default to one column (Idee) instead of cramped "all"
    if (isMobile() && next === "all" && !sel.dataset.userPicked) {
      next = "Idee";
    }
    sel.value = next;
  }

  function renderStatusTabs() {
    const root = document.getElementById("statusTabs");
    if (!root) return;
    const cur = getFilter();
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    state.cards.forEach((c) => {
      if (counts[c.status] != null) counts[c.status]++;
    });
    const tabs = [{ value: "all", label: "Alle", count: state.cards.length }].concat(
      STATUSES.map((s) => ({ value: s, label: s, count: counts[s] }))
    );
    root.innerHTML = tabs
      .map(
        (t) => `
      <button type="button" class="status-tab" role="tab"
        data-status="${escapeHtml(t.value)}"
        aria-selected="${cur === t.value ? "true" : "false"}">
        ${escapeHtml(t.label)}<span class="tab-count">${t.count}</span>
      </button>`
      )
      .join("");
    root.querySelectorAll(".status-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sel = document.getElementById("statusFilter");
        if (sel) sel.dataset.userPicked = "1";
        setFilter(btn.dataset.status);
      });
    });
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
    const filter = getFilter();
    const mobile = isMobile();
    // Mobile + Alle → stacked full-width sections; else one column via tab
    const cols = filter === "all" ? STATUSES : [filter];
    const root = document.getElementById("kanban");
    root.classList.toggle("is-stacked", mobile && filter === "all");
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
        if (e.target.closest("[data-move]") || e.target.closest("[data-status-select]")) return;
        openEdit(el.dataset.id);
      });
    });
    root.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveStatus(btn.closest(".card").dataset.id, btn.dataset.move);
      });
    });
    root.querySelectorAll("[data-status-select]").forEach((sel) => {
      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("change", (e) => {
        e.stopPropagation();
        moveStatus(sel.closest(".card").dataset.id, sel.value);
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
        <div class="card-status-row">
          <label for="st-${escapeHtml(c.id)}">Status</label>
          <select id="st-${escapeHtml(c.id)}" data-status-select aria-label="Status ändern">
            ${STATUSES.map((s) => `<option value="${escapeHtml(s)}" ${s === c.status ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
          </select>
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
  /** Parse "140 g Hähnchen" / "Hähnchen 140g" / "2 Eier" / plain name */
  function parseShopLine(raw) {
    let s = String(raw || "").trim().replace(/^[-*•]\s*/, "");
    if (!s) return null;
    // range like 2–3 or 2-3 before unit/name
    let qty = null;
    let unit = "";
    let name = s;

    const qtyUnitName = s.match(
      /^(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*(\d+(?:[.,]\d+)?))?\s*(g|kg|ml|l|EL|TL|Stück|Stk\.?|Blätter|Blatt|Prise|Handvoll)?\s+(.+)$/i
    );
    const nameQtyUnit = s.match(
      /^(.+?)\s+(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*(\d+(?:[.,]\d+)?))?\s*(g|kg|ml|l|EL|TL|Stück|Stk\.?|Blätter|Blatt|Prise|Handvoll)?\s*$/i
    );

    if (qtyUnitName) {
      const a = parseFloat(qtyUnitName[1].replace(",", "."));
      const b = qtyUnitName[2] ? parseFloat(qtyUnitName[2].replace(",", ".")) : null;
      qty = b != null ? (a + b) / 2 : a; // ranges → mid for sum; display later as sum
      unit = (qtyUnitName[3] || "").toLowerCase().replace(/stk\.?/i, "stück");
      name = qtyUnitName[4];
    } else if (nameQtyUnit) {
      name = nameQtyUnit[1];
      const a = parseFloat(nameQtyUnit[2].replace(",", "."));
      const b = nameQtyUnit[3] ? parseFloat(nameQtyUnit[3].replace(",", ".")) : null;
      qty = b != null ? (a + b) / 2 : a;
      unit = (nameQtyUnit[4] || "").toLowerCase().replace(/stk\.?/i, "stück");
    }

    name = name
      .replace(/\s+/g, " ")
      .replace(/[()]/g, "")
      .trim();
    const key = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return { raw: s, name, key, qty, unit };
  }

  function formatQty(qty, unit) {
    if (qty == null || Number.isNaN(qty)) return "";
    const rounded = Math.abs(qty - Math.round(qty)) < 0.05 ? String(Math.round(qty)) : qty.toFixed(1).replace(".", ",");
    return unit ? `${rounded} ${unit}` : rounded;
  }

  function aggregateShoppingMap() {
    const cards = state.cards.filter((c) => SHOP_STATUSES.has(c.status));
    /** @type {Map<string, { id: string, name: string, unit: string, qty: number|null, count: number, extras: string[], label: string }>} */
    const map = new Map();

    cards.forEach((c) => {
      (c.shopping || "")
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
          const p = parseShopLine(line);
          if (!p || !p.key) return;
          const unitKey = (p.unit || "").toLowerCase();
          const mapKey = p.key + "||" + unitKey;
          const cur = map.get(mapKey);
          if (!cur) {
            map.set(mapKey, {
              id: mapKey,
              name: p.name,
              unit: p.unit || "",
              qty: p.qty,
              count: 1,
              extras: p.qty == null ? [p.raw] : [],
              label: "",
            });
          } else {
            cur.count += 1;
            if (p.qty != null && cur.qty != null && cur.unit === (p.unit || "")) {
              cur.qty += p.qty;
            } else if (p.qty != null && cur.qty == null) {
              cur.qty = p.qty;
              cur.unit = p.unit || cur.unit;
            } else if (p.qty == null) {
              cur.extras.push(p.raw);
            } else if (cur.unit !== (p.unit || "")) {
              cur.extras.push(p.raw);
            }
          }
        });
    });

    const items = [...map.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map((v) => {
        let label;
        if (v.qty != null) {
          label = `${formatQty(v.qty, v.unit)} ${v.name}`.replace(/\s+/g, " ").trim();
        } else if (v.count > 1) {
          label = `${v.name} (×${v.count})`;
        } else {
          label = v.name;
        }
        if (v.extras.length) {
          const extra = v.extras
            .filter((ex) => ex.toLowerCase() !== v.name.toLowerCase())
            .join("; ");
          if (extra) label += ` · zusätzlich: ${extra}`;
        }
        return { ...v, label };
      });

    return { cards, items };
  }

  function buildShoppingList() {
    const { cards, items } = aggregateShoppingMap();
    if (!cards.length) return "Keine Karten in Einkauf / Gedreht / Caption final.";
    if (!items.length) return "Karten vorhanden, aber keine Shopping-Zeilen.";

    const out = ["## Wochen-Einkaufsliste (aggregiert)", ""];
    items.forEach((v) => out.push("- " + v.label));

    out.push("", "## Nach Karte (Referenz)", "");
    cards.forEach((c) => {
      out.push(`### ${c.title || "Ohne Titel"} (${c.status})`);
      const lines = (c.shopping || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) out.push("(keine Shopping-Zeilen)");
      else lines.forEach((i) => out.push("- " + i));
      out.push("");
    });

    return out.join("\n");
  }

  function loadShopChecks() {
    try {
      return JSON.parse(localStorage.getItem(SHOP_CHECKS_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveShopChecks(obj) {
    localStorage.setItem(SHOP_CHECKS_KEY, JSON.stringify(obj));
  }

  function renderShopChecklist() {
    const ul = document.getElementById("shopCheckList");
    const { cards, items } = aggregateShoppingMap();
    const checks = loadShopChecks();
    if (!cards.length) {
      ul.innerHTML = '<li class="shop-item"><span class="shop-label">Keine Karten in Einkauf / Gedreht / Caption final.</span></li>';
      return;
    }
    if (!items.length) {
      ul.innerHTML = '<li class="shop-item"><span class="shop-label">Karten vorhanden, aber keine Shopping-Zeilen.</span></li>';
      return;
    }
    ul.innerHTML = items
      .map((it) => {
        const checked = !!checks[it.id];
        return `
        <li class="shop-item ${checked ? "is-checked" : ""}">
          <input type="checkbox" data-shop-id="${escapeHtml(it.id)}" ${checked ? "checked" : ""} aria-label="${escapeHtml(it.label)}" />
          <span class="shop-label">${escapeHtml(it.label)}</span>
        </li>`;
      })
      .join("");

    ul.querySelectorAll("input[data-shop-id]").forEach((input) => {
      input.addEventListener("change", () => {
        const all = loadShopChecks();
        if (input.checked) all[input.dataset.shopId] = true;
        else delete all[input.dataset.shopId];
        saveShopChecks(all);
        input.closest(".shop-item").classList.toggle("is-checked", input.checked);
      });
    });
    ul.querySelectorAll(".shop-item").forEach((li) => {
      li.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        const cb = li.querySelector("input[type=checkbox]");
        if (!cb) return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      });
    });
  }

  function openShop() {
    document.getElementById("shopList").textContent = buildShoppingList();
    renderShopChecklist();
    document.getElementById("shopModal").showModal();
  }

  function clearShopChecks() {
    saveShopChecks({});
    renderShopChecklist();
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

  function normalizeIncomingCards(cards) {
    return cards.map((c) => {
      const base = emptyCard();
      return {
        ...base,
        ...c,
        id: c.id || uid(),
        macros: { ...base.macros, ...(c.macros || {}) },
        patternTags: Array.isArray(c.patternTags)
          ? c.patternTags
          : String(c.patternTags || "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
        updatedAt: nowIso(),
      };
    });
  }

  function mergeCards(incoming, opts) {
    const weekMerge = !!(opts && opts.weekMerge);
    const existingTitles = new Set(
      state.cards.map((c) => (c.title || "").trim().toLowerCase()).filter(Boolean)
    );
    const existingIds = new Set(state.cards.map((c) => c.id));
    let added = 0;
    let skipped = 0;
    let unranked = 0;
    normalizeIncomingCards(incoming).forEach((c) => {
      const titleKey = (c.title || "").trim().toLowerCase();
      if (existingIds.has(c.id) || (titleKey && existingTitles.has(titleKey))) {
        // Week merge: if already present with a rank, clear rank so Valentin re-ranks
        if (weekMerge && titleKey) {
          const hit = state.cards.find((x) => (x.title || "").trim().toLowerCase() === titleKey);
          if (hit && hit.rank != null) {
            hit.rank = null;
            hit.status = hit.status === "Kill" ? hit.status : "Idee";
            hit.updatedAt = nowIso();
            unranked += 1;
          }
        }
        skipped += 1;
        return;
      }
      if (!c.id || existingIds.has(c.id)) c.id = uid();
      if (weekMerge) {
        c.rank = null;
        c.status = "Idee";
      }
      state.cards.push(c);
      existingIds.add(c.id);
      if (titleKey) existingTitles.add(titleKey);
      added += 1;
    });
    save();
    render();
    return { added, skipped, unranked };
  }

  function importJson(file, preferMerge) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const cards = Array.isArray(parsed.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : null;
        if (!cards) throw new Error("Ungültiges Format");
        const modeMerge =
          preferMerge ||
          parsed.mode === "merge" ||
          confirm(
            `${cards.length} Karten laden.\n\nOK = MERGEN (bestehende behalten)\nAbbrechen = Dialog für Ersetzen`
          );
        if (modeMerge) {
          // If user cancelled the confirm above when preferMerge false and mode not merge,
          // confirm returns false → fall through to replace ask
        }
        let doMerge = preferMerge || parsed.mode === "merge";
        if (!preferMerge && parsed.mode !== "merge") {
          const choice = confirm(
            `${cards.length} Karten.\n\nOK = mergen (nichts löschen)\nAbbrechen = komplett ersetzen`
          );
          doMerge = choice;
          if (!choice) {
            if (!confirm(`Wirklich alle ${state.cards.length} bestehenden Karten durch Import ersetzen?`)) return;
          }
        }
        if (doMerge) {
          const weekMerge = parsed.week || parsed.mode === "merge";
          const { added, skipped, unranked } = mergeCards(cards, { weekMerge: !!parsed.week });
          alert(`Merge fertig: ${added} neu, ${skipped} übersprungen` + (unranked ? `, ${unranked} Ranks geleert` : "") + `.`);
        } else {
          state = { cards: normalizeIncomingCards(cards) };
          save();
          render();
        }
      } catch (err) {
        alert("Import fehlgeschlagen: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  async function mergeWeekFile(url) {
    try {
      const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      const parsed = await res.json();
      const cards = Array.isArray(parsed.cards) ? parsed.cards : null;
      if (!cards) throw new Error("Keine cards[] in Datei");
      if (!confirm(`${cards.length} Ideen aus ${parsed.week || "Woche"} mergen? Bestehende Karten bleiben.`)) return;
      const { added, skipped, unranked } = mergeCards(cards, { weekMerge: true });
      alert(`Merge fertig: ${added} neu, ${skipped} übersprungen` + (unranked ? `, ${unranked} Ranks geleert` : "") + `.`);
      setFilter("Idee");
    } catch (err) {
      alert("Wochen-Import fehlgeschlagen: " + err.message);
    }
  }

  // ——— Wire up ———
  function init() {
    load();
    render();

    document.getElementById("btnNew").addEventListener("click", () => openEdit(null));
    document.getElementById("btnExport").addEventListener("click", exportJson);
    document.getElementById("importFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importJson(f, false);
      e.target.value = "";
    });
    const btnWeek = document.getElementById("btnMergeWeek");
    if (btnWeek) {
      btnWeek.addEventListener("click", () => mergeWeekFile("woche-2026-09-14-import.json"));
    }
    document.getElementById("statusFilter").addEventListener("change", () => {
      document.getElementById("statusFilter").dataset.userPicked = "1";
      renderStatusTabs();
      renderKanban();
    });
    document.getElementById("btnShopping").addEventListener("click", openShop);
    document.getElementById("btnClearShopChecks").addEventListener("click", clearShopChecks);
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderStatusTabs();
        renderKanban();
      }, 150);
    });

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
