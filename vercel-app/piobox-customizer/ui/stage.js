// The interactive garment stage: photo + print-area outlines + draggable layers.
import { STAGE_PAD_FRAC } from "../core/placements.js";
import { ACCEPT_ATTR } from "../core/artwork.js";
import { svg } from "./dom.js";
import { I } from "./icons.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const HANDLES = [
  { key: "tl", cls: "pc-handle--tl", cursor: "nwse-resize" }, { key: "tr", cls: "pc-handle--tr", cursor: "nesw-resize" },
  { key: "bl", cls: "pc-handle--bl", cursor: "nesw-resize" }, { key: "br", cls: "pc-handle--br", cursor: "nwse-resize" },
];
let measureCanvas = null;

export function createStage(cb) {
  const root = document.createElement("div"); root.className = "pc-stage-wrap";
  const stage = document.createElement("div"); stage.className = "pc-stage"; stage.setAttribute("data-keep", "");
  const photo = document.createElement("img"); photo.className = "pc-stage__photo"; photo.draggable = false; photo.style.padding = `${100 * STAGE_PAD_FRAC}%`;
  const areasHost = document.createElement("div"); areasHost.className = "pc-stage__areas";
  const guideV = document.createElement("div"); guideV.className = "pc-guide pc-guide--v"; guideV.hidden = true;
  const guideH = document.createElement("div"); guideH.className = "pc-guide pc-guide--h"; guideH.hidden = true;
  const layersHost = document.createElement("div"); layersHost.className = "pc-stage__layers";
  const empty = document.createElement("div"); empty.className = "pc-stage__empty";
  const status = document.createElement("div"); status.className = "pc-stage__status"; status.hidden = true;
  status.innerHTML = `<span class="pc-pill pc-pill--status">${I.loader}<span>Preparing your file…</span></span>`;
  const input = document.createElement("input"); input.type = "file"; input.multiple = true; input.accept = ACCEPT_ATTR; input.className = "pc-sr-only"; input.setAttribute("aria-label", "Upload artwork");
  input.onchange = () => { cb.onFiles(Array.from(input.files ?? [])); input.value = ""; };
  const caption = document.createElement("p"); caption.className = "pc-stage__caption";
  stage.append(photo, areasHost, guideV, guideH, layersHost, empty, status, input);
  root.append(stage, caption);

  let view = null;
  let areasKey = "";
  const nodes = new Map(); // layerId → { el, img, textarea? }
  let editingId = null, editScale = null;
  const drag = { current: null, pinch: null, pointers: new Map() };

  // ---- drop / drag-over --------------------------------------------------------------
  stage.addEventListener("dragover", (e) => { e.preventDefault(); stage.classList.add("is-dropping"); });
  stage.addEventListener("dragleave", () => stage.classList.remove("is-dropping"));
  stage.addEventListener("drop", (e) => { e.preventDefault(); stage.classList.remove("is-dropping"); cb.onFiles(Array.from(e.dataTransfer?.files ?? [])); });
  stage.addEventListener("pointerdown", (e) => { if (e.target === stage || e.target === photo || e.target === areasHost) { if (view?.activeLayerId) cb.onDeselect(); } });

  const stageRect = () => stage.getBoundingClientRect();
  const snapY = () => (view?.category === "Headwear" ? 0.43 : 0.38);

  function beginGesture(e, mode, layer) {
    if (view?.disabled) return;
    e.preventDefault(); e.stopPropagation();
    if (layer.id !== view.activeLayerId) cb.onSelect(layer.id);
    const rect = stageRect();
    if (mode === "move") {
      drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag.pointers.size === 2) {
        const [a, b] = [...drag.pointers.values()];
        drag.pinch = { layerId: layer.id, d0: Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)), a0: (180 * Math.atan2(b.y - a.y, b.x - a.x)) / Math.PI, width0: layer.placement.width, rot0: layer.placement.rotation };
        drag.current = null; e.currentTarget.setPointerCapture(e.pointerId); stage.classList.add("is-dragging");
        return;
      }
    }
    const cx = rect.left + layer.placement.cx * rect.width, cy = rect.top + layer.placement.cy * rect.height;
    drag.current = { mode, pointerId: e.pointerId, layerId: layer.id, startX: e.clientX, startY: e.clientY, start: layer.placement, rect, cx, cy, startDist: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)), startAngle: (180 * Math.atan2(e.clientY - cy, e.clientX - cx)) / Math.PI - layer.placement.rotation };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (mode === "move") e.currentTarget.focus?.({ preventScroll: true });
    stage.classList.add("is-dragging");
  }
  function moveGesture(e) {
    if (drag.pointers.has(e.pointerId)) drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = drag.pinch;
    if (pinch && drag.pointers.size >= 2) {
      e.preventDefault();
      const [a, b] = [...drag.pointers.values()];
      const d = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)), ang = (180 * Math.atan2(b.y - a.y, b.x - a.x)) / Math.PI;
      const width = clamp(pinch.width0 * (d / pinch.d0), 0.04, 0.92);
      let rot = pinch.rot0 + (ang - pinch.a0); rot = ((rot + 540) % 360) - 180; if (Math.abs(rot) < 3) rot = 0;
      cb.onPlacementChange(pinch.layerId, (p) => ({ ...p, width, rotation: Math.round(rot) }));
      return;
    }
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    if (d.mode === "move") {
      const dx = (e.clientX - d.startX) / d.rect.width, dy = (e.clientY - d.startY) / d.rect.height;
      let cx = clamp(d.start.cx + dx, 0.05, 0.95), cy = clamp(d.start.cy + dy, 0.05, 0.95);
      const snapX = Math.abs(cx - 0.5) < 0.012; if (snapX) cx = 0.5;
      const sy = snapY(), snapYHit = Math.abs(cy - sy) < 0.012; if (snapYHit) cy = sy;
      guideV.hidden = !snapX; guideH.hidden = !snapYHit; guideH.style.top = `${100 * sy}%`;
      cb.onPlacementChange(d.layerId, (p) => ({ ...p, cx, cy }));
      return;
    }
    if (d.mode === "resize") {
      const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
      const width = clamp(d.start.width * (dist / d.startDist), 0.04, 0.92);
      cb.onPlacementChange(d.layerId, (p) => ({ ...p, width }));
      return;
    }
    let rot = (180 * Math.atan2(e.clientY - d.cy, e.clientX - d.cx)) / Math.PI - d.startAngle;
    rot = ((rot + 540) % 360) - 180;
    for (const snap of [0, 90, -90, 45, -45]) if (Math.abs(rot - snap) < 4) { rot = snap; break; }
    cb.onPlacementChange(d.layerId, (p) => ({ ...p, rotation: Math.round(rot) }));
  }
  function endGesture(e) {
    drag.pointers.delete(e.pointerId);
    if (drag.pinch && drag.pointers.size < 2) { drag.pinch = null; stage.classList.remove("is-dragging"); }
    const d = drag.current;
    if (d?.pointerId === e.pointerId) {
      const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      const layer = view.layers.find((l) => l.id === d.layerId);
      if (d.mode === "move" && moved <= 5 && layer?.text && editingId !== d.layerId) startTextEdit(d.layerId);
      drag.current = null; stage.classList.remove("is-dragging"); guideV.hidden = true; guideH.hidden = true;
    }
  }

  // ---- text editing ----------------------------------------------------------------------
  function textMetrics(text, widthFrac) {
    const stageW = stage.getBoundingClientRect().width;
    if (stageW <= 0) return null;
    measureCanvas ??= document.createElement("canvas");
    const ctx = measureCanvas.getContext("2d"); if (!ctx) return null;
    const lines = (text.content.trim() ? text.content : "Your text").split("\n").map((l) => (l === "" ? " " : l));
    ctx.font = `${text.fontWeight} 100px ${text.fontFamily}`;
    const ascentRef = ctx.measureText("Hg").fontBoundingBoxAscent || 80;
    let widest = 1, ascent = 0, descent = 0;
    lines.forEach((l, i) => { const m = ctx.measureText(l); const w = (m.actualBoundingBoxLeft ?? 0) + (m.actualBoundingBoxRight ?? m.width); widest = Math.max(widest, w); if (i === 0) ascent = m.actualBoundingBoxAscent ?? ascentRef; descent = m.actualBoundingBoxDescent ?? 20; });
    const height = ascent + descent + (lines.length - 1) * 118, pad = 0.02 * Math.max(widest, height);
    const boxW = widest + 2 * pad, boxH = height + 2 * pad;
    const layerPx = stageW * widthFrac;
    const fontPxFit = (layerPx / boxW) * 100;
    if (editScale == null) editScale = fontPxFit / layerPx;
    let fontPx = Math.min(editScale * layerPx, fontPxFit);
    let heightFrac = ((fontPx / 100) * boxH) / stageW;
    if (heightFrac > 0.95) { fontPx *= 0.95 / heightFrac; heightFrac = 0.95; }
    return { fontPx, heightFrac, boxHeightPx: (fontPx / 100) * boxH, lineCount: lines.length };
  }
  function startTextEdit(id) {
    if (view?.disabled) return;
    const layer = view.layers.find((l) => l.id === id);
    if (!layer?.text) return;
    if (id !== view.activeLayerId) cb.onSelect(id);
    editingId = id; editScale = null;
    render();
    const n = nodes.get(id);
    n?.textarea?.focus({ preventScroll: true }); n?.textarea?.select();
  }
  function commitTextEdit(id) { if (editingId !== id) return; editingId = null; editScale = null; cb.onTextCommit(id); render(); }

  // ---- layer nodes ---------------------------------------------------------------------------
  function createLayerNode(layer) {
    const el = document.createElement("div"); el.className = "pc-layer"; el.setAttribute("role", "img"); el.tabIndex = -1;
    const img = document.createElement("img"); img.className = "pc-layer__img"; img.draggable = false; img.alt = "";
    const hover = document.createElement("div"); hover.className = "pc-layer__hover";
    const rotLine = document.createElement("div"); rotLine.className = "pc-layer__rotline";
    const rot = document.createElement("button"); rot.type = "button"; rot.className = "pc-handle pc-handle--rotate"; rot.setAttribute("aria-label", "Rotate artwork");
    const handles = HANDLES.map((hd) => { const b = document.createElement("button"); b.type = "button"; b.className = `pc-handle ${hd.cls}`; b.style.cursor = hd.cursor; b.setAttribute("aria-label", "Resize artwork"); return b; });
    el.append(img, hover, rotLine, rot, ...handles);
    const bind = (target, mode) => {
      target.addEventListener("pointerdown", (e) => { const l = current(layer.id); if (l) beginGesture(e, mode, l); });
      target.addEventListener("pointermove", moveGesture);
      target.addEventListener("pointerup", endGesture);
      target.addEventListener("pointercancel", endGesture);
    };
    bind(el, "move"); bind(rot, "rotate"); handles.forEach((b) => bind(b, "resize"));
    el.addEventListener("dblclick", (e) => { const l = current(layer.id); if (!l || view.disabled) return; if (l.text) { e.preventDefault(); e.stopPropagation(); startTextEdit(l.id); } else cb.onPlacementChange(l.id, (p) => ({ ...p, cx: 0.5 })); });
    el.addEventListener("keydown", (e) => {
      const l = current(layer.id); if (!l) return;
      const step = e.shiftKey ? 0.02 : 0.005;
      const nudge = (dx, dy) => { e.preventDefault(); cb.onPlacementChange(l.id, (p) => ({ ...p, cx: p.cx + dx, cy: p.cy + dy })); };
      if (e.key === "ArrowLeft") nudge(-step, 0); else if (e.key === "ArrowRight") nudge(step, 0); else if (e.key === "ArrowUp") nudge(0, -step); else if (e.key === "ArrowDown") nudge(0, step);
      else if (e.key === "Enter" && l.text) { e.preventDefault(); startTextEdit(l.id); }
      else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); cb.onDelete(l.id); }
    });
    el.addEventListener("wheel", (e) => { const l = current(layer.id); if (!l || l.id !== view.activeLayerId) return; e.preventDefault(); const k = Math.exp(-(0.0015 * e.deltaY)); cb.onPlacementChange(l.id, (p) => ({ ...p, width: clamp(p.width * k, 0.04, 0.92) })); }, { passive: false });
    return { el, img, handles: [rotLine, rot, ...handles] };
  }
  const current = (id) => view?.layers.find((l) => l.id === id) ?? null;

  function renderAreas() {
    const key = JSON.stringify(view.areas ?? []);
    if (key === areasKey) return;
    areasKey = key; areasHost.innerHTML = "";
    for (const a of view.areas ?? []) {
      const d = document.createElement("div"); d.className = "pc-area"; d.dataset.area = a.id;
      d.style.left = `${100 * a.rect.x}%`; d.style.top = `${100 * a.rect.y}%`; d.style.width = `${100 * a.rect.w}%`; d.style.height = `${100 * a.rect.h}%`;
      if (a.rect.w >= 0.12) { const s = document.createElement("span"); s.className = "pc-area__label"; s.textContent = a.label; d.appendChild(s); }
      areasHost.appendChild(d);
    }
  }
  function render() {
    if (!view) return;
    const activeArea = view.layers.find((l) => l.id === view.activeLayerId)?.placement.area ?? view.side;
    areasHost.querySelectorAll(".pc-area").forEach((a) => a.classList.toggle("is-active", a.dataset.area === activeArea));
    stage.classList.toggle("has-layers", view.layers.length > 0);
    const seen = new Set();
    view.layers.forEach((layer, index) => {
      seen.add(layer.id);
      let n = nodes.get(layer.id);
      if (!n) { n = createLayerNode(layer); nodes.set(layer.id, n); layersHost.appendChild(n.el); }
      if (layersHost.children[index] !== n.el) layersHost.insertBefore(n.el, layersHost.children[index] ?? null);
      const aspect = layer.naturalW > 0 && layer.naturalH > 0 ? layer.naturalH / layer.naturalW : 1;
      const active = layer.id === view.activeLayerId, editing = active && editingId === layer.id && !!layer.text;
      const metrics = editing ? textMetrics(layer.text, layer.placement.width) : null;
      const hFrac = metrics ? metrics.heightFrac : layer.placement.width * aspect;
      const s = n.el.style;
      s.left = `${(layer.placement.cx - layer.placement.width / 2) * 100}%`; s.top = `${(layer.placement.cy - hFrac / 2) * 100}%`;
      s.width = `${100 * layer.placement.width}%`; s.height = `${100 * hFrac}%`;
      s.transform = `rotate(${layer.placement.rotation}deg)`; s.zIndex = active ? 20 : 10;
      n.el.classList.toggle("is-active", active); n.el.classList.toggle("is-text", !!layer.text); n.el.classList.toggle("is-editing", editing); n.el.classList.toggle("is-compact", layer.placement.width < 0.12);
      n.el.tabIndex = active ? 0 : -1;
      n.el.setAttribute("aria-label", layer.text ? (active ? "Text: press Enter or double-click to edit; drag to move" : "Text layer, tap to select") : active ? "Your artwork: drag to move, arrow keys to nudge" : "Artwork layer, tap to select");
      n.el.title = layer.text && !editing ? "Double-click to edit" : "";
      if (n.img.getAttribute("src") !== layer.url) n.img.src = layer.url;
      n.img.style.transform = layer.placement.flipX ? "scaleX(-1)" : "";
      n.img.style.opacity = editing ? "0" : "1";
      n.handles.forEach((hd) => (hd.hidden = !active || editing));
      if (editing) {
        if (!n.textarea) {
          const ta = document.createElement("textarea"); ta.className = "pc-layer__edit"; ta.rows = 1; ta.wrap = "off"; ta.spellcheck = false; ta.placeholder = "Your text"; ta.maxLength = view.textMaxChars ?? 120; ta.setAttribute("aria-label", "Edit text, press Escape when done");
          ta.addEventListener("pointerdown", (e) => e.stopPropagation()); ta.addEventListener("pointerup", (e) => e.stopPropagation()); ta.addEventListener("dblclick", (e) => e.stopPropagation());
          ta.addEventListener("input", () => cb.onTextChange(layer.id, ta.value));
          ta.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); commitTextEdit(layer.id); } });
          ta.addEventListener("blur", () => commitTextEdit(layer.id));
          n.el.appendChild(ta); n.textarea = ta;
        }
        const ta = n.textarea;
        if (ta.value !== layer.text.content) ta.value = layer.text.content;
        ta.style.color = layer.text.color; ta.style.caretColor = layer.text.color; ta.style.fontFamily = layer.text.fontFamily; ta.style.fontWeight = String(layer.text.fontWeight);
        ta.style.fontSize = `${metrics ? metrics.fontPx : 24}px`;
        ta.style.lineHeight = metrics ? (metrics.lineCount > 1 ? `${1.18 * metrics.fontPx}px` : `${metrics.boxHeightPx}px`) : "1.2";
      } else if (n.textarea) { const ta = n.textarea; n.textarea = null; try { ta.remove(); } catch { /* already detached */ } }
    });
    for (const [id, n] of nodes) if (!seen.has(id)) { nodes.delete(id); if (editingId === id) { editingId = null; editScale = null; } try { n.el.remove(); } catch { /* already detached */ } }
    // empty state
    if (view.layers.length === 0) {
      empty.hidden = false;
      empty.innerHTML = "";
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "pc-stage__drop";
      btn.innerHTML = `${I.upload}<span class="pc-stage__drop-title"></span><span class="pc-stage__drop-hint"></span>`;
      btn.querySelector(".pc-stage__drop-title").textContent = view.empty?.title ?? "Drop your art here";
      btn.querySelector(".pc-stage__drop-hint").textContent = view.empty?.hint ?? "PNG, JPG, SVG, PDF, or AI · select one or several files · transparent art looks best";
      btn.onclick = () => openFilePicker({ multiple: true });
      empty.appendChild(btn);
    } else empty.hidden = true;
    caption.textContent = view.caption ?? ""; caption.hidden = !view.caption;
    status.hidden = !view.preparing;
  }

  function update(next) {
    view = next;
    if (photo.getAttribute("src") !== view.mockupSrc) photo.src = view.mockupSrc;
    photo.alt = view.mockupAlt ?? "";
    photo.classList.toggle("is-mirrored", !!view.mirrored);
    stage.classList.toggle("is-disabled", !!view.disabled);
    renderAreas();
    render();
  }
  function openFilePicker({ multiple = true } = {}) { input.multiple = multiple; input.click(); }
  return { el: root, update, openFilePicker, startTextEdit, isEditing: () => editingId };
}
