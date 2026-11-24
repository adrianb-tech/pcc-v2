// ==UserScript==
// @name         PCC v1 — Keys
// @version      0.1.0
// @description  v1 Keys, slice 4: every keybinding, dispatched only. A search, S copy name+room (via the Hand), D popup Save, F action, H fill (via the Hand), 0 kill switch, F14 save, 1/2 TYPE filters, tab shortcuts H/P/O/N + F13, last-tab memory. Keys never gather, never decide red, never write.
// @match        https://*.pointclickcare.com/*
// @match        https://*.pointclickcare.ca/*
// @run-at       document-end
// @grant        none
// ==/UserScript==
//
// v1 Keys — slice 4: the dispatcher. Architecture: PCC-ARCHITECTURE.md §6.
// Spec: PCC-SPEC.md §3.7, §5.
//
// Every keybinding in one script, dispatched only:
//   A — focus the resident search box (topmost scored input).
//   S — copy name + room (the Hand does the writing; Keys only dispatches).
//   D — popup Save (newassess.jsp only; dead once he types or clicks into
//       a field — the heIsEditing latch, from the old consult-defaults
//       scripts). Clicks the bare 'Save' button with a mousedown/mouseup/
//       click triple (PCC ignores synthetic .click()).
//   F — the action chain (Admission Record -> assessments list edit/copy/
//       NEW -> signed-section Lock (BP) -> Progress Notes View All /
//       Resident Profile -> section view -> section edit/sign -> Next
//       Section -> form save, facility priority). One press, one action.
//   H — fill from his previous note (the Hand does the filling; Keys only
//       dispatches; form pages only — on chart pages H is the DASH tab).
//   0 — the kill switch. Works everywhere, even while typing; kills every
//       key except 0 itself, F14 (Save — the kill switch must never trap
//       him in an unsaved form), F13, and Escape.
//   F14 — typing-exempt Save (Save & Sign & Exit / Save & Exit / Save &
//       Sign & Lock & Exit, old order). Refuses silently with no Save
//       button; degrades to F when not typing and no Save button exists.
//       Blur-then-click synchronously (the old 120ms setTimeout is dropped
//       — no timers; blur handlers run synchronously on blur()).
//   1 / 2 — TYPE filter on the assessments list (1 psych, 2 BIMS). Sets
//       the option and dispatches 'change'; PCC's own onchange does the
//       async pref-save + submit. Never clicks Apply (the race that
//       bounced TYPE 3). No sticky save/restore (NOT rebuilt — frozen
//       scope; PCC saves the TYPE preference server-side natively).
//       The '3' key (MD ack, BP only) is NOT in v1 (v2).
//   Tab shortcuts — H DASH, P PROFILE, O FORMS/ASSMNTS, N PROG NOTES
//       (his ruling, 2026-11-23: they live in KEYS). F13 focuses the
//       assessments tab without navigating (his ducky split-view macro).
//       Last-tab memory (tmLastTab): saved on every tab click + key jump;
//       restored ONCE on a fresh chart open that lands on ORDERS.
//   Escape — while typing, blurs the field so letter shortcuts fire
//       (his 2026-10-30 ruling).
//
// Guards (architecture §6, the old Keys scripts): isTrusted-only, no
// modifiers (ctrl/meta/alt), no repeat, dead while typing (except F14,
// F13, 0, Escape). One shared `enabled` flag for ALL keys, including
// the tab shortcuts (the old scripts had separate flags per script).
//
// NOT in this slice: cursor placement on form open (his ruling on
// placement per note type is still owed); chained actions (he asked
// whether one keypress can do multiple steps and then said "don't do
// anything. i was just asking" — a capability question, NOT a feature).
// F badges (the visible form of F) are NOT planted here — flagged gap,
// slice 4 builds keypresses + Hand only.
//
// No timers, no pollers, no intervals, no MutationObservers. The only
// state is timestamps (debounce guards) and flags. Keys never writes
// to a note, the clipboard, or a form — that is the Hand's job.

