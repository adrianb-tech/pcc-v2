// ==UserScript==
// @name         PCC v1 — Hand
// @version      0.1.1
// @description  v1 Hand, slice 4: the ONLY writer. Two entry points: copy to clipboard (tile click, S) and H fill from his previous note (CNR/Saints only). Never gathers, never decides red, never writes a chart value into a note. Copy-only, he pastes.
// @match        https://*.pointclickcare.com/*
// @match        https://*.pointclickcare.ca/*
// @run-at       document-end
// @grant        none
// ==/UserScript==
//
// v1 Hand — slice 4: the only writer. Architecture: PCC-ARCHITECTURE.md §7.
// Spec: PCC-SPEC.md §3.7, §5.
//
// Two entry points, nothing else:
//   (a) COPY to clipboard — tile click and S. The copy value comes from
//       the Brain's packet (tmTileChart), the SAME fact the tile displays
//       — display and copy value from the same data, never a separate
//       feed or attribute (the medsFill staleness fix, structural).
//       Refuses when the packet is missing, the patient doesn't match,
//       or the value isn't loaded yet (never copies "not loaded" or "—").
//   (b) H FILL from his PREVIOUS NOTE (CNR/Saints only) — fills the HPI /
//       MSE / Impression textareas from the history popup
//       (questioncompare.jsp), with the patientMatches check (refuses
//       when the patient doesn't match). It does NOT plant the skeleton
//       anchors ("HPI xx", "Allergies: xx", "Per Chart, BIMS: xx",
//       "Medical Hx xx", "Family/Social Hx", "Psych meds" — H never
//       plants these; the anchors come from his forms). It fills ONLY
//       what his previous note said, into the matching field, on his
//       keypress. The HPI header age is rewritten from the packet's
//       ageSex (patient proven via the Brain's patientId() + packet key
//       — the old normalizeHpiHeader never fired on a follow-up form
//       because it needed __tmGather.key() to start with 'chart:',
//       which never happens on a form; the v1 fix uses the packet).
//
// The Hand never gathers, never decides red, never writes a chart
// value into his note, never auto-writes, never queues. Copy-only:
// he pastes. F14's Save click lives in Keys (a dispatch, not a write
// to a note field).
//
// No timers, no pollers, no intervals, no MutationObservers. No green
// flash on fill (the old 800ms setTimeout flash is dropped — no-timer
// law). Refusals are recorded in __tmHandV1.lastCopy / lastFill
// (rig-readable) + console.warn; there is no toast (no timers).
// No S confirmation badge (the old flashCopied used setTimeout; the
// paste itself is the confirmation).