(function () {
  'use strict';

  var VERSION = '0.1.0';

  // ================================================================
  // SETTINGS — one row per facility (architecture §6).
  // The facility comes from the Brain's packet (packet.facility);
  // unknown facility falls back to the 'boro' row's safe defaults
  // except hFill (false) and the save priority (the old F14 order).
  // ================================================================
  var SETTINGS = {
    boro:    { consultDefaults: 'BP',         typePsych: '11245', typeBims: '15630', quarterly: true,  hFill: false, popupShape: 'assessment',    savePriority: ['save & sign & exit', 'save & exit'] },
    crown:   { consultDefaults: 'Bedford/CH', typePsych: '11245', typeBims: '15630', quarterly: false, hFill: false, popupShape: 'form',          savePriority: ['save & sign & lock & exit', 'save & exit'] },
    bedford: { consultDefaults: 'Bedford/CH', typePsych: '11245', typeBims: '15630', quarterly: false, hFill: false, popupShape: 'form',          savePriority: ['save & sign & lock & exit', 'save & exit'] },
    cnr:     { consultDefaults: 'CNR/Saints', typePsych: '11245', typeBims: '15630', quarterly: false, hFill: true,  popupShape: 'opened-for-him', savePriority: ['save & sign & lock & exit', 'save & sign & exit', 'save & exit'] },
    saints:  { consultDefaults: 'CNR/Saints', typePsych: '11245', typeBims: '15630', quarterly: false, hFill: true,  popupShape: 'opened-for-him', savePriority: ['save & sign & lock & exit', 'save & sign & exit', 'save & exit'] }
  };
  // F14's old order (identical at all facilities in the old Keys
  // scripts): Save & Sign & Exit, then Save & Exit, then Save & Sign
  // & Lock & Exit. F's form-save branch uses the facility priority
  // above instead.
  var F14_SAVE_ORDER = ['save & sign & exit', 'save & exit', 'save & sign & lock & exit'];

  // ---- state (flags + debounce timestamps only — no timers) ----
  var enabled = true;          // 0 toggles; kills everything except 0/F14/F13/Escape
  var heIsEditing = false;     // D latch: set by any input/mousedown into a field; never resets per page
  var _fAt = 0;                // F one-press-one-action guard (1200ms, CNR rule)
  var lastAction = null;       // last dispatched action (rig-readable)
  var lastRefusal = null;      // last refusal + reason (rig-readable)

  // ---- Brain access (read-only) ----
  function brain() { try { return window.__tmBrainV1 || null; } catch (e) { return null; } }
  function packet() { try { var b = brain(); return b ? b.packet() : null; } catch (e) { return null; } }
  function facility() {
    try { var p = packet(); if (p && p.facility) return p.facility; } catch (e) {}
    return null;
  }
  function settingsFor(fac) { return SETTINGS[fac] || null; }
  function hand() { try { return window.__tmHandV1 || null; } catch (e) { return null; } }

  function noteAction(a) { lastAction = a; }
  function noteRefusal(a, why) { lastRefusal = { action: a, reason: why, at: Date.now() }; }

  // ================================================================
  // Shared helpers (ported from the old Keys scripts; caches dropped —
  // v1 has no badge waves, one press = one fresh scan).
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
  function docText(doc) {
    try { return (doc.body ? doc.body.innerText : '').toLowerCase(); } catch (e) { return ''; }
  }
  function pageTexts() {
    var out = [];
    var docs = allDocs();
    for (var d = 0; d < docs.length; d++) out.push({ doc: docs[d], text: docText(docs[d]) });
    return out;
  }
  function findInFrames(win, fn) {
    try { var r = fn(win.document); if (r) return r; } catch (e) {}
    try {
      var frs = win.frames;
      for (var i = 0; i < frs.length; i++) {
        try { var hit = findInFrames(frs[i], fn); if (hit) return hit; } catch (e2) {}
      }
    } catch (e3) {}
    return null;
  }
  function findByExactText(doc, text) {
    var want = String(text).toLowerCase();
    var found = [];
    try {
      var els = doc.querySelectorAll('a, button, span, div, td, li, h1, h2, h3');
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (t === want && visible(els[i])) found.push(els[i]);
      }
    } catch (e) {}
    // Prefer a real link over a container that merely contains the text.
    for (var j = 0; j < found.length; j++) if (found[j].tagName === 'A') return [found[j]];
    return found;
  }
  // PCC ignores synthetic .click() — use mousedown/mouseup/click sequence.
  function fireClick(el) {
    try {
      var opts = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
    } catch (e) {
      try { el.click(); } catch (e2) {}
    }
  }
  // Commit-before-save (his evidence, 2026-10-14): a real click first
  // blurs the field in focus — that blur is what makes PCC commit the
  // field. A synthetic click never moves focus, so the commit never ran.
  function commitBlur() {
    try {
      var docs = allDocs(), targets = [];
      for (var i = 0; i < docs.length; i++) {
        var ae = docs[i].activeElement;
        if (!ae) continue;
        var tag = ae.tagName || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) targets.push(ae);
      }
      for (var j = 0; j < targets.length; j++) { try { targets[j].blur(); } catch (e) {} }
    } catch (e) {}
  }
  // Save click: 1000ms debounce (state, not a timer), blur, then click
  // SYNCHRONOUSLY. The old 120ms setTimeout is dropped (no-timer law);
  // blur handlers run synchronously on blur(), so blur-then-click is the
  // same commit order without the timer. Live verification will confirm
  // the save commits (flagged in the slice-4 report).
  function fireSaveClick(btn) {
    try {
      var nowS = Date.now();
      if (window.__pccSaveAt && nowS - window.__pccSaveAt < 1000) return true;
      window.__pccSaveAt = nowS;
    } catch (e) {}
    commitBlur();
    fireClick(btn);
    return true;
  }
  function isEditable(t) {
    return !!(t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable));
  }
  // The D latch: any input event or mousedown INTO a text/password input
  // or textarea makes D dead for the life of the page (the popup is a
  // fresh page each time, so the latch never needs resetting).
  function armEditingLatch() {
    try {
      document.addEventListener('input', function (e) {
        try {
          var t = e.target;
          if (t && ((t.tagName === 'INPUT' && /^(text|password|search|tel|email|number)$/i.test(t.type || 'text')) || t.tagName === 'TEXTAREA')) heIsEditing = true;
        } catch (err) {}
      }, true);
      document.addEventListener('mousedown', function (e) {
        try {
          var t = e.target;
          if (t && ((t.tagName === 'INPUT' && /^(text|password|search|tel|email|number)$/i.test(t.type || 'text')) || t.tagName === 'TEXTAREA')) heIsEditing = true;
        } catch (err) {}
      }, true);
    } catch (e) {}
  }

  // ================================================================
  // A — focus the resident search box.
  // Visible, enabled, non-readOnly text/search input, scored by
  // 'resident' (3) / 'search' (2) in id/name/placeholder/aria-label/
  // title; topmost wins. Focus + select.
  // ================================================================
  function findResidentSearchBox() {
    try {
      var inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])');
      var cands = [];
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        if (!visible(inp) || inp.disabled || inp.readOnly) continue;
        var hay = ((inp.id || '') + ' ' + (inp.name || '') + ' ' +
                   (inp.placeholder || '') + ' ' + (inp.getAttribute('aria-label') || '') + ' ' +
                   (inp.title || '')).toLowerCase();
        var score = /resident/.test(hay) ? 3 : (/search/.test(hay) ? 2 : 0);
        if (score > 0) {
          var r = inp.getClientRects()[0];
          cands.push({ el: inp, score: score, top: r ? r.top : 9999 });
        }
      }
      cands.sort(function (a, b) { return (b.score - a.score) || (a.top - b.top); });
      return cands.length ? cands[0].el : null;
    } catch (e) { return null; }
  }
  function focusResidentSearch() {
    var box = findResidentSearchBox();
    if (box) {
      try { box.focus(); box.select(); noteAction('a:search'); return true; } catch (e) {}
    }
    noteRefusal('a', 'no resident search box on this page');
    return false;
  }

  // ================================================================
  // S — copy name + room. Keys only dispatches; the Hand writes.
  // ================================================================
  function handleS() {
    var h = hand();
    if (!h) { noteRefusal('s', 'Hand not loaded'); return false; }
    var ok = h.copyNameRoom();
    if (ok) noteAction('s:copy-name-room');
    else noteRefusal('s', (h.lastCopy && h.lastCopy.reason) || 'Hand refused');
    return !!ok;
  }

  // ================================================================
  // D — popup Save. Newassess popup only (the URL is the gate — the
  // old plantD was wired by the consult-defaults scripts after they
  // proved the popup identity; v1 has no popup-defaults module yet,
  // so the URL is the scope). Dead once he types or clicks into a
  // field (heIsEditing latch).
  // ================================================================
  function findPopupSave() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var els = docs[d].querySelectorAll('input[type="button"], input[type="submit"]');
        for (var i = 0; i < els.length; i++) {
          if ((els[i].value || '') === 'Save' && visible(els[i])) return els[i];
        }
      }
    } catch (e) {}
    return null;
  }
  function handleD() {
    if (location.href.indexOf('newassess.jsp') === -1) { noteRefusal('d', 'not a newassess popup'); return false; }
    if (heIsEditing) { noteRefusal('d', 'heIsEditing latch — he typed or clicked into a field'); return false; }
    var save = findPopupSave();
    if (!save) { noteRefusal('d', 'no bare Save button on this popup'); return false; }
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
    fireClick(save);
    noteAction('d:save');
    return true;
  }

  // ================================================================
  // H — fill from his previous note. Keys only dispatches; the Hand
  // fills (CNR/Saints only, patient-proven). On a form page only —
  // on chart pages 'h' is the DASH tab shortcut.
  // ================================================================
  function isFormPage() {
    try {
      if (document.querySelector('a.history[href*="questioncompare.jsp"]')) return true;
      var tas = document.querySelectorAll('textarea[name^="Cust_2_"]');
      if (tas && tas.length) return true;
    } catch (e) {}
    return false;
  }
  function handleH() {
    var h = hand();
    if (!h) { noteRefusal('h', 'Hand not loaded'); return false; }
    var res = h.fillFromHistory();
    // fillFromHistory is async (fetches the history popups); it returns
    // a promise-like {ok, ...} only after the fetches settle, or false
    // synchronously when a gate refuses. Record the synchronous refusal
    // here; the async result lands in __tmHandV1.lastFill.
    if (res === false) { noteRefusal('h', (h.lastFill && h.lastFill.reason) || 'Hand refused'); return false; }
    noteAction('h:fill-started');
    return true;
  }

  // ================================================================
  // 1 / 2 — TYPE filter on the assessments list.
  // pickTypeOption tiers (old Keys): psych = /^psych\s*:\s*consult/i,
  // else /consult form/i + /psych/i, else /psych/i; bims = /bims/i,
  // else /social service assessment/i. Within a tier a live
  // (non-retired) option wins; if all retired, the NEWEST retired
  // version wins (at Crown Heights every BIMS type is retired).
  // Sets the option + dispatches 'change' — PCC's own onchange IS the
  // navigation (async pref-save then submit). Never clicks Apply.
  // No sticky save/restore (NOT rebuilt — frozen scope).
  // ================================================================
  function findTypeSelect(doc) {
    try {
      var all = doc.querySelectorAll('select');
      for (var j = 0; j < all.length; j++) {
        var node = all[j].previousSibling, label = '';
        while (node && !label) {
          label = (node.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
          node = node.previousSibling;
        }
        if (/^TYPE:?$/i.test(label)) return all[j];
      }
      for (var k = 0; k < all.length; k++) {
        if (/consult form/i.test(all[k].textContent || '')) return all[k];
      }
    } catch (e) {}
    return null;
  }
  function pickTypeOption(sel, kind) {
    function tier(tests) {
      var opts = sel.options, i, t, m, bestRetired = null, bestV = -1;
      for (i = 0; i < opts.length; i++) {
        t = opts[i].text || '';
        var ok = tests.every(function (re) { return re.test(t); });
        if (!ok) continue;
        if (!/retired/i.test(t)) return opts[i];
        m = t.match(/\bV\s*(\d+)/i);
        var v = m ? +m[1] : 0;
        if (v > bestV) { bestV = v; bestRetired = opts[i]; }
      }
      return bestRetired;
    }
    try {
      if (kind === 'psych') {
        return tier([/^psych\s*:\s*consult/i]) || tier([/consult form/i, /psych/i]) || tier([/psych/i]);
      }
      if (kind === 'bims') {
        return tier([/bims/i]) || tier([/social service assessment/i]);
      }
    } catch (e) {}
    return null;
  }
  function setTypeFilter(doc, kind) {
    try {
      var sel = findTypeSelect(doc);
      if (!sel) return false;
      var picked = pickTypeOption(sel, kind);
      if (!picked) return false;
      for (var j = 0; j < sel.options.length; j++) sel.options[j].selected = (sel.options[j] === picked);
      try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e2) {}
      return true;
    } catch (e) {}
    return false;
  }
  function handleNumberKey(k) {
    var acted = findInFrames(window.top || window, function (doc) {
      if (!findTypeSelect(doc)) return null;
      return setTypeFilter(doc, k === '1' ? 'psych' : 'bims') ? true : null;
    });
    if (acted) noteAction(k === '1' ? '1:psych-filter' : '2:bims-filter');
    else noteRefusal(k, 'no TYPE select on this page');
    return !!acted;
  }

  // ================================================================
  // F — the action chain (merged BP + Bedford/CH + CNR/Saints).
  // Priority: Admission Record -> tab-page guard -> CNR/Saints section
  // list (SIGN / all-signed / VIEW) -> assessments list (edit / copy /
  // NEW) -> signed-section Lock (BP) -> Progress Notes (View All /
  // Resident Profile) -> section view -> section edit -> Next Section
  // -> form save (facility priority). One press, ONE action (his
  // 2026-10-14 rule: a double-fire raced his signing onto PCC's error
  // page). Single scan per press — no TTL cache (the old 1500ms cache
  // served badge waves; v1 has no badge waves).
  // ================================================================
  function findAdmissionRecord() {
    return findInFrames(window.top || window, function (doc) {
      var c = findByExactText(doc, 'ADMISSION RECORD');
      if (c.length) return c[0];
      var f = findByExactText(doc, 'FACE SHEET');
      return f[0] || null;
    });
  }
  function findResidentProfileLink() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var links = docs[d].querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
          var t = (links[i].textContent || '').toLowerCase().trim();
          if (t.indexOf('resident profile') !== -1 && visible(links[i])) return links[i];
        }
      }
    } catch (e) {}
    return null;
  }
  function findNewAssessmentButton() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var btns = docs[d].querySelectorAll('input[type="button"][value="New"]');
        for (var i = 0; i < btns.length; i++) {
          var oc = btns[i].getAttribute('onclick') || '';
          if (oc.indexOf('launchNewAssessment') !== -1 && visible(btns[i])) return btns[i];
        }
      }
    } catch (e) {}
    return null;
  }
  function findViewLink() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var links = docs[d].querySelectorAll('a');
        for (var j = 0; j < links.length; j++) {
          var lt = (links[j].textContent || '').trim().toLowerCase();
          if (lt === 'view' && visible(links[j])) {
            // Skip if inside a Progress Notes table (has Effective Date column)
            try {
              var tbl = links[j].closest('table');
              if (tbl) {
                var th = (tbl.innerText || '').toLowerCase();
                if (th.indexOf('effective date') !== -1) continue;
                if (th.indexOf('external facilities') !== -1) continue;
              }
            } catch (e2) {}
            return links[j];
          }
        }
      }
    } catch (e) {}
    return null;
  }
  function findViewAllButton() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var exact = docs[d].querySelector('[data-testid="pn-view-all-btn"]');
        if (exact && visible(exact)) return exact;
        var els = docs[d].querySelectorAll('a, button, input[type="button"], input[type="submit"]');
        for (var i = 0; i < els.length; i++) {
          var label = ((els[i].value || '') + ' ' + (els[i].textContent || '')).replace(/\s+/g, ' ').trim().toLowerCase();
          if (label.indexOf('view all') !== -1 && visible(els[i])) return els[i];
        }
        var all = docs[d].querySelectorAll('div, span');
        for (var k = 0; k < all.length; k++) {
          if (all[k].children && all[k].children.length) continue;
          var t = (all[k].textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
          if (t === 'view all' && visible(all[k])) return all[k];
        }
      }
    } catch (e) {}
    return null;
  }
  function findSectionEditLink() {
    try {
      var pts = pageTexts();
      for (var d = 0; d < pts.length; d++) {
        var txt = pts[d].text;
        // Must be a section list page (has Section/Description headers, not the assessments/forms table)
        if (txt.indexOf('in progress') !== -1 && (txt.indexOf('assessment date') !== -1 || txt.indexOf('form date') !== -1)) continue;
        var links = pts[d].doc.querySelectorAll('a');
        for (var j = 0; j < links.length; j++) {
          var lt = (links[j].textContent || '').trim().toLowerCase();
          if (lt === 'edit' && visible(links[j])) {
            var row = links[j].closest('tr');
            if (row) {
              var rt = (row.innerText || '').toLowerCase();
              if (rt.indexOf('psych') !== -1) return links[j];
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }
  function findNextSection() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var els = docs[d].querySelectorAll('input[type="button"], input[type="submit"], button');
        for (var i = 0; i < els.length; i++) {
          var label = ((els[i].value || '') + ' ' + (els[i].textContent || '')).replace(/\s+/g, ' ').trim().toLowerCase();
          if (label === 'next section' && visible(els[i])) return els[i];
        }
      }
    } catch (e) {}
    return null;
  }
  function findLockButton() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var els = docs[d].querySelectorAll('input[type="button"], input[type="submit"], button');
        for (var i = 0; i < els.length; i++) {
          var label = ((els[i].value || '') + ' ' + (els[i].textContent || '')).replace(/\s+/g, ' ').trim().toLowerCase();
          if (label === 'lock' && visible(els[i])) return els[i];
        }
      }
    } catch (e) {}
    return null;
  }
  function findSaveByLabel(label) {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var els = docs[d].querySelectorAll('input[type="button"], input[type="submit"], button');
        for (var i = 0; i < els.length; i++) {
          var lb = ((els[i].value || '') + ' ' + (els[i].textContent || '')).replace(/\s+/g, ' ').trim().toLowerCase();
          if (lb === label && visible(els[i])) return els[i];
        }
      }
    } catch (e) {}
    return null;
  }
  function findSaveByPriority(order) {
    for (var i = 0; i < order.length; i++) {
      var hit = findSaveByLabel(order[i]);
      if (hit) return hit;
    }
    return null;
  }
  function isResidentListPage() {
    try {
      var ts = pageTexts();
      for (var d = 0; d < ts.length; d++) {
        var t = ts[d].text;
        if (t.indexOf('search current residents') !== -1) return true;
        if (t.indexOf('all residents') !== -1 && t.indexOf('waiting list') !== -1) return true;
      }
    } catch (e) {}
    return false;
  }
  function isProgressNotesPage() {
    try {
      var pts = pageTexts();
      for (var d = 0; d < pts.length; d++) {
        try { if (pts[d].doc.querySelector('[data-testid="pn-view-all-btn"], [data-testid="pn-add-progress-note-btn"]')) return true; } catch (e5) {}
        var t = pts[d].text;
        if (t.indexOf('view all') !== -1) {
          if (t.indexOf('progress note') !== -1 || t.indexOf('effective date') !== -1) return true;
        }
        if (t.indexOf('add progress note') !== -1) return true;
        if (t.indexOf('progress notes - view all') !== -1) return true;
      }
    } catch (e) {}
    return false;
  }
  function isFormsListPage() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        try {
          var t = docText(docs[d]);
          if ((t.indexOf('forms list') !== -1 || t.indexOf('in progress list') !== -1) &&
              t.indexOf('form type') !== -1 && t.indexOf('created by') !== -1) return true;
        } catch (e2) {}
      }
    } catch (e) {}
    return false;
  }
  // CNR/Saints section list page: "Sign All" toolbar + section table with Signed By.
  function isSectionListPage() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        try {
          var t = docText(docs[d]);
          if (t.indexOf('signed by') !== -1 && t.indexOf('signed date') !== -1) return true;
          if (t.indexOf('signed by') !== -1) {
            var els = docs[d].querySelectorAll('input[type="button"], input[type="submit"], button');
            for (var i = 0; i < els.length; i++) {
              var v = (((els[i].value || '') + ' ' + (els[i].textContent || '')).replace(/\s+/g, ' ').trim().toLowerCase());
              if (v === 'sign all') return true;
            }
          }
        } catch (e2) {}
      }
    } catch (e) {}
    return false;
  }
  function findSectionSignLink() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var fallback = null;
        try {
          var links = docs[d].querySelectorAll('a');
          for (var j = 0; j < links.length; j++) {
            var lt = (links[j].textContent || '').trim().toLowerCase();
            if (lt !== 'sign' || !visible(links[j])) continue;
            try {
              var tbl = links[j].closest('table');
              if (tbl && (tbl.innerText || '').toLowerCase().indexOf('effective date') !== -1) continue;
            } catch (e2) {}
            var row = links[j].closest('tr');
            var rt = row ? (row.innerText || '').toLowerCase() : '';
            if (rt.indexOf('psych') !== -1) return links[j];
            if (!fallback) fallback = links[j];
          }
        } catch (e3) {}
      }
    } catch (e) {}
    return null;
  }
  // CNR/Saints section list, both-green state (his rule, 2026-10-14):
  // the psych section row is signed (signer + date on the row) and at
  // least one other section row is signed too -> the form is done.
  // Judged ONLY by the Signed Date COLUMN of the section table's own
  // rows (the old version scanned every <tr> and fabricated a signed
  // psych row from outer layout tables).
  function sectionListAllSigned() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        try {
          var tables = docs[d].querySelectorAll('table');
          for (var ti = 0; ti < tables.length; ti++) {
            var tbl = tables[ti];
            var trs = tbl.querySelectorAll('tr');
            var rows = [];
            for (var ri = 0; ri < trs.length; ri++) {
              if (trs[ri].closest('table') === tbl) rows.push(trs[ri]);
            }
            var hdrIdx = -1, dateCol = -1;
            for (var h = 0; h < rows.length; h++) {
              var cells = rows[h].cells || [];
              var hasBy = false, dc = -1;
              for (var c = 0; c < cells.length; c++) {
                var ct = (cells[c].textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (ct.indexOf('signed by') !== -1) hasBy = true;
                if (ct.indexOf('signed date') !== -1) dc = c;
              }
              if (hasBy && dc !== -1) { hdrIdx = h; dateCol = dc; break; }
            }
            if (hdrIdx === -1) continue;
            var signedRows = 0, psychSigned = false;
            for (var r = hdrIdx + 1; r < rows.length; r++) {
              var rc = rows[r].cells || [];
              if (dateCol >= rc.length) continue;
              var dv = (rc[dateCol].textContent || '').trim();
              if (!/\d{1,2}\/\d{1,2}\/\d{4}/.test(dv)) continue;
              signedRows++;
              if (/psych/i.test(rows[r].textContent || '')) psychSigned = true;
            }
            if (psychSigned && signedRows >= 2) return true;
          }
        } catch (e4) {}
      }
    } catch (e) {}
    return false;
  }
  // One leaf-row pass over the assessments list (rows containing <tr>
  // are layout wrappers, skipped). Computes every F list target at
  // once. isPsych: 'psych' AND ('consult' OR 'psychiatry').
  // mostRecentEdit (CNR rule): in-progress beats completed, latest
  // date wins; missing date counts as epoch 0. inProgressEdit (BP
  // tier 1): psych + 'in progress' + 'abalestra'. inProgressEdit2
  // (BP tier 2): psych + an exact 'In Progress' cell.
  // signedSection predicate ported from CNR Keys (BP's exact predicate
  // was not re-read — the Lock branch has no capture to prove it
  // against; flagged in the slice-4 report).
  function scanAssessRows() {
    var out = { copyLink: null, copyDate: null, mostRecentEdit: null, bestKey: null, inProgressEdit: null, inProgressEdit2: null, signedSection: false, rowsSeen: 0, hasPsych: false };
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var rows = docs[d].querySelectorAll('table tr');
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (row.getElementsByTagName('tr').length) continue;
          var txt = row.innerText || '';
          var low = txt.toLowerCase();
          out.rowsSeen++;
          var isPsych = low.indexOf('psych') !== -1 && (low.indexOf('consult') !== -1 || low.indexOf('psychiatry') !== -1);
          if (low.indexOf('psych') !== -1 && !(low.indexOf('section') !== -1 && low.indexOf('description') !== -1) && (low.indexOf('balestra') !== -1 || low.indexOf('adrian') !== -1)) out.signedSection = true;
          if (!isPsych) continue;
          out.hasPsych = true;
          var m = txt.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (m) {
            var dt = new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
            if (!isNaN(dt.getTime()) && (!out.copyDate || dt > out.copyDate)) {
              var links = row.querySelectorAll('a');
              for (var j = 0; j < links.length; j++) {
                if ((links[j].textContent || '').trim().toLowerCase() === 'copy' && visible(links[j])) { out.copyLink = links[j]; out.copyDate = dt; break; }
              }
            }
          }
          var editLink = null;
          var linksE = row.querySelectorAll('a');
          for (var k = 0; k < linksE.length; k++) {
            if ((linksE[k].textContent || '').trim().toLowerCase() === 'edit' && visible(linksE[k])) { editLink = linksE[k]; break; }
          }
          if (editLink) {
            var dt2 = m ? new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10)) : new Date(0);
            if (isNaN(dt2.getTime())) dt2 = new Date(0);
            var key = (low.indexOf('in progress') !== -1 ? 1e13 : 0) + dt2.getTime();
            if (out.bestKey === null || key > out.bestKey) { out.mostRecentEdit = editLink; out.bestKey = key; }
            if (!out.inProgressEdit && low.indexOf('in progress') !== -1 && low.indexOf('abalestra') !== -1) out.inProgressEdit = editLink;
            if (!out.inProgressEdit2) {
              var cells = row.cells || [];
              for (var c = 0; c < cells.length; c++) {
                if ((cells[c].textContent || '').trim() === 'In Progress') { out.inProgressEdit2 = editLink; break; }
              }
            }
          }
        }
      }
    } catch (e) {}
    return out;
  }
  // The tab-page guard (CNR rule, his 2026-11-04): on a main chart tab
  // page with the tab bar visible that is NOT a form/list/progress-
  // notes page, F stands down ("F in clinical breaks nav keys").
  // Applied at all facilities in v1 — the later F branches only exist
  // on form/section pages anyway, so it changes nothing for BP/CH/Bedford
  // except preventing F from clicking a stray 'view' link on a chart tab.
  function tabPageStandDown() {
    try {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var hasTabs = docs[d].querySelector('[data-testid="tab-link"]');
        if (hasTabs) {
          var t = docText(docs[d]);
          var isForm = t.indexOf('save & exit') !== -1 || t.indexOf('save & sign') !== -1;
          var isList = t.indexOf('view all') !== -1 || t.indexOf('add progress note') !== -1;
          var isAssess = docs[d].querySelector('a.history');
          var isFormsList = false;
          try { isFormsList = isFormsListPage(); } catch (e2) {}
          if (!isForm && !isList && !isAssess && !isFormsList && !isProgressNotesPage()) return true;
          break;
        }
      }
    } catch (e) {}
    return false;
  }
  function doFAction() {
    if (!enabled) { noteRefusal('f', 'keys killed (0)'); return false; }
    var now = Date.now();
    if (now - _fAt < 1200) { noteRefusal('f', 'one-press-one-action guard'); return false; }
    _fAt = now;
    var fac = facility();
    var isCNR = (fac === 'cnr' || fac === 'saints');
    // 1. Profile tab: F opens Admission Record (Face Sheet at Boro Park).
    var adm = findAdmissionRecord();
    if (adm) { fireClick(adm); noteAction('f:admission-record'); return true; }
    // 2. Tab-page guard.
    if (tabPageStandDown()) { noteRefusal('f', 'tab-page guard — F stands down on a chart tab page'); return false; }
    // 3. CNR/Saints section list (his three-state rule, 2026-10-14):
    //    a sign link is waiting -> SIGN; both psych lines signed/green
    //    -> deliberately nothing; otherwise -> VIEW.
    if (isCNR && isSectionListPage()) {
      var sgn = findSectionSignLink();
      if (sgn) { fireClick(sgn); noteAction('f:section-sign'); return true; }
      if (sectionListAllSigned()) { noteAction('f:section-all-signed'); return true; }
      var svw = findViewLink();
      if (svw) { fireClick(svw); noteAction('f:section-view'); return true; }
    }
    // 4. Assessments list.
    var scan = scanAssessRows();
    if (scan.rowsSeen > 0) {
      var edit = null;
      if (isCNR) edit = scan.mostRecentEdit;
      else edit = scan.inProgressEdit || scan.inProgressEdit2;
      if (edit) { fireClick(edit); noteAction('f:list-edit'); return true; }
      if (scan.copyLink) { fireClick(scan.copyLink); noteAction('f:list-copy'); return true; }
      if (!scan.hasPsych) {
        var nw = findNewAssessmentButton();
        if (nw) { fireClick(nw); noteAction('f:list-new'); return true; }
      }
    }
    // 5. Signed section status page (Boro Park): F clicks Lock, not view.
    if (fac === 'boro' && scan.signedSection) {
      var lk = findLockButton();
      if (lk) { fireClick(lk); noteAction('f:lock'); return true; }
    }
    // 6. Progress Notes: VIEW ALL (on tab) or Resident Profile (on View All page).
    if (isProgressNotesPage()) {
      var va = findViewAllButton();
      if (va) { fireClick(va); noteAction('f:view-all'); return true; }
      var rp = findResidentProfileLink();
      if (rp) { fireClick(rp); noteAction('f:resident-profile'); return true; }
    }
    // 7. Form sections page: the view link (not on resident list or progress notes).
    if (!isResidentListPage() && !isProgressNotesPage()) {
      var vw = findViewLink();
      if (vw) { fireClick(vw); noteAction('f:view'); return true; }
    }
    // 8. Section list page (BP/CH/Bedford): the section edit link.
    if (!isCNR) {
      var se = findSectionEditLink();
      if (se) { fireClick(se); noteAction('f:section-edit'); return true; }
    }
    // 9. Form section detail: Next Section.
    var ns = findNextSection();
    if (ns) { fireClick(ns); noteAction('f:next-section'); return true; }
    // 10. Form edit: Save, facility priority.
    var st = settingsFor(fac);
    var order = st ? st.savePriority : F14_SAVE_ORDER;
    var sv = findSaveByPriority(order);
    if (sv) { noteAction('f:save'); return fireSaveClick(sv); }
    noteRefusal('f', 'no F target on this page');
    return false;
  }

  // ================================================================
  // F14 — typing-exempt Save. Old order (all facilities): Save &
  // Sign & Exit, Save & Exit, Save & Sign & Lock & Exit. Found:
  // blur + click (fireSaveClick). Not found: if typing, refuse
  // silently; else degrade to F.
  // ================================================================
  function handleF14() {
    var sv = findSaveByPriority(F14_SAVE_ORDER);
    if (sv) { noteAction('f14:save'); return fireSaveClick(sv); }
    if (isEditable(document.activeElement)) { noteRefusal('f14', 'no Save button; typing — silent'); return false; }
    noteAction('f14:degrade-f');
    return doFAction();
  }

  // ================================================================
  // TAB SHORTCUTS — H DASH, P PROFILE, O FORMS/ASSMNTS, N PROG NOTES;
  // F13 focuses the assessments tab without navigating. Last-tab
  // memory (tmLastTab) saved on every tab click + key jump, restored
  // ONCE on a fresh chart open landing on ORDERS. Ported from
  // Hide-tabs 1.28 (the tab-hiding itself is NOT in v1 — frozen scope
  // strips the hiding; the shortcuts + memory live here).
  // ================================================================
  var ALL_TABS = ['DASH', 'PROFILE', 'CENSUS', 'MED DIAG', 'PROBLEMS', 'ALLERGIES', 'IMMUN',
    'ORDERS', 'WTS/VITALS', 'RESULTS', 'MDS', 'FORMS', 'ASSMNTS', 'THERAPY', 'PROG NOTES', 'CARE PLAN',
    'TASKS', 'MISC'];
  var TAB_ALIASES = { 'FORMS': ['FORMS', 'ASSMNTS'] };
  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim().toUpperCase(); }
  function candidates() {
    var els = document.querySelectorAll('a,button,[role="tab"],td,li,span,div');
    var out = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.children.length > 2) continue;
      var t = norm(el.textContent);
      if (ALL_TABS.indexOf(t) !== -1) out.push({ name: t, el: el });
    }
    return out;
  }
  function findBar(cands) {
    var recs = [];
    var byNode = new Map();
    cands.forEach(function (c, idx) {
      var node = c.el.parentElement;
      for (var up = 0; up < 8 && node; up++) {
        var rec = byNode.get(node);
        if (!rec) { rec = { node: node, members: [], names: {} }; byNode.set(node, rec); recs.push(rec); }
        if (rec.members.indexOf(idx) === -1) { rec.members.push(idx); rec.names[c.name] = 1; }
        node = node.parentElement;
      }
    });
    var best = null;
    recs.forEach(function (rec) {
      var nNames = Object.keys(rec.names).length;
      if (nNames < 5) return;
      var size = rec.node.querySelectorAll('*').length;
      if (!best || nNames > best.nNames || (nNames === best.nNames && size < best.size)) {
        best = { node: rec.node, nNames: nNames, size: size };
      }
    });
    return best ? best.node : null;
  }
  function tabElement(el, name) {
    var target = el;
    for (var up = 0; up < 6 && target; up++) {
      var tag = target.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'TD' || tag === 'LI' ||
          target.onclick || target.getAttribute('onclick')) break;
      target = target.parentElement;
    }
    return (target && norm(target.textContent) === name) ? target : el;
  }
  function tabKeyFind(name) {
    var cands = candidates();
    if (!cands.length) return null;
    var bar = findBar(cands);
    if (!bar) return null;
    var labels = TAB_ALIASES[name] || [name];
    // Pass 1 (assessments tab): match the button by its href, like the
    // Dot's discoverAssessUrl — facility-proof, label-proof.
    if (labels.length > 1) {
      var anchors = bar.querySelectorAll('a[href]');
      for (var h = 0; h < anchors.length; h++) {
        var href = anchors[h].getAttribute('href') || '';
        if (/editmyprofile|myprofile/i.test(href)) continue;
        if (/cp_assessment|assessments/i.test(href)) {
          var ah = anchors[h];
          return { el: ah, a: ah, href: ah.href || null };
        }
      }
    }
    // Pass 2: label match (either facility label).
    for (var i = 0; i < cands.length; i++) {
      if (!bar.contains(cands[i].el)) continue;
      var nm = norm(cands[i].el.textContent);
      if (labels.indexOf(nm) === -1) continue;
      var el = tabElement(cands[i].el, nm);
      var a = (el.tagName === 'A') ? el : el.querySelector('a');
      return { el: el, a: a, href: (a && a.href) ? a.href : null };
    }
    return null;
  }
  function saveLastTab(name) {
    try { localStorage.setItem('tmLastTab', name); } catch (e) {}
  }
  function tabKeyGo(name) {
    window.__tmTabKeys = window.__tmTabKeys || {};
    var found = tabKeyFind(name);
    if (!found) { noteRefusal('tab:' + name, 'tab not found on this page'); return false; }
    // Save the resolved label (the bar's own label, so FORMS/ASSMNTS
    // stays facility-correct).
    try { saveLastTab(norm((found.a || found.el).textContent)); } catch (eSK) {}
    if (found.href) {
      window.__tmTabKeys.lastNav = found.href; // href as-is (no params appended)
      noteAction('tab:' + name);
      location.href = found.href;
      return true;
    }
    window.__tmTabKeys.lastNav = 'click:' + name;
    noteAction('tab:' + name);
    try { (found.a || found.el).click(); } catch (err) {}
    return true;
  }
  function tabKeyFocusForms() {
    var found = tabKeyFind('FORMS');
    var t = found && (found.a || found.el);
    window.__tmTabKeys = window.__tmTabKeys || {};
    if (t && t.focus) {
      try { t.focus(); } catch (e) {}
      window.__tmTabKeys.focusedForms = true;
      noteAction('f13:focus-forms');
    } else {
      window.__tmTabKeys.focusedForms = false;
      noteRefusal('f13', 'assessments tab not found');
    }
  }
  function urlTab() {
    var u = location.href;
    if (/cp_residentdashboard/i.test(u)) return 'DASH';
    if (/cp_careclientprofile/i.test(u)) return 'PROFILE';
    if (/ordersChart|ordersPortal/i.test(u)) return 'ORDERS';
    if (/cp_assessment/i.test(u)) return 'FORMS';
    if (/progressnotes/i.test(u)) return 'PROG NOTES';
    if (/cp_weightsandvitals/i.test(u)) return 'WTS/VITALS';
    if (/cp_mds/i.test(u)) return 'MDS';
    if (/cp_careplans_rev/i.test(u)) return 'CARE PLAN';
    if (/cp_tasks/i.test(u)) return 'TASKS';
    if (/clinicaldisplay/i.test(u)) return 'CENSUS';
    return '';
  }
  // Last-tab restore: a fresh chart open lands on PCC's default
  // (ORDERS). If he left the last chart on a different tab, go there
  // instead — ONCE, then never touch tabs again on this load. Only
  // fires when the URL says ORDERS. Top window only.
  var lastTabRestoreDone = false;
  function restoreLastTab() {
    try {
      if (lastTabRestoreDone || window !== window.top) return;
      if (urlTab() !== 'ORDERS') return;
      var savedTab = null;
      try { savedTab = localStorage.getItem('tmLastTab') || ''; } catch (eRT) {}
      if (!savedTab || savedTab === 'ORDERS') return;
      var found = tabKeyFind(savedTab);
      if (!found) return;
      var tEl = found.el, tA = found.a;
      lastTabRestoreDone = true;
      window.__tmLastTabRestore = (tA && tA.href) ? tA.href : ('click:' + savedTab);
      if (tA && tA.href) { location.href = tA.href; }
      else { try { (tA || tEl).click(); } catch (eRC) {} }
    } catch (e) {}
  }
  // Every tab CLICK saves the tab too (the key jumps navigate via
  // location.href, so the click listener never fires for them).
  function armTabClickSaver() {
    try {
      document.addEventListener('click', function (e) {
        try {
          var t = e.target;
          if (!t || !t.closest) return;
          var a = t.closest('a[data-testid="tab-link"]');
          if (a) saveLastTab(norm(a.textContent));
        } catch (err) {}
      }, true);
    } catch (e) {}
  }

  // ================================================================
  // THE KEYDOWN HANDLER — one listener, capture phase.
  // Order matters: F14/F13 (typing-exempt) -> 0 (kill switch, works
  // even while typing — JUDGMENT CALL, differs from the old code,
  // which gated 0 behind the editable check) -> Escape (blur while
  // typing) -> dead while typing -> enabled gate -> dispatch.
  // isTrusted-only, no modifiers, no repeat, throughout.
  // ================================================================
  function onKeydown(e) {
    try {
      if (!e.isTrusted) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat) return;
      var key = e.key || '';
      // F14: typing-exempt Save — always live, even when keys are killed.
      if (key === 'F14') { handleF14(); try { e.preventDefault(); } catch (err) {} return; }
      // F13: focus the assessments tab — a function key can't type.
      if (key === 'F13') { tabKeyFocusForms(); try { e.preventDefault(); } catch (err) {} return; }
      // 0: the kill switch — the one key that is never dead.
      if (key === '0') {
        enabled = !enabled;
        noteAction(enabled ? '0:keys-on' : '0:keys-off');
        try { e.preventDefault(); } catch (err) {}
        return;
      }
      // Escape while typing: blur the field so letter shortcuts fire.
      if (key === 'Escape') {
        if (isEditable(e.target)) { try { e.target.blur(); } catch (err) {} }
        return;
      }
      // Dead while typing.
      if (isEditable(e.target)) return;
      // Killed.
      if (!enabled) return;
      var k = key.toLowerCase();
      if (k === 'a') { focusResidentSearch(); }
      else if (k === 's') { handleS(); }
      else if (k === 'd') { handleD(); }
      else if (k === 'f') { doFAction(); }
      else if (k === 'h') {
        // Form page -> H fill (the Hand); chart page -> DASH tab.
        if (isFormPage()) handleH();
        else tabKeyGo('DASH');
      }
      else if (k === 'p') { tabKeyGo('PROFILE'); }
      else if (k === 'o') { tabKeyGo('FORMS'); }
      else if (k === 'n') { tabKeyGo('PROG NOTES'); }
      else if (k === '1' || k === '2') { handleNumberKey(k); }
      else return;
      try { e.preventDefault(); } catch (err) {}
    } catch (err) {}
  }

  // ---- init ----
  armEditingLatch();
  armTabClickSaver();
  document.addEventListener('keydown', onKeydown, true);
  restoreLastTab();

  // Introspection (read-only; the rig + the Hand read these).
  window.__tmKeysV1 = {
    version: VERSION,
    enabled: function () { return enabled; },
    facility: facility,
    settingsFor: settingsFor,
    doFAction: doFAction,
    tabKeyGo: tabKeyGo,
    handleF14: handleF14,
    lastAction: function () { return lastAction; },
    lastRefusal: function () { return lastRefusal; }
  };
})();