(function () {
  'use strict';

  var VERSION = '0.1.1';

  // The three H sections (HPI / MSE / Impression) — the only question
  // keys H ever fills. The history popup is questioncompare.jsp.
  var H_KEYS = ['Cust_2_I_2', 'Cust_2_II_1', 'Cust_2_II_5'];
  var lastCopy = null;   // {ok, tile, value?, reason?} — rig-readable
  var lastFill = null;   // {ok, filled:[], reason?} — rig-readable

  // ---- Brain access (read-only) ----
  function brain() { try { return window.__tmBrainV1 || null; } catch (e) { return null; } }
  function packet() { try { var b = brain(); return b ? b.packet() : null; } catch (e) { return null; } }
  function patientId() { try { var b = brain(); return b ? b.patientId() : null; } catch (e) { return null; } }
  function patientMatches(id) { try { var b = brain(); return b ? b.patientMatches(id) : false; } catch (e) { return false; } }

  // The packet is this page's patient only when its key matches the
  // Brain's patientId() (the mapping-resolved chart number). A packet
  // from another patient, or no packet at all, refuses every write.
  function packetIsMine(p) {
    if (!p || !p.key) return false;
    return patientMatches(p.key);
  }

  // ================================================================
  // COPY — clipboard only.
  // ================================================================
  function copyText(text) {
    if (typeof text !== 'string' || !text) return Promise.resolve(false);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
          return copyTextFallback(text);
        });
      }
    } catch (e) {}
    return Promise.resolve(copyTextFallback(text));
  }
  function copyTextFallback(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      try { ta.remove(); } catch (e2) {}
      return !!ok;
    } catch (e) { return false; }
  }
  function recordCopy(ok, tile, value, reason) {
    lastCopy = { ok: !!ok, tile: tile, value: ok ? value : null, reason: ok ? null : (reason || 'refused'), at: Date.now() };
    if (!ok) { try { console.warn('[PCC v1 Hand] copy refused (' + tile + '): ' + (reason || '')); } catch (e) {} }
    return !!ok;
  }
  // The copy value for a tile, mirroring the Brain's buildTile exactly
  // (same packet fact the tile displays). Returns null when there is
  // nothing safe to copy (not loaded / empty / no packet / wrong patient).
  function tileCopyValue(p, tile) {
    if (!p) return null;
    switch (tile) {
      case 'psychMeds':
        if (!p.meds || !p.meds.loaded || !p.meds.value) return null;
        return p.meds.value;
      case 'diagnoses':
        if (!p.dx || !p.dx.value) return null;
        return p.dx.value;
      case 'room':
        if (!p.room || !p.room.value) return null;
        return p.room.value;
      case 'weight':
        if (!p.weight || !p.weight.value) return null;
        return p.weight.value;
      case 'bims':
        if (p.bims && p.bims.value) return p.bims.value;
        return 'NA'; // no BIMS score at all from the chart -> NA (his ruling)
      case 'ageSex':
        if (!p.ageSex || !p.ageSex.value) return null;
        return p.ageSex.value;
      case 'allergies':
        if (!p.allergies || p.allergies.value === undefined || p.allergies.value === null || p.allergies.value === '') return null;
        return p.allergies.value;
      case 'relationships':
        if (!p.rel || !p.rel.value) return null;
        return p.rel.value;
      case 'reentry': {
        if (!p.readmit) return null;
        var parts = [];
        if (p.readmit.reentry) parts.push('Re-entry: ' + p.readmit.reentry);
        if (p.readmit.initial) parts.push('Initial: ' + p.readmit.initial);
        if (p.readmit.discharge) parts.push('Discharge: ' + p.readmit.discharge);
        if (!parts.length) return null;
        return parts.join('\n');
      }
      default:
        return null;
    }
  }
  function copyTile(tile) {
    var p = packet();
    if (!p) return recordCopy(false, tile, null, 'no packet (Brain has not published for this patient)');
    if (!packetIsMine(p)) return recordCopy(false, tile, null, 'packet is not this page\u2019s patient');
    var value = tileCopyValue(p, tile);
    if (value === null || value === undefined || value === '') {
      return recordCopy(false, tile, null, 'nothing to copy (not loaded or empty — never copies "not loaded" or "\u2014")');
    }
    copyText(value);
    return recordCopy(true, tile, value, null);
  }
  // S — copy name + room (name + tab + room, the old Extractors shape).
  // v0.1.1: the name is read LIVE from this page, never from the
  // packet (Rest VETO 2026-11-24 — the Brain never holds a resident
  // name, so the packet has no name field). Chart pages: the resident
  // header ("Last, First (BC...)"). Form pages: #clientName
  // ("Name (chart number)", verified in the TREE-0616 form capture).
  // The room still comes from the packet (same patient, via the
  // packetIsMine check). Refuses only when no name is on this page
  // or the room is missing from the packet. The name is held only in
  // a local variable for this one copy — never stored.
  function liveName() {
    // Form pages: #clientName ("Name (chart number)").
    try {
      var cn = document.getElementById('clientName');
      if (cn) {
        var tx = (cn.textContent || '').replace(/\s+/g, ' ').trim();
        if (tx) {
          var m = tx.match(/^(.*?)\s*\(\s*[A-Za-z]{0,5}\d{3,}\s*\)\s*$/);
          var nm = m ? m[1].trim() : tx;
          if (nm && nm.length >= 3 && nm.length <= 70) return nm;
        }
      }
    } catch (e) {}
    // Chart pages: the resident header ("Last, First (BC...)").
    // Same roots + length window + "clinical" skip as the Brain's
    // chartDigitsFromHeader; the name is group 1 of Extractors'
    // proven residentLastFirst regex.
    var roots = [];
    try {
      var hdr = document.getElementById('residentHeader') ||
                document.getElementById('mainPageHeader') ||
                document.getElementById('slHeader');
      if (hdr) roots.push(hdr);
    } catch (e) {}
    roots.push(document);
    for (var ri = 0; ri < roots.length; ri++) {
      var els;
      try { els = roots[ri].querySelectorAll('span, div, h1, h2, h3, td, a, b, strong'); }
      catch (e) { continue; }
      for (var i = 0; i < els.length; i++) {
        var t;
        try { t = (els[i].textContent || '').replace(/\s+/g, ' ').trim(); }
        catch (e) { continue; }
        if (t.length > 70 || t.length < 5) continue;
        if (/^clinical\s/i.test(t)) continue;
        var nm2 = t.match(/^([A-Za-z][A-Za-z'’.\-]+(?:\s+[A-Za-z][A-Za-z'’.\-]+)?\s*,\s*[A-Za-z][A-Za-z'’.\- ]+?)\s*\(\s*[A-Za-z]{0,5}\d{3,}\s*\)/);
        if (nm2) return nm2[1].replace(/\s+/g, ' ').trim();
      }
    }
    return null;
  }
  function copyNameRoom() {
    var p = packet();
    if (!p) return recordCopy(false, 'nameRoom', null, 'no packet (Brain has not published for this patient)');
    if (!packetIsMine(p)) return recordCopy(false, 'nameRoom', null, 'packet is not this page\u2019s patient');
    var name = liveName();
    var room = (p.room && p.room.value) || null;
    if (!name || !room) return recordCopy(false, 'nameRoom', null, 'name not on this page or room missing from the packet');
    var value = name + '\t' + room;
    copyText(value);
    return recordCopy(true, 'nameRoom', value, null);
  }
  // Tile clicks: delegated on document, so load order vs the Brain
  // doesn't matter (the Brain plants the band after the packet
  // settles; the Hand's listener is already there).
  function armTileClicks() {
    try {
      document.addEventListener('click', function (e) {
        try {
          var t = e.target;
          if (!t || !t.closest) return;
          var tile = t.closest('.tm-v1-tile');
          if (!tile) return;
          var key = tile.getAttribute('data-tile');
          if (!key) return;
          copyTile(key);
        } catch (err) {}
      }, true);
    } catch (e) {}
  }

  // ================================================================
  // H FILL — from his PREVIOUS NOTE (CNR/Saints only).
  // Ported from CNR/Saints Keys fillFromHistory, with the patient
  // check + facility gate via the Brain's packet, and the HPI header
  // fix (packet ageSex, not __tmGather.key()).
  // ================================================================
  function visible(el) {
    try {
      if (!el || !el.getClientRects || !el.getClientRects().length) return false;
      var cs = null;
      try { cs = (el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView : window).getComputedStyle(el); }
      catch (e) { cs = window.getComputedStyle(el); }
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    } catch (e) { return false; }
  }
  function allDocs() {
    var docs = [];
    try {
      var top = window.top || window;
      (function collect(win) {
        try { if (win.document) docs.push(win.document); } catch (e) {}
        try {
          var frs = win.frames;
          for (var i = 0; i < frs.length; i++) { try { collect(frs[i]); } catch (e2) {} }
        } catch (e3) {}
      })(top);
    } catch (e) {}
    if (!docs.length) docs.push(document);
    return docs;
  }
  function discoverHistSections() {
    var out = [];
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var links = docs[d].querySelectorAll('a.history');
        for (var i = 0; i < links.length; i++) {
          var href = links[i].getAttribute('href') || '';
          if (href.indexOf('questioncompare.jsp') === -1) continue;
          if (!visible(links[i])) continue;
          // The href is a javascript:openPopup('...questioncompare.jsp?
          // ESOLquestionkey=Cust_2_I_2...') string, not a plain URL.
          var qm = href.match(/ESOLquestionkey=([^&'"]+)/);
          if (!qm) continue;
          var qkey = qm[1];
          // SCOPE: only the three main keys (HPI / MSE / Impression).
          // The old code had label fallbacks promoting a non-main key
          // when its row label said MSE/HPI/Impression; v1 does not
          // carry them (no capture proves a form whose keys differ —
          // if the keys differ, H fills nothing and records it).
          if (H_KEYS.indexOf(qkey) === -1) continue;
          var ta = docs[d].getElementById('link' + qkey) || docs[d].querySelector('textarea[name="' + qkey + '"]');
          if (!ta || !visible(ta)) continue;
          out.push({ qkey: qkey, href: href, ta: ta });
        }
      }
    } catch (e) {}
    return out;
  }
  // The history popup is Windows-1252 encoded; decode UTF-8-fatal
  // first, fall back to Windows-1252 (the old code's exact behavior).
  function decodeHistory(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) {
      try { return new TextDecoder('windows-1252').decode(buf); }
      catch (e2) { return ''; }
    }
  }
  function extractLatestResponse(html) {
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var tas = doc.querySelectorAll('textarea[readonly]');
      for (var i = 0; i < tas.length; i++) {
        var v = (tas[i].value || '').trim();
        if (v.length > 20) return v;
      }
      var all = doc.querySelectorAll('textarea');
      for (var j = 0; j < all.length; j++) {
        var v2 = (all[j].value || '').trim();
        if (v2.length > 20) return v2;
      }
    } catch (e) {}
    return null;
  }
  // Rewrite the "HPI <age>" header from the packet's ageSex — the
  // history's age is stale (the age at the last note), the chart's is
  // current. Patient proven by the caller (packet.key === patientId()).
  function normalizeHpiHeader(text, ageSex) {
    try {
      if (!ageSex) return text;
      return String(text).replace(/^HPI\s+\d{1,3}[MF]\b/i, 'HPI ' + ageSex);
    } catch (e) { return text; }
  }
  function recordFill(ok, filled, reason) {
    lastFill = { ok: !!ok, filled: filled || [], reason: ok ? null : (reason || 'refused'), at: Date.now() };
    if (!ok) { try { console.warn('[PCC v1 Hand] H fill refused: ' + (reason || '')); } catch (e) {} }
    return lastFill;
  }
  // Returns false SYNCHRONOUSLY when a gate refuses (Keys records the
  // refusal); otherwise returns a Promise resolving to the fill record
  // (the fetches are async — the history popups are fetched, never
  // pre-loaded). The sections fill as their fetches resolve; each fill
  // dispatches input + change on its textarea.
  function fillFromHistory() {
    var p = packet();
    if (!p) { recordFill(false, [], 'no packet (Brain has not published for this patient)'); return false; }
    if (!packetIsMine(p)) { recordFill(false, [], 'packet is not this page\u2019s patient'); return false; }
    var fac = p.facility || null;
    if (fac !== 'cnr' && fac !== 'saints') { recordFill(false, [], 'H fills only at CNR/Saints (this page: ' + (fac || 'unknown') + ')'); return false; }
    var sections = discoverHistSections();
    if (!sections.length) { recordFill(false, [], 'no history sections on this page'); return false; }
    var ageSex = (p.ageSex && p.ageSex.value) || null;
    var filled = [];
    var done = sections.map(function (sec) {
      // Extract the real URL from the javascript:openPopup('...') href.
      var um = (sec.href || '').match(/openPopup\('([^']+)'/);
      var url = um ? um[1] : sec.href;
      url += (url.indexOf('?') !== -1 ? '&' : '?') + '_=' + Date.now();
      return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) { return decodeHistory(buf); })
        .then(function (html) {
          var resp = extractLatestResponse(html);
          if (!resp) return null;
          if (sec.qkey === 'Cust_2_I_2') resp = normalizeHpiHeader(resp, ageSex);
          try {
            sec.ta.value = resp;
            sec.ta.dispatchEvent(new Event('input', { bubbles: true }));
            sec.ta.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (e) { return null; }
          filled.push(sec.qkey);
          return sec.qkey;
        })
        .catch(function () { return null; });
    });
    var result = Promise.all(done).then(function () {
      if (!filled.length) return recordFill(false, [], 'history fetched but no section had a response to fill');
      return recordFill(true, filled, null);
    });
    // The synchronous return is the promise; Keys treats a non-false
    // return as "started". The settled record lands in lastFill.
    return result;
  }

  // ---- init ----
  armTileClicks();

  // Introspection (read-only; Keys + the rig read these).
  window.__tmHandV1 = {
    version: VERSION,
    copyTile: copyTile,
    copyNameRoom: copyNameRoom,
    fillFromHistory: fillFromHistory,
    lastCopy: function () { return lastCopy; },
    lastFill: function () { return lastFill; }
  };
})();
