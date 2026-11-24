// ==UserScript==
// @name         PCC v1 — Brain
// @version      0.3.5
// @description  v1 Brain, slice 3: identity + gather + verdicts + tiles. Reads PCC, decides red/not-red per tile, plants the tile band once from the settled packet. Never writes to a note, the clipboard, or a form.
// @match        https://*.pointclickcare.com/*
// @match        https://*.pointclickcare.ca/*
// @run-at       document-end
// @grant        none
// ==/UserScript==
//
// v1 Brain — slice 3: identity + gather + verdicts + tiles.
// Architecture: PCC-ARCHITECTURE.md §2 (one gather, one packet), §3 (identity),
// §4 (classification), §8 (visual: Lucide + Open Props + system font, Docker
// reference). Spec: PCC-SPEC.md §1.3, §2.1–§2.6, §3.2, §4.1.
//
// Slice 1 (identity) and slice 2 (gather + verdicts) are unchanged below,
// except the Melatonin-last ordering fix (his ruling, 2026-11-24). Slice 3 adds:
//   tiles — plant the tile band ONCE, from the settled packet, on the Dash
//     and the Progress Notes page. Display-only: no clicks (the Hand,
//     slice 4), no keys (slice 4), no clipboard/form/note writes.
//     The tiles render slice 2's verdicts + visibility — they never
//     recompute a verdict, except age/sex (slice 2 publishes no ageSex
//     verdict; the tiles module derives it from the note type).
//   Melatonin last — the psych tier sorts Melatonin last (after the EPS
//     meds), per his 2026-11-24 ruling.
//
// Slice 4 (v0.3.3) added the resident NAME to the packet so the
// Hand's S copy (name + tab + room) could read it on the form page.
// v0.3.4 REMOVES it (Rest VETO, 2026-11-24): a resident name must
// never be stored — the packet carries the chart number only
// (architecture §3.1, "Never a name"). S reads the name live from
// the page instead (header on chart pages, #clientName on form
// pages); the Hand owns that read, the Brain never holds a name.
//
// No timers, no pollers, no observers, no intervals, no heartbeats.
// The Brain only reads PCC, decides, publishes to localStorage, and plants
// the band; it never writes to a note field, the clipboard, or a form.
// That is the Hand's job.

(function () {
  'use strict';

  var VERSION = '0.3.4';
  var EPOCH = 1; // packet format version; an older epoch is refused whole (later slices)

  // Storage keys (v1 Brain).
  var PACKET_KEY = 'tmTileChart'; // the packet (current patient's identity)
  var PKMAP_KEY = 'tmV1PkMap';    // client-PK -> chart-digits mapping table

  // ---- chart number from the resident header ----
  // Header text shape (Core's scanHeader, same pattern): "Last, First (BC1802714)".
  // Group 1 = the token (letters + digits, e.g. "BC1802714"); group 2 = the
  // chart digits (e.g. "1802714"). Only short elements are read (5-70 chars);
  // "clinical" headings are skipped. Script/style text is never scanned
  // (only span/div/h1/h2/h3/td/a/b/strong), so a chart number inside a
  // JSON blob in a <script> tag does not resolve.
  var HEADER_RE = /^[A-Za-z][A-Za-z'’.\-]+(?:\s+[A-Za-z][A-Za-z'’.\-]+)?\s*,\s*[A-Za-z][A-Za-z'’.\- ]+?\s*\(\s*([A-Za-z]{0,5}(\d{3,}))\s*\)/;

  function chartDigitsFromHeader() {
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
        var tx;
        try { tx = (els[i].textContent || '').replace(/\s+/g, ' ').trim(); }
        catch (e) { continue; }
        if (tx.length > 70 || tx.length < 5) continue;
        if (/^clinical\s/i.test(tx)) continue;
        var em = tx.match(HEADER_RE);
        if (em) return em[2];
      }
    }
    return null;
  }

  // (v0.3.4: residentNameFromHeader was here. Removed per Rest VETO
  // 2026-11-24 — the Brain never holds a resident name. S reads the
  // name live from the page; see the Hand.)

  // Chart pages: PCC's own getCurrentClientIdNumber(). Form pages: the
  // GLOBAL_CLIENT_ID constant or the hidden #assessClientId field.
  // Unlike the rotating EID token in the form URL, the PK is stable per
  // patient — it is the bridge between a form page (no chart number in
  // the DOM) and the chart number, via the mapping table below.
  function clientPK() {
    try {
      if (typeof window.getCurrentClientIdNumber === 'function') {
        var r = window.getCurrentClientIdNumber();
        if (/^\d+$/.test(String(r))) return String(r);
      }
    } catch (e) {}
    try {
      var g = window.GLOBAL_CLIENT_ID;
      if (g && /^\d+$/.test(String(g))) return String(g);
    } catch (e) {}
    try {
      var el = document.getElementById('assessClientId');
      if (el && el.value && /^\d+$/.test(String(el.value))) return String(el.value);
    } catch (e) {}
    return null;
  }

  // ---- client-PK -> chart-number mapping table ----
  // Published by the Brain when it reads a chart page (chart number +
  // client PK together). A form page reads its own client PK and looks
  // it up here to resolve the chart number. Append-only across patients
  // (a lookup table, not a single-patient record); keyed by client PK so
  // a form always resolves ITS OWN patient, never the last chart's.
  function readPkMap() {
    try {
      var raw = localStorage.getItem(PKMAP_KEY);
      if (!raw) return {};
      var m = JSON.parse(raw);
      return (m && typeof m === 'object') ? m : {};
    } catch (e) { return {}; }
  }

  function recordPkMap(pk, digits) {
    if (!pk || !digits) return;
    try {
      var map = readPkMap();
      map[pk] = digits;
      localStorage.setItem(PKMAP_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  // ---- the packet (identity fields only, this slice) ----
  function readPacket() {
    try {
      var raw = localStorage.getItem(PACKET_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      return (p && typeof p === 'object') ? p : null;
    } catch (e) { return null; }
  }

  function publishPacket() {
    var id = patientId();
    if (!id) return null; // patient-dependent: refuse when null — no packet.
    var pk = clientPK();
    var old = readPacket();
    var facts = gatherAll(old);
    var decided = decideVerdicts(facts);
    // The note's full text is NOT published: the verdicts need only the
    // parsed facts (BIMS list, meds set, diagnoses text, allergies set,
    // relationships set). The raw text stays in the page, never at rest.
    var noteOut = null;
    if (facts.note) {
      noteOut = {
        bims: facts.note.bims, bimsNA: facts.note.bimsNA,
        psychMeds: facts.note.psychMeds, dxText: facts.note.dxText,
        dxEmpty: facts.note.dxEmpty, allergies: facts.note.allergies,
        allergiesSet: facts.note.allergiesSet, rel: facts.note.rel,
        relSet: facts.note.relSet, hasAllergiesLine: facts.note.hasAllergiesLine
      };
    }
    var packet = {
      epoch: EPOCH, key: id, clientId: pk, ts: Date.now(),
      ageSex: facts.ageSex, room: facts.room, facility: facts.facility, // v0.3.4: no name field — Rest VETO (the packet carries the chart number only).
      allergies: facts.allergies, readmit: facts.readmit,
      bims: facts.bims, bimsPrev: facts.bimsPrev,
      psychRows: facts.psychRows,
      classification: facts.classification, meds: facts.meds,
      dx: facts.dx, dxCached: facts.dxCached, psychDx: facts.psychDx,
      rel: facts.rel, weight: facts.weight, note: noteOut,
      verdicts: decided.verdicts, visibility: decided.visibility,
      reasons: decided.reasons
    };
    try { localStorage.setItem(PACKET_KEY, JSON.stringify(packet)); } catch (e) {}
    if (pk) recordPkMap(pk, id);
    return packet;
  }

  // ---- (1) the single patient ID function ----
  // Returns the chart number (bare digits) or null. Memoized per page
  // load — resolved once, never re-derived except by a fresh page load.
  // Resolution order (architecture §3.1):
  //   1. Chart header (the resident header on chart pages).
  //   2. Client PK -> chart number, via the mapping table. A PK that is
  //      present but UNMAPPED is a real signal this page's patient is
  //      unknown — refuse (null) rather than trust a packet whose
  //      patient this PK cannot confirm.
  //   3. Opener's chart number (NEW-form popup via window.opener).
  //   4. The packet's key — the last known patient. Some chart pages
  //      (the assessments list) carry no header digits and no PK in
  //      the DOM; the user is still on the same patient when he
  //      navigates Dash -> list within one chart, and a page that DOES
  //      carry an identity and differs invalidates the packet (init).
  //      Known limit: a list URL opened directly for another patient,
  //      without visiting their Dash first, would attribute the rows
  //      to the last known patient. The alternative — no verdicts at
  //      all from the list — is worse; the packet is corrected on the
  //      next Dash visit.
  //   5. null — patient-dependent features refuse when null. Never a guess.
  // Never an identity: the EID token (form URL's ESOLclientid — rotates
  // per page/link, can never equal a chart number) and never a name.
  var _patientId; // undefined = not yet resolved; null = resolved to null
  function patientId() {
    if (_patientId !== undefined) return _patientId;
    var digits = chartDigitsFromHeader();
    if (digits) { _patientId = digits; return _patientId; }
    var pk = clientPK();
    if (pk) {
      var mapped = readPkMap()[pk];
      if (mapped) { _patientId = mapped; return _patientId; }
      _patientId = null; // PK present but unmapped: refuse, do not fall back.
      return _patientId;
    }
    try {
      if (window.opener && !window.opener.closed) {
        var op = window.opener.__tmBrainV1;
        if (op && typeof op.patientId === 'function') {
          var oid = op.patientId();
          if (oid) { _patientId = oid; return _patientId; }
        }
      }
    } catch (e) {}
    var pkt = readPacket();
    if (pkt && pkt.key) {
      // The fallback is chart pages only: a page with no chart marker
      // (no resident header, no form client id) is not a chart page,
      // and must not inherit the last patient.
      var isChartPage = false;
      try { isChartPage = !!(document.getElementById('residentHeader') || document.getElementById('assessClientId')); } catch (e) {}
      if (isChartPage) { _patientId = pkt.key; return _patientId; }
    }
    _patientId = null;
    return _patientId;
  }

  // ---- (5) the H patient-check hook ----
  // The Hand calls this before an H fill: true only when the given id is
  // this page's patient. Compares digit tails (a "BC..." token and its
  // bare digits are the same patient); refuses null, empty, and any
  // non-matching id. Never guesses.
  function patientMatches(id) {
    var mine = patientId();
    if (!mine || id === null || id === undefined) return false;
    var a = String(mine).replace(/\D/g, '');
    var b = String(id).replace(/\D/g, '');
    return a !== '' && a === b;
  }

  // ================================================================
  // SLICE 2 — GATHER + CLASSIFICATION + VERDICTS
  // One bounded gather pass per page load (after identity resolves).
  // Reads the facts from the page, decides red/ok/hidden per tile per
  // the spec's RULED rules, publishes everything in the packet.
  // The Brain never writes to a note, the clipboard, or a form.
  // ================================================================

  // ---- small helpers ----
  function cleanText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function parseMDY(s) {
    if (!s) return null;
    var m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    var d = new Date(+m[3], +m[1] - 1, +m[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  // Short date M/D/YY (the note's BIMS format) -> Date. Year 00-69 = 2000s.
  function parseMDYY(s) {
    if (!s) return null;
    var m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2})\b/);
    if (!m) return parseMDY(s);
    var y = +m[3]; y = y < 70 ? 2000 + y : 1900 + y;
    var d = new Date(y, +m[1] - 1, +m[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    return Math.floor((b.getTime() - a.getTime()) / 86400000);
  }
  function digitsOf(s) { return String(s || '').replace(/\D/g, ''); }

  // ---- facility (spec §4.1; the Bedford/Crown Heights allergies rule) ----
  // Same shape as the old facilityNameHere: scan short elements
  // (select/button/a/span/div/td, 6-90 chars) for the facility name.
  // The facility name in a <script> JSON blob is never read (only the
  // listed element kinds are scanned).
  function gatherFacility() {
    var els;
    try { els = document.querySelectorAll('select, button, a, span, div, td'); }
    catch (e) { return null; }
    var found = { bedford: false, crown: false, boro: false, saints: false, cnr: false };
    for (var i = 0; i < els.length; i++) {
      var tx;
      try { tx = (els[i].textContent || '').trim(); } catch (e) { continue; }
      if (tx.length > 90 || tx.length < 6) continue;
      if (/bedford/i.test(tx)) found.bedford = true;
      if (/crown\s*heights/i.test(tx)) found.crown = true;
      if (/boro\s*park/i.test(tx)) found.boro = true;
      if (/saints/i.test(tx)) found.saints = true;
      if (/\bcnr\b/i.test(tx)) found.cnr = true;
    }
    if (found.bedford) return 'bedford';
    if (found.crown) return 'crown';
    if (found.boro) return 'boro';
    if (found.saints) return 'saints';
    if (found.cnr) return 'cnr';
    return null;
  }

  // ---- header: age/sex + room (spec §2.1; the S key's room finder) ----
  function gatherHeader() {
    var bodyText = '';
    try { bodyText = document.body ? document.body.textContent : ''; } catch (e) {}
    var ageSex = null;
    var am = bodyText.match(/\((\d{1,3})\s*\/\s*(Male|Female)\)/);
    if (am) ageSex = am[1] + (am[2] === 'Male' ? 'M' : 'F');
    // Room: the "Location" label, then the room-bed number (digits +
    // optional bed letter). E/W wing prefix at Crown Heights only.
    // First choice is the dedicated #res_unitRoomBed element ("Unit 5
    // 514-P"); the body-text scan is the fallback — and it must never
    // read script text, so it is scoped to label/value spans, not the
    // whole body (the first "\bLocation\b" in body textContent is a
    // <script>'s `location = "/care/reports/..."`).
    var room = null;
    var v = '';
    try {
      var urb = document.getElementById('res_unitRoomBed');
      if (urb) v = cleanText(urb.textContent);
    } catch (e) {}
    if (!v) {
      try {
        var labels = document.querySelectorAll('.residentDetailLabel');
        for (var li2 = 0; li2 < labels.length; li2++) {
          if (/^location$/i.test(cleanText(labels[li2].textContent))) {
            var sib2 = labels[li2].nextElementSibling;
            if (sib2) v = cleanText(sib2.textContent);
            break;
          }
        }
      } catch (e) {}
    }
    if (!v) {
      var li = bodyText.search(/\bLocation\b/i);
      if (li !== -1) v = cleanText(bodyText.substr(li, 40));
    }
    var rm = v.match(/\b(\d{2,4})\s*-?\s*([A-Za-z])?\b/);
    if (rm) {
      var fac = gatherFacility();
      var pre = '';
      if (fac === 'crown') {
        var tok = v.slice(0, rm.index).match(/([A-Za-z]+)\s*$/);
        if (tok && /^(east|west)$/i.test(tok[1])) pre = tok[1].charAt(0).toUpperCase();
        else if (tok && tok[1].length === 1 && /[ew]/i.test(tok[1])) pre = tok[1].toUpperCase();
      }
      room = pre + rm[1] + (rm[2] ? rm[2].toUpperCase() : '');
    }
    return { ageSex: ageSex, room: room }; // v0.3.4: no name — Rest VETO (the Brain never holds a resident name).
  }

  // ---- allergies (spec §1.3): chart value + the PCN-only set ----
  // NKA / NKDA / "No known…" normalize to the EMPTY set on both sides.
  // Penicillin (or PCN) -> 'pcn'. Order never matters (sorted set).
  function allergySet(s) {
    var parts = String(s || '').split(/[,;/\n]/);
    var out = [];
    parts.forEach(function (p) {
      var low = cleanText(p).toLowerCase();
      if (!low) return;
      if (/^(no known.*|nka|nkda|none)$/.test(low)) return;
      if (/\bpenicillin/.test(low) || /\bpcn\b/.test(low)) {
        if (out.indexOf('pcn') === -1) out.push('pcn');
        return;
      }
      if (out.indexOf(low) === -1) out.push(low);
    });
    return out.sort();
  }
  function gatherAllergies() {
    var raw = '';
    var found = false;
    try {
      // The value is its own span (.residentDetailValue) inside the
      // .residentAllergies block — reading the block's textContent
      // concatenates the "Allergies" label onto the value
      // ("AllergiesNo Known Allergies"), which no set rule matches.
      var el = document.querySelector('.residentAllergies .residentDetailValue');
      if (el) { raw = cleanText(el.textContent); found = true; }
      if (!raw) {
        var block = document.querySelector('.residentAllergies');
        if (block) { raw = cleanText(block.textContent).replace(/^allergies\s*/i, ''); found = true; }
      }
    } catch (e) {}
    if (!raw) {
      // Fall back: the detail value after an "Allergies" label.
      try {
        var labels = document.querySelectorAll('.residentDetailLabel');
        for (var i = 0; i < labels.length; i++) {
          if (/allergies/i.test(labels[i].textContent || '')) {
            var sib = labels[i].nextElementSibling;
            if (sib) { raw = cleanText(sib.textContent); found = true; }
            break;
          }
        }
      } catch (e) {}
    }
    return { raw: raw, set: allergySet(raw), found: found };
  }

  // ---- re-entry dates (spec §1.1): from the admission display ----
  // The three dates live in three SIBLING elements, not one block:
  // re-entry in .residentAdmissionReEntry, initial in
  // .residentInitialAdmissionDate, discharge in .residentDischargeDate.
  // (The old code searched for all three labels inside the re-entry
  // element only, so initial/discharge always came back null and the
  // tile showed "—". His ruling 2026-11-24: there is always an
  // initial admission date.)
  function gatherReentry() {
    function dateFrom(sel) {
      try {
        var el = document.querySelector(sel);
        if (!el) return null;
        var m = (el.textContent || '').match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        return m ? m[1] : null;
      } catch (e) { return null; }
    }
    return {
      reentry: dateFrom('.residentAdmissionReEntry'),
      initial: dateFrom('.residentInitialAdmissionDate'),
      discharge: dateFrom('.residentDischargeDate')
    };
  }

  // ---- assessments list rows (BIMS + psych consults) ----
  // Columns found by the header row (Form Date | Description | Status |
  // Type | Category | Score | ...), never hardcoded — the order can vary.
  // The date cell carries a hidden duplicate ("9/21/20269/21/2026"), so
  // the date is extracted by unanchored DATE match, never by reading the
  // cell text (spec §2.3).
  // Returns { rows, hasTable }: hasTable says whether an assessments
  // list table (Form Date | Description | Status | Score headers) is
  // on THIS page at all. A present-but-empty table is a real native
  // read (a genuinely new patient); an absent table means the facts
  // come from the packet cache (same patient only).
  // Scoped per TABLE, using row.cells (a row's OWN cells only):
  // document-wide 'table tr' + querySelectorAll('th, td') returns
  // DESCENDANT cells too, so an outer wrapper row that contains the
  // assessments table as a descendant would match the header and set
  // col indices into the wrapper's giant cell list — every real row
  // then fails the length check and the list reads empty. (Caught by
  // the jsdom gather check on TREE-1959: header found, 0 rows.)
  function listRows() {
    var out = [];
    var tables;
    try { tables = document.querySelectorAll('table'); } catch (e) { return { rows: out, hasTable: false }; }
    for (var ti = 0; ti < tables.length; ti++) {
      var rows = tables[ti].rows; // this table's own rows only
      var col = null;
      for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].cells;
        if (!cells || !cells.length) continue;
        var heads = [];
        for (var h = 0; h < cells.length; h++) heads.push(cleanText(cells[h].textContent).toLowerCase());
        if (!col && heads.indexOf('form date') !== -1 && heads.indexOf('description') !== -1) {
          col = {
            date: heads.indexOf('form date'),
            desc: heads.indexOf('description'),
            status: heads.indexOf('status'),
            score: heads.indexOf('score')
          };
          continue;
        }
        if (!col) continue;
        if (cells.length <= Math.max(col.date, col.desc, col.status, col.score)) continue;
        var hasTd = false;
        for (var c = 0; c < cells.length; c++) if (cells[c].tagName === 'TD') { hasTd = true; break; }
        if (!hasTd) continue; // header rows have th, not td
        var dateRaw = cleanText(cells[col.date].textContent);
        var dm = dateRaw.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        out.push({
          date: dm ? dm[1] : '',
          desc: cleanText(cells[col.desc].textContent),
          status: cleanText(cells[col.status].textContent),
          score: cleanText(cells[col.score].textContent)
        });
      }
      if (col) return { rows: out, hasTable: true };
    }
    return { rows: out, hasTable: false };
  }
  function isBimsRow(r) { return /bims|brief interview/i.test(r.desc || ''); }
  function isPsychRow(r) { return /consult[\s\-]*psychiatry/i.test(r.desc || ''); }

  // BIMS, sweep-always (spec §2.3): every form type, the NEWEST wins.
  function gatherBims(rows) {
    var all = [];
    var best = null;
    rows.forEach(function (r) {
      if (!isBimsRow(r)) return;
      var score = parseFloat(String(r.score || '').replace(/[^0-9.]/g, ''));
      if (isNaN(score)) return;
      var d = parseMDY(r.date);
      all.push({ score: score, date: r.date, d: d });
      if (d && (!best || d > best.d)) best = { score: score, date: r.date, d: d };
    });
    return { newest: best ? { score: best.score, date: best.date } : null, all: all };
  }
  function gatherPsychRows(rows) {
    var out = [];
    rows.forEach(function (r) {
      if (!isPsychRow(r)) return;
      out.push({ date: r.date, status: r.status, score: r.score, d: parseMDY(r.date) });
    });
    return out;
  }

  // ---- classification (architecture §4; spec §1.1) ----
  // NEW: no psych consult at all, or every psych row not-done.
  //   not-done = In Progress + Score 1.0 (the open one), or Incomplete
  //   (older started-never-finished), or Complete with Score exactly 1.0
  //   (score overrides Complete). Done = Complete with a real score != 1.0.
  // READMISSION: re-entry date on or after the latest psych form date.
  // FOLLOW-UP: otherwise. QUARTERLY (Boro Park only): otherwise follow-up
  //   AND the last psych note is >= 70 days old.
  function classify(psychRows, reentryDateStr, facility) {
    var latest = null;
    psychRows.forEach(function (r) {
      if (r.d && (!latest || r.d > latest.d)) latest = r;
    });
    // Done-ness (Flag 1.15's rule, per the spec): a row is DONE unless it
    // is Incomplete, In Progress, or its Score is exactly 1.0 (the score
    // overrides Complete — a Complete row with Score 1.0 is a mistaken /
    // placeholder consult, also NEW). A Complete row with an EMPTY score
    // IS done: TREE-1959's psych rows carry no Score at all, and the
    // established classification there is FOLLOW-UP, not NEW.
    function isDone(r) {
      var s = String(r.status || '').toLowerCase().trim();
      var sc = String(r.score || '').trim();
      var n = parseFloat(sc);
      if (s === 'incomplete' || s === 'in progress') return false;
      if (sc !== '' && !isNaN(n) && n === 1.0) return false;
      return s === 'complete';
    }
    var anyDone = psychRows.some(isDone);
    var verdict = 'followup';
    if (!psychRows.length || !anyDone) verdict = 'new';
    else {
      var re = parseMDY(reentryDateStr);
      if (re && latest && latest.d && re.getTime() >= latest.d.getTime()) verdict = 'readmit';
      else verdict = 'followup';
    }
    if (verdict === 'followup' && facility === 'boro' && latest && latest.d) {
      var days = daysBetween(latest.d, new Date());
      if (days !== null && days >= 70) verdict = 'quarterly';
    }
    return {
      verdict: verdict,
      lastPsychDate: latest ? latest.date : null,
      reentryDate: reentryDateStr || null
    };
  }

  // ---- psych meds: ONE list, tiers, total dose, PRN (spec §2.5) ----
  // ONE psych-med list in the Brain, used for both the tile and the panel
  // grouping (spec 3b — the fix for the two-lists bug: the tile's
  // PSYCH_MED_RE had the ADHD meds, the panel's medTierOf PSYCH did not).
  // This is the union of both old lists.
  // (Melatonin: the old tile's PSYCH_MED_RE omitted it, but the old
  // panel's TIER2_COUNTED grouped it in the psych box and the spec rules
  // its indication (Melatonin->sleep) — the one-list fix puts it in the
  // psych tier, so tile and panel agree. RULED (his, 2026-11-24):
  // Melatonin is always a psych med, in BOTH lists, and LAST on the
  // psych list — the sort below puts it last, after the EPS meds.)
  var PSYCH_MED = /\b(melatonin|alprazolam|xanax|citalopram|celexa|escitalopram|lexapro|sertraline|zoloft|fluoxetine|prozac|paroxetine|paxil|fluvoxamine|luvox|venlafaxine|effexor|duloxetine|cymbalta|desvenlafaxine|pristiq|bupropion|wellbutrin|mirtazapine|remeron|trazodone|nefazodone|vilazodone|viibryd|vortioxetine|trintellix|clozapine|clozaril|olanzapine|zyprexa|quetiapine|seroquel|risperidone|risperdal|paliperidone|invega|aripiprazole|abilify|ziprasidone|geodon|lurasidone|latuda|cariprazine|vraylar|brexpiprazole|rexulti|haloperidol|haldol|fluphenazine|chlorpromazine|perphenazine|loxapine|asenapine|saphris|iloperidone|fanapt|divalproex|depakote|valproate|valproic|lamotrigine|lamictal|carbamazepine|tegretol|oxcarbazepine|trileptal|lithium|gabapentin|neurontin|pregabalin|lyrica|topiramate|topamax|hydroxyzine|vistaril|buspirone|buspar|clonazepam|klonopin|lorazepam|ativan|diazepam|valium|temazepam|restoril|zolpidem|ambien|eszopiclone|lunesta|zaleplon|sonata|ramelteon|rozerem|suvorexant|belsomra|doxepin|sinequan|amitriptyline|elavil|nortriptyline|pamelor|imipramine|tofranil|desipramine|norpramin|clomipramine|anafranil|methylphenidate|ritalin|concerta|amphetamine|adderall|lisdexamfetamine|vyvanse|atomoxetine|strattera|guanfacine|intuniv|clonidine|catapres|prazosin|minipress|propranolol|inderal|benztropine|cogentin|trihexyphenidyl|artane|procyclidine|biperiden|amantadine|valbenazine|ingrezza|deutetrabenazine|austedo|tetrabenazine|xenazine|donepezil|aricept|memantine|namenda|namzaric|galantamine|razadyne|rivastigmine|exelon|naltrexone|revia|vivitrol|acamprosate|campral|disulfiram|antabuse|methadone|buprenorphine|suboxone|subutex|varenicline|chantix|lofexidine|lucemyra|pimavanserin|nuplazid|lumateperone|caplyta|selegiline|emsam|phenelzine|nardil|tranylcypromine|parnate|isocarboxazid|marplan|maprotiline|ludiomil|amoxapine|asendin|protriptyline|vivactil|trimipramine|surmontil|thiothixene|navane|thioridazine|mellaril|trifluoperazine|stelazine|molindone|moban|loxapine|oxilapine)\b/i;
  // Seizure (tier 1, after psych) and Parkinson's (tier 1, with seizure).
  // A med in both the psych list and a tier-1 list is tiered by its
  // INDICATION when the sig states one (seizure/epilepsy -> seizure;
  // Parkinson's -> Parkinson's); with no clear indication it stays psych.
  var SEIZURE_MED = /\b(levetiracetam|keppra|phenytoin|dilantin|fosphenytoin|cerebyx|lacosamide|vimpat|zonisamide|zonegran|felbamate|felbatol|vigabatrin|sabril|perampanel|fycompa|brivaracetam|briviact|cenobamate|xcopri|stiripentol|diacomit|cannabidiol|epidiolex|ethosuximide|zarontin|primidone|mysoline|phenobarbital|luminal|clobazam|onfi|rufinamide|banzel|ezogabine|potiga)\b/i;
  var PARKINSON_MED = /\b(levodopa|carbidopa|sinemet|rytar|duopa|pramipexole|mirapex|ropinirole|requip|rotigotine|neupro|rasagiline|azilect|entacapone|comtan|tolcapone|tasmar|opicapone|ongentys|safinamide|xadago|apomorphine|apokyn|bromocriptine|parlodel|cabergoline|dostinex|pergolide|permax)\b/i;
  var PAIN_MED = /\b(oxycodone|oxycontin|percocet|hydrocodone|vicodin|norco|morphine|ms contin|hydromorphone|dilaudid|fentanyl|codeine|tramadol|ultram|meperidine|demerol|tapentadol|nucynta|ibuprofen|advil|motrin|naproxen|aleve|meloxicam|mobic|celecoxib|celebrex|diclofenac|voltaren|indomethacin|indocin|ketorolac|toradol|cyclobenzaprine|flexeril|methocarbamol|robaxin|baclofen|lioresal|tizanidine|zanaflex|carisoprodol|soma|acetaminophen|tylenol)\b/i;
  // Brand -> generic (canonical) name, for the verdict set compare and
  // for the note-language display name. Generic stays itself.
  var BRAND_TO_GENERIC = {
    zoloft: 'sertraline', lexapro: 'escitalopram', celexa: 'citalopram',
    prozac: 'fluoxetine', paxil: 'paroxetine', luvox: 'fluvoxamine',
    effexor: 'venlafaxine', pristiq: 'desvenlafaxine', cymbalta: 'duloxetine',
    wellbutrin: 'bupropion', remeron: 'mirtazapine', viibryd: 'vilazodone',
    trintellix: 'vortioxetine', elavil: 'amitriptyline', pamelor: 'nortriptyline',
    tofranil: 'imipramine', norpramin: 'desipramine', anafranil: 'clomipramine',
    sinequan: 'doxepin', abilify: 'aripiprazole', zyprexa: 'olanzapine',
    seroquel: 'quetiapine', risperdal: 'risperidone', invega: 'paliperidone',
    geodon: 'ziprasidone', latuda: 'lurasidone', vraylar: 'cariprazine',
    rexulti: 'brexpiprazole', haldol: 'haloperidol', clozaril: 'clozapine',
    saphris: 'asenapine', fanapt: 'iloperidone', caplyta: 'lumateperone',
    nuplazid: 'pimavanserin', depakote: 'divalproex', lamictal: 'lamotrigine',
    tegretol: 'carbamazepine', trileptal: 'oxcarbazepine', neurontin: 'gabapentin',
    lyrica: 'pregabalin', topamax: 'topiramate', vistaril: 'hydroxyzine',
    buspar: 'buspirone', klonopin: 'clonazepam', ativan: 'lorazepam',
    xanax: 'alprazolam', valium: 'diazepam', restoril: 'temazepam',
    ambien: 'zolpidem', lunesta: 'eszopiclone', sonata: 'zaleplon',
    rozerem: 'ramelteon', belsomra: 'suvorexant', strattera: 'atomoxetine',
    ritalin: 'methylphenidate', concerta: 'methylphenidate',
    adderall: 'amphetamine', vyvanse: 'lisdexamfetamine',
    intuniv: 'guanfacine', catapres: 'clonidine', minipress: 'prazosin',
    inderal: 'propranolol', cogentin: 'benztropine', artane: 'trihexyphenidyl',
    aricept: 'donepezil', namenda: 'memantine', exelon: 'rivastigmine',
    razadyne: 'galantamine', revia: 'naltrexone', vivitrol: 'naltrexone',
    campral: 'acamprosate', antabuse: 'disulfiram', suboxone: 'buprenorphine',
    subutex: 'buprenorphine', chantix: 'varenicline', lucemyra: 'lofexidine',
    nardil: 'phenelzine', parnate: 'tranylcypromine', marplan: 'isocarboxazid',
    ludiomil: 'maprotiline', asendin: 'amoxapine', vivactil: 'protriptyline',
    surmontil: 'trimipramine', navane: 'thiothixene', mellaril: 'thioridazine',
    stelazine: 'trifluoperazine', moban: 'molindone', sinemet: 'levodopa',
    mirapex: 'pramipexole', requip: 'ropinirole', neupro: 'rotigotine',
    azilect: 'rasagiline', comtan: 'entacapone', tasmar: 'tolcapone',
    keppra: 'levetiracetam', dilantin: 'phenytoin', vimpat: 'lacosamide',
    zonegran: 'zonisamide', felbatol: 'felbamate', sabril: 'vigabatrin',
    fycompa: 'perampanel', briviact: 'brivaracetam', xcopri: 'cenobamate',
    diacomit: 'stiripentol', epidiolex: 'cannabidiol', zarontin: 'ethosuximide',
    mysoline: 'primidone', luminal: 'phenobarbital', onfi: 'clobazam',
    banzel: 'rufinamide', potiga: 'ezogabine', oxycontin: 'oxycodone',
    percocet: 'oxycodone', vicodin: 'hydrocodone', norco: 'hydrocodone',
    dilaudid: 'hydromorphone', ultram: 'tramadol', demerol: 'meperidine',
    nucynta: 'tapentadol', advil: 'ibuprofen', motrin: 'ibuprofen',
    aleve: 'naproxen', mobic: 'meloxicam', celebrex: 'celecoxib',
    voltaren: 'diclofenac', indocin: 'indomethacin', toradol: 'ketorolac',
    flexeril: 'cyclobenzaprine', robaxin: 'methocarbamol', lioresal: 'baclofen',
    zanaflex: 'tizanidine', soma: 'carisoprodol', tylenol: 'acetaminophen'
  };
  // Generic -> the brand name his note uses (for the note-language line).
  var GENERIC_TO_BRAND = {
    venlafaxine: 'Effexor', aripiprazole: 'Abilify', atomoxetine: 'Strattera',
    sertraline: 'Zoloft', escitalopram: 'Lexapro', citalopram: 'Celexa',
    fluoxetine: 'Prozac', paroxetine: 'Paxil', fluvoxamine: 'Luvox',
    duloxetine: 'Cymbalta', desvenlafaxine: 'Pristiq', bupropion: 'Wellbutrin',
    mirtazapine: 'Remeron', vilazodone: 'Viibryd', vortioxetine: 'Trintellix',
    amitriptyline: 'Elavil', nortriptyline: 'Pamelor', imipramine: 'Tofranil',
    clomipramine: 'Anafranil', doxepin: 'Sinequan', olanzapine: 'Zyprexa',
    quetiapine: 'Seroquel', risperidone: 'Risperdal', paliperidone: 'Invega',
    ziprasidone: 'Geodon', lurasidone: 'Latuda', cariprazine: 'Vraylar',
    brexpiprazole: 'Rexulti', haloperidol: 'Haldol', clozapine: 'Clozaril',
    asenapine: 'Saphris', iloperidone: 'Fanapt', lumateperone: 'Caplyta',
    pimavanserin: 'Nuplazid', divalproex: 'Depakote', lamotrigine: 'Lamictal',
    carbamazepine: 'Tegretol', oxcarbazepine: 'Trileptal', gabapentin: 'Neurontin',
    pregabalin: 'Lyrica', topiramate: 'Topamax', hydroxyzine: 'Vistaril',
    buspirone: 'Buspar', clonazepam: 'Klonopin', lorazepam: 'Ativan',
    alprazolam: 'Xanax', diazepam: 'Valium', temazepam: 'Restoril',
    zolpidem: 'Ambien', eszopiclone: 'Lunesta', zaleplon: 'Sonata',
    ramelteon: 'Rozerem', suvorexant: 'Belsomra', methylphenidate: 'Ritalin',
    lisdexamfetamine: 'Vyvanse', guanfacine: 'Intuniv', clonidine: 'Catapres',
    prazosin: 'Minipress', propranolol: 'Inderal', benztropine: 'Cogentin',
    trihexyphenidyl: 'Artane', donepezil: 'Aricept', memantine: 'Namenda',
    rivastigmine: 'Exelon', galantamine: 'Razadyne', naltrexone: 'Vivitrol',
    acamprosate: 'Campral', disulfiram: 'Antabuse', varenicline: 'Chantix'
  };
  // Canonical generic name: strip salts/forms, map brand -> generic.
  function canonMedName(raw) {
    var s = String(raw || '').toLowerCase();
    s = s.replace(/\b(hcl|hbr|hydrochloride|mesylate|succinate|tartrate|maleate|fumarate|pamoate|decanoate|palmitate)\b/g, ' ');
    s = s.replace(/\b(oral|tablet|tablets|capsule|capsules|er|xr|sr|cr|xl|extended release|delayed release|disintegrating|solution|nasal|injection|patch|cream|liquid|suspension)\b/g, ' ');
    s = s.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    var words = s.split(' ').filter(Boolean);
    for (var i = 0; i < words.length; i++) {
      if (BRAND_TO_GENERIC[words[i]]) return BRAND_TO_GENERIC[words[i]];
    }
    return words.length ? words.join(' ') : '';
  }
  function displayMedName(canon) {
    if (!canon) return '';
    var first = canon.split(' ')[0];
    if (GENERIC_TO_BRAND[first]) return GENERIC_TO_BRAND[first];
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
  // Frequency phrases -> the abbreviation his note uses.
  function normFreq(sig) {
    var s = String(sig || '').toLowerCase();
    var prn = /\bprn\b|as needed|as-needed/.test(s);
    var base = '';
    if (/\bone time only\b/.test(s)) base = 'ONCE';
    else if (/\bthree times a day\b|tid\b/.test(s)) base = 'TID';
    else if (/\btwo times a day\b|bid\b/.test(s)) base = 'BID';
    else if (/\bfour times a day\b|qid\b/.test(s)) base = 'QID';
    else if (/\bone time a day\b|once a day\b|once daily\b|daily\b|\bqd\b/.test(s)) base = 'QD';
    else if (/\bat bedtime\b|qhs\b/.test(s)) base = 'QHS';
    else if (/\bevery morning\b|qam\b/.test(s)) base = 'QAM';
    else if (/\bevery 12 hours\b|q12h\b|every twelve hours/.test(s)) base = 'q12h';
    else if (/\bevery 8 hours\b|q8h\b/.test(s)) base = 'q8h';
    else if (/\bevery 6 hours\b|q6h\b/.test(s)) base = 'q6h';
    else if (/\bevery 4 hours\b|q4h\b/.test(s)) base = 'q4h';
    else if (/\bonce a week\b|weekly\b/.test(s)) base = 'weekly';
    else if (/\bonce a month\b|monthly\b|1x per month|one time a month/.test(s)) base = 'monthly';
    else if (/\bevery other day\b|qod\b/.test(s)) base = 'QOD';
    if (!base) return prn ? 'PRN' : '';
    return prn && base !== 'PRN' ? base + ' PRN' : base;
  }
  // Absolute indication rules (his, spec §2.5): dementia drugs are ALWAYS
  // dementia (even when the sig says otherwise); Melatonin -> sleep;
  // Remeron -> depression; benzos -> anxiety.
  var BENZO = /\b(alprazolam|xanax|clonazepam|klonopin|lorazepam|ativan|diazepam|valium|temazepam|restoril|oxazepam|serax|chlordiazepoxide|librium|clorazepate|tranxene)\b/i;
  var DEMENTIA_MED = /\b(memantine|namenda|donepezil|aricept|rivastigmine|exelon|galantamine|razadyne)\b/i;
  function indicationFor(canon, sig) {
    var s = String(sig || '');
    if (DEMENTIA_MED.test(canon)) return 'dementia';
    if (/\bmelatonin\b/i.test(canon)) return 'sleep';
    if (/\b(mirtazapine|remeron)\b/i.test(canon)) return 'depression';
    if (BENZO.test(canon)) return 'anxiety';
    var m = s.match(/\bfor\s+([a-z][a-z \/\-]{2,40})/i);
    if (m) {
      var ind = cleanText(m[1]).toLowerCase().replace(/\s*(and|or|with)\s.*$/, '').trim();
      if (ind && !/^(resident|patient|the|this)\b/.test(ind)) return ind;
    }
    return '';
  }
  // Parse one med order's text into {canon, display, strengthMg, pills,
  // totalMg, freq, prn, indication, tier, raw}. Returns null if the text
  // has no recognizable drug name.
  function parseMedOrder(text) {
    var t = cleanText(text);
    if (!t) return null;
    // Strip order metadata that follows the sig (Start/Stop dates,
    // prescriber): it is not part of the drug, the sig, or the
    // indication — and the indication regex would otherwise swallow it
    // ("for psychosis Start: 10/1/2026" -> "psychosis start").
    t = t.replace(/\b(start|stop|discontinued?|d\/c|prescriber|ordered by|verified by)\s*:[^;]*/gi, '').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    // The drug name is the LEADING portion: up to the strength ("N MG")
    // or the sig ("Give ..."). The sig words (give / by / mouth / for /
    // ...) must never become part of the name — otherwise the canonical
    // key is the whole sentence and can never match the note side's key,
    // so the verdict would go red on every med, every time.
    var namePart = t;
    var sm0 = t.match(/(\d+(?:\.\d+)?)\s*MG/i);
    if (sm0) namePart = t.slice(0, sm0.index);
    else {
      var gm0 = t.match(/\bgive\b/i);
      if (gm0) namePart = t.slice(0, gm0.index);
    }
    var canon = canonMedName(namePart);
    if (!canon) return null;
    // Strength: the first "N MG" (or "N MG/24HR" patch dose).
    var strengthMg = null;
    var sm = t.match(/(\d+(?:\.\d+)?)\s*MG(?:\/24HR)?/i);
    if (sm) strengthMg = parseFloat(sm[1]);
    // Pills: "Give X tablet(s)/capsule(s)" — X may be a decimal (2.5).
    var pills = 1;
    var pm = t.match(/give\s+(\d+(?:\.\d+)?)\s*(?:tablet|capsule|pill)/i);
    if (pm) pills = parseFloat(pm[1]);
    var totalMg = strengthMg !== null ? strengthMg * pills : null;
    var freq = normFreq(t);
    var prn = /\bprn\b|as needed/i.test(t);
    var ind = indicationFor(canon, t);
    // Tier: indication first (seizure / Parkinson's / pain), then name.
    var tier = 2; // rest
    var tierName = 'rest';
    if (/\bseizure|epilepsy\b/i.test(t)) { tier = 1; tierName = 'seizure'; }
    else if (/\bparkinson/i.test(t)) { tier = 1; tierName = 'parkinsons'; }
    else if (PAIN_MED.test(canon) && !PSYCH_MED.test(canon)) { tier = 3; tierName = 'pain'; }
    else if (PARKINSON_MED.test(canon)) { tier = 1; tierName = 'parkinsons'; }
    else if (SEIZURE_MED.test(canon)) { tier = 1; tierName = 'seizure'; }
    else if (PSYCH_MED.test(canon)) { tier = 0; tierName = 'psych'; }
    // Cogentin/Benztropine (EPS) sit LAST inside the psych tier (spec 3e).
    var eps = /\b(benztropine|cogentin|trihexyphenidyl|artane|procyclidine|biperiden)\b/i.test(canon);
    return {
      canon: canon, display: displayMedName(canon), strengthMg: strengthMg,
      pills: pills, totalMg: totalMg, freq: freq, prn: prn,
      indication: ind, tier: tier, tierName: tierName, eps: eps, raw: t
    };
  }
  // Consolidate split orders of the same med into ONE line (spec §2.5
  // rule 3): each part keeps its own sig — including PRN (spec 3a).
  // "- Klonopin 0.5mg BID and 0.5mg q12h PRN for anxiety".
  // Total dose is per-part (the line shows each part's own total dose).
  function medLine(parts) {
    var first = parts[0];
    var segs = parts.map(function (p) {
      var dose = p.totalMg !== null ? (p.totalMg % 1 === 0 ? String(p.totalMg) : String(p.totalMg)) + 'mg' : '';
      return dose + (p.freq ? ' ' + p.freq : '');
    }).filter(Boolean);
    var line = '- ' + first.display + ' ' + segs.join(' and ');
    if (first.indication) line += ' for ' + first.indication;
    return line;
  }
  // The meds panel frame doc (Dash): iFramePanel_Medications.
  function medsFrameDoc() {
    try {
      var f = document.getElementById('iFramePanel_Medications');
      if (!f) return null;
      var d = f.contentDocument || (f.contentWindow && f.contentWindow.document);
      if (!d || !d.body) return null;
      return d;
    } catch (e) { return null; }
  }
  // Gather the meds from the panel frame. Panel shape (old sortMeds):
  // table.scrollTable > tbody; a TR with >= 2 filled cells starts a group;
  // following TRs with < 2 filled cells belong to that group. The group's
  // text is parsed as one order (name + strength + sig).
  // A monthly depot / "one time only" order is NEVER silently dropped:
  // if it parses, it is a line; if it does not parse, it lands in review.
  function gatherMeds() {
    var doc = medsFrameDoc();
    if (!doc) return { loaded: false, psych: [], seizure: [], parkinsons: [], rest: [], pain: [], review: [], value: null };
    var tbody = null;
    try { tbody = doc.querySelector('table.scrollTable > tbody'); } catch (e) {}
    if (!tbody) return { loaded: false, psych: [], seizure: [], parkinsons: [], rest: [], pain: [], review: [], value: null };
    var groups = [];
    var cur = null;
    function filled(tr) {
      var n = 0;
      var tds = tr.querySelectorAll('td');
      for (var i = 0; i < tds.length; i++) if (cleanText(tds[i].textContent)) n++;
      return n;
    }
    Array.prototype.forEach.call(tbody.children, function (r) {
      if (r.tagName !== 'TR') return;
      if (filled(r) >= 2) { cur = { rows: [r] }; groups.push(cur); }
      else if (cur) cur.rows.push(r);
    });
    var orders = [];
    var review = [];
    groups.forEach(function (g) {
      // Join CELLS with spaces, not the row's bare textContent: adjacent
      // <td>s concatenate without a separator ("0.5 MGGive"), so the
      // first "Give" has no word boundary before it and the split below
      // misses it — the second order then parses as "BID PRN" instead
      // of "q12h PRN" (the first order's BID wins the freq scan).
      var text = g.rows.map(function (r) {
        var cells = r.querySelectorAll('td');
        var parts = [];
        for (var i = 0; i < cells.length; i++) {
          var c = cleanText(cells[i].textContent);
          if (c) parts.push(c);
        }
        return parts.join(' ');
      }).filter(Boolean).join(' ');
      // A group can hold TWO orders of the same med (the Klonopin case:
      // two "Give" segments in one group). Split on "Give" so each part
      // keeps its own sig — including PRN (spec 3a). The name + strength
      // prefix lives in the first segment; later segments reuse it. The
      // leading name-only segment (no "Give") is the prefix, not an
      // order — skip it when Give segments exist. A group with no "Give"
      // at all parses as a single order, as before.
      var segs = text.split(/(?=\bgive\b)/i).map(cleanText).filter(Boolean);
      if (!segs.length) { if (text) review.push(text); return; }
      var hasGive = segs.some(function (s) { return /\bgive\b/i.test(s); });
      var prefix = segs[0];
      var gm = prefix.match(/\bgive\b/i);
      if (gm) prefix = cleanText(prefix.slice(0, gm.index));
      segs.forEach(function (seg, idx) {
        if (hasGive && !/\bgive\b/i.test(seg)) return; // name-only prefix, not an order
        var orderText = (idx === 0 || !hasGive) ? seg : (prefix + ' ' + seg);
        var o = parseMedOrder(orderText);
        if (o) orders.push(o);
        else if (orderText) review.push(orderText);
      });
    });
    // Consolidate split orders (same canonical med) — parts keep sigs.
    var byCanon = {};
    orders.forEach(function (o) {
      (byCanon[o.canon] = byCanon[o.canon] || []).push(o);
    });
    var psych = [], seizure = [], parkinsons = [], rest = [], pain = [];
    Object.keys(byCanon).forEach(function (canon) {
      var parts = byCanon[canon];
      var line = medLine(parts);
      var tier = parts[0].tier, tierName = parts[0].tierName;
      // The verdict set keys: one per part, (canonical name + total dose),
      // the same normalized form the note side parses to. A dose change
      // is a different key — so it goes red.
      var keys = parts.map(function (p) {
        return p.canon + '|' + (p.totalMg !== null ? p.totalMg : '');
      });
      var entry = { canon: canon, line: line, tier: tier, tierName: tierName, eps: parts[0].eps, parts: parts.length, keys: keys };
      if (tierName === 'psych') psych.push(entry);
      else if (tierName === 'seizure') seizure.push(entry);
      else if (tierName === 'parkinsons') parkinsons.push(entry);
      else if (tierName === 'pain') pain.push(entry);
      else rest.push(entry);
    });
    // Tile order (spec 3e + the Melatonin ruling, his, 2026-11-24):
    // psych first, then seizure, then Parkinson's, then the rest, pain
    // at the bottom; Cogentin/Benztropine (EPS) last inside psych among
    // the rest — and Melatonin LAST on the psych list, after the EPS
    // meds. The sort is stable, so the remaining psych meds keep the
    // order the panel gathered them in.
    function isMelatonin(e) { return e.canon === 'melatonin'; }
    function sortPsych(a, b) {
      return (isMelatonin(a) ? 1 : 0) - (isMelatonin(b) ? 1 : 0) ||
             (a.eps ? 1 : 0) - (b.eps ? 1 : 0);
    }
    psych.sort(sortPsych);
    var value = psych.length ? psych.map(function (e) { return e.line; }).join('\n') : '- none';
    return {
      loaded: true, psych: psych, seizure: seizure, parkinsons: parkinsons,
      rest: rest, pain: pain, review: review, value: value
    };
  }
  // The psych-meds set for the verdict: normalized (canonical name +
  // total dose) keys, order-free. A dose change is a different key
  // (the chart's 50mg is not in a note that has 25mg) — so it goes red.
  function psychMedSet(meds) {
    var set = [];
    (meds.psych || []).forEach(function (e) {
      (e.keys || [e.canon]).forEach(function (k) {
        if (set.indexOf(k) === -1) set.push(k);
      });
    });
    return set.sort();
  }

  // ---- diagnoses (spec §2.6): notes only, NEVER the chart panel ----
  // On the Progress Notes page: #pnDxBox (the diagnoses-from-notes box).
  // On the Dashboard: the cached notes list (dxCached) from the packet —
  // populated on the last Progress Notes visit, same patient only.
  // The chart's Diagnoses panel is often wrong (his) — never a source.
  function gatherDx(cached) {
    var box = null;
    try { box = document.getElementById('pnDxBox'); } catch (e) {}
    if (box) {
      var text = cleanText(box.textContent);
      var lines = text ? text.split(/[,;\n]/).map(cleanText).filter(Boolean) : [];
      return { lines: lines, source: 'notes' };
    }
    if (cached && cached.lines && cached.lines.length) {
      return { lines: cached.lines.slice(), source: 'notes-cache' };
    }
    return { lines: [], source: null };
  }
  // The chart diagnoses DISPLAY (psych tiered to top, for his reference).
  // Display only — never a source for the diagnoses tile. The verdict for
  // psychDx is note-type driven (spec §4.1), so this only records whether
  // the panel exists; slice 3 renders it.
  function gatherPsychDxDisplay() {
    var doc = null;
    try {
      var f = document.getElementById('iFramePanel_ActiveDiagnoses');
      if (f) doc = f.contentDocument || (f.contentWindow && f.contentWindow.document);
    } catch (e) {}
    return { present: !!(doc && doc.body && cleanText(doc.body.textContent)) };
  }

  // ---- relationships (spec §2.4): Profile contacts table ----
  // A table whose header row has Name + Contact Type (the old extractor's
  // rule — only a real contacts table, never a table that merely mentions
  // "Contact Type"). Rows give {name, rel} from the Name + Relation cells.
  // In-laws stay distinct ("daughter-in-law" is NOT "daughter") — no
  // normalization of the relationship label, ever.
  function gatherRel() {
    var tables;
    try { tables = document.querySelectorAll('table'); } catch (e) { return { contacts: [], value: null }; }
    for (var ti = 0; ti < tables.length; ti++) {
      var t = tables[ti];
      var headCells = t.querySelectorAll('thead th, tr th');
      var heads = [];
      for (var h = 0; h < headCells.length; h++) heads.push(cleanText(headCells[h].textContent).toLowerCase());
      var nameIdx = -1, relIdx = -1;
      for (var k = 0; k < heads.length; k++) {
        if (/^name\b/.test(heads[k])) nameIdx = k;
        if (/^relation\b/.test(heads[k])) relIdx = k;
      }
      if (nameIdx === -1 || relIdx === -1) continue;
      if (heads.indexOf('contact type') === -1 && !heads.some(function (x) { return /^contact type\b/.test(x); })) continue;
      var contacts = [];
      var rows = t.querySelectorAll('tbody tr');
      for (var ri = 0; ri < rows.length; ri++) {
        var tds = rows[ri].querySelectorAll('td');
        if (tds.length <= Math.max(nameIdx, relIdx)) continue;
        var name = cleanText(tds[nameIdx].textContent).replace(/\s*\(\d+\)\s*$/, '');
        var rel = cleanText(tds[relIdx].textContent);
        if (name) contacts.push({ name: name, rel: rel });
      }
      return { contacts: contacts, value: relValue(contacts) };
    }
    return { contacts: [], value: null };
  }
  // 'self' when no contacts at all; 'other' when names but no labels.
  function relValue(contacts) {
    if (!contacts || !contacts.length) return 'self';
    var parts = contacts.map(function (c) {
      return c.rel ? c.name + ' (' + c.rel + ')' : c.name + ' (other)';
    });
    return parts.join(', ');
  }
  // The relationships set for the verdict: (name + relationship) pairs,
  // order-free, in-laws distinct. 'self' normalizes to the empty set
  // (no contacts = nothing to compare); 'other' pairs keep the name.
  function relSet(contacts) {
    if (!contacts || !contacts.length) return [];
    return contacts.map(function (c) {
      return (c.name || '').toLowerCase() + '|' + (c.rel || 'other').toLowerCase();
    }).sort();
  }

  // ---- weight (spec §2.2): vitals page, else the packet cache ----
  // The weight is NOT on the chart header. On the Weights/Vitals page it
  // is read live; elsewhere the Brain uses the cached value from the last
  // visit (same patient only). Never red on its own — informational only.
  function gatherWeight(cached) {
    var text = '';
    try { text = document.body ? document.body.textContent : ''; } catch (e) {}
    var m = null;
    if (/weights?\s+and\s+vitals/i.test(text) || /vitals/i.test(document.title || '')) {
      m = text.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds)\b/i);
    }
    if (m) return { value: m[1] + ' lb', source: 'vitals' };
    if (cached && cached.value) return { value: cached.value, source: 'cache' };
    return { value: null, source: null };
  }

  // ---- the note (form pages): read the textareas, cache the facts ----
  // The note is HIS words. The Brain reads it on the form page and caches
  // the parsed facts in the packet (stamped patient + time), so the
  // verdicts on chart pages can compare chart vs note. The cache is
  // refused when the patient doesn't match.
  function gatherNote() {
    var tas = [];
    try { tas = Array.prototype.slice.call(document.querySelectorAll('textarea')); } catch (e) {}
    if (!tas.length) return null;
    var text = tas.map(function (t) { return t.value || ''; }).join('\n');
    if (!cleanText(text)) return { text: '', bims: [], bimsNA: false, psychMeds: [], dxText: '', dxEmpty: true, allergies: '', allergiesSet: [], rel: [], relSet: [], hasAllergiesLine: false };
    return parseNote(text);
  }
  // Parse the note into the facts the verdicts compare against.
  // BIMS: the one-line "BIMS: 15 on 11/23/26, 13 on 3/7/27" format
  // (newest last), plus the old multi-line "Per Chart, BIMS" + one score
  // per line. "NA" when the note carries NA instead of a score.
  // Psych meds: the lines under the "Psych meds" anchor, parsed to the
  // same normalized (name + dose) keys as the chart side.
  // Diagnoses: the text between "Medical Hx" and "Family/Social Hx"
  // (the "xx" placeholder stripped) — empty means nothing written.
  // Allergies: the text after "Allergies" on its line. Relationships:
  // the "Primary contact" line + "Family/Social Hx" line.
  function parseNote(text) {
    var t = String(text || '');
    // BIMS
    var bims = [];
    var na = false;
    var bm = t.match(/BIMS:\s*([^\n]*)/i);
    if (bm) {
      var seg = bm[1];
      if (/\bNA\b/i.test(seg)) na = true;
      var parts = seg.split(',');
      parts.forEach(function (p) {
        var m = p.match(/(\d+)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (m) bims.push({ score: parseInt(m[1], 10), date: m[2], d: parseMDYY(m[2]) });
      });
    }
    if (!bims.length && !na) {
      // Old multi-line format: "Per Chart, BIMS" + one score per line.
      var lines = t.split('\n');
      var inBims = false;
      lines.forEach(function (ln) {
        if (/per chart,?\s*bims/i.test(ln)) { inBims = true; return; }
        if (inBims) {
          var m = ln.match(/^\s*(\d+)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/);
          if (m) bims.push({ score: parseInt(m[1], 10), date: m[2], d: parseMDYY(m[2]) });
          else if (/^\s*(BIMS|Medical Hx|Family|Primary|Allergies|Psych)/i.test(ln)) inBims = false;
        }
      });
    }
    // Psych meds section: lines after a "Psych meds" line, until the next
    // section header. Each "- Name dosemg FREQ for indication" line parses
    // to a normalized (name + dose) key, the same form as the chart side.
    var psychMeds = [];
    var pm = t.match(/Psych meds[^\n]*\n([\s\S]*?)(?=\n\s*(?:Allergies|Medical Hx|Family\/Social|Primary contact|BIMS|HPI|MSE|Impression)|$)/i);
    var pmText = pm ? pm[1] : '';
    pmText.split('\n').forEach(function (ln) {
      var line = cleanText(ln);
      if (!line || line === '- none') return;
      var m = line.match(/^[-•]\s*(.+)$/);
      if (!m) return;
      var body = m[1];
      var nm = body.match(/^([A-Za-z][A-Za-z ]*?)\s+(\d+(?:\.\d+)?)\s*mg\b/i);
      if (!nm) return;
      var canon = canonMedName(nm[1]);
      if (!canon) return;
      psychMeds.push(canon + '|' + parseFloat(nm[2]));
    });
    psychMeds.sort();
    // Diagnoses: between "Medical Hx" and "Family/Social Hx".
    var dxText = '';
    var dxm = t.match(/Medical Hx[^\n]*\n([\s\S]*?)(?=\n\s*Family\/Social Hx|$)/i);
    if (dxm) dxText = cleanText(dxm[1].replace(/\bxx\b/g, ''));
    var dxEmpty = !dxText;
    // Allergies line.
    var allergies = '';
    var hasAllergiesLine = false;
    var am = t.match(/^[ \t]*Allergies\s*:?\s*([^\n]*)/im);
    if (am) { allergies = cleanText(am[1]).replace(/\bxx\b/g, '').trim(); hasAllergiesLine = true; }
    // Relationships: "Primary contact" line + "Family/Social Hx" line.
    var rel = [];
    var pcm = t.match(/^[ \t]*Primary contact\s*:?\s*([^\n]*)/im);
    if (pcm) {
      var pc = cleanText(pcm[1]).replace(/\bxx\b/g, '').trim();
      if (pc) pc.split(/,/).forEach(function (p) {
        var pp = cleanText(p);
        if (!pp) return;
        var rm = pp.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        if (rm) rel.push({ name: rm[1], rel: rm[2] });
        else rel.push({ name: pp, rel: '' });
      });
    }
    return {
      text: t, bims: bims, bimsNA: na, psychMeds: psychMeds,
      dxText: dxText, dxEmpty: dxEmpty, allergies: allergies,
      allergiesSet: allergySet(allergies), rel: rel, relSet: relSet(rel),
      hasAllergiesLine: hasAllergiesLine
    };
  }

  // ---- gatherAll: one bounded pass, then the packet carries it ----
  // Reads the current page. Facts the page doesn't have come from the
  // packet cache (same patient only, stamped) — a native read overwrites
  // any copy on sight; a copy never overwrites a native read.
  function gatherAll(oldPacket) {
    var id = patientId();
    var cached = (oldPacket && oldPacket.key === id) ? oldPacket : null;
    var header = gatherHeader();
    var facility = gatherFacility();
    var allergies = gatherAllergies();
    var reentry = gatherReentry();
    // The list facts (psych rows + BIMS) live on the assessments list
    // page; the re-entry date lives on the Dash. The classification needs
    // BOTH, so each is merged native-first, cache-second:
    //   - a list table on THIS page -> native rows (even if empty: a real
    //     new patient); no table -> the cached rows from the last list visit.
    //   - a re-entry date on THIS page -> native; otherwise the cached one.
    // A native read overwrites any copy on sight; a copy never overwrites
    // a native read. Without this merge the Dash (no list table) would
    // call every patient NEW.
    var list = { rows: [], hasTable: false };
    try { list = listRows(); } catch (e) { list = { rows: [], hasTable: false }; }
    var psychRows, bimsList;
    if (list.hasTable) {
      bimsList = gatherBims(list.rows);
      psychRows = gatherPsychRows(list.rows);
    } else {
      // Cached rows come back from JSON with d as an ISO string — re-hydrate.
      bimsList = { newest: null, all: [] };
      psychRows = (cached && cached.psychRows) ? cached.psychRows.map(function (r) {
        return { date: r.date, status: r.status, score: r.score, d: parseMDY(r.date) };
      }) : [];
    }
    var reentryDate = reentry.reentry || (cached && cached.readmit ? cached.readmit.reentry : null);
    var classification = classify(psychRows, reentryDate, facility);
    var meds = gatherMeds();
    var dx = gatherDx(cached ? cached.dxCached : null);
    var psychDx = gatherPsychDxDisplay();
    var rel = gatherRel();
    var weight = gatherWeight(cached ? cached.weight : null);
    var note = gatherNote();
    // Cached facts (same patient only): BIMS from the last list visit,
    // meds from the last Dash visit, the note from the last form visit.
    // A native read on THIS page wins; otherwise the cache.
    var bims;
    if (list.hasTable) {
      bims = bimsList.newest
        ? { value: bimsList.newest.score + ' on ' + bimsList.newest.date, date: bimsList.newest.date, score: bimsList.newest.score, source: 'list' }
        : { value: null, date: null, score: null, source: null };
    } else {
      bims = (cached && cached.bims && cached.bims.value) ? cached.bims : { value: null, date: null, score: null, source: null };
    }
    var bimsPrev = (cached && cached.bimsPrev) ? cached.bimsPrev : null;
    if (bimsList.all.length > 1) {
      var sorted = bimsList.all.slice().sort(function (a, b) { return (a.d || 0) - (b.d || 0); });
      var prev = sorted[sorted.length - 2];
      bimsPrev = { value: prev.score + ' on ' + prev.date, date: prev.date, score: prev.score };
    }
    var medsFact = meds.loaded ? meds : (cached && cached.meds && cached.meds.loaded ? cached.meds : meds);
    var relFact = (rel.contacts && rel.contacts.length) ? rel : (cached && cached.rel && cached.rel.contacts && cached.rel.contacts.length ? cached.rel : rel);
    var noteFact = note || (cached && cached.note ? cached.note : null);
    // Chart facts that live on the Dash but NOT on the form page
    // (age/sex, room, allergies, facility): native when this page has
    // them, else the cache (same patient only). Without this the form
    // page would read allergies as empty and age/sex as null — and a
    // chart-vs-note compare on the form would be decided on nothing.
    var ageSexFact = header.ageSex ? { value: header.ageSex, room: header.room, time: Date.now(), key: id, strength: 'native' }
      : (cached && cached.ageSex && cached.ageSex.value ? cached.ageSex : { value: header.ageSex, room: header.room, time: Date.now(), key: id, strength: 'native' });
    var roomFact = header.room ? { value: header.room, time: Date.now(), key: id, strength: 'native' }
      : (cached && cached.room && cached.room.value ? cached.room : { value: header.room, time: Date.now(), key: id, strength: 'native' });
    // (v0.3.4: the nameFact cache was here. Removed per Rest VETO
    // 2026-11-24 — the Brain never holds a resident name.)
    var allergiesFact = allergies.found
      ? { value: allergies.raw, set: allergies.set, time: Date.now(), key: id, strength: 'native' }
      : (cached && cached.allergies && cached.allergies.value !== undefined ? cached.allergies : { value: allergies.raw, set: allergies.set, time: Date.now(), key: id, strength: 'native' });
    var facilityFact = facility || (cached && cached.facility) || null;
    return {
      ageSex: ageSexFact,
      room: roomFact,
      facility: facilityFact,
      allergies: allergiesFact,
      readmit: { reentry: reentryDate, initial: reentry.initial, discharge: reentry.discharge, time: Date.now(), key: id, strength: 'native' },
      bims: bims, bimsPrev: bimsPrev, bimsAll: bimsList.all,
      psychRows: psychRows,
      classification: classification,
      meds: medsFact,
      dx: { value: dx.lines.join(', '), lines: dx.lines, time: Date.now(), key: id, strength: 'native', source: dx.source },
      dxCached: dx.source === 'notes' ? { value: dx.lines.join(', '), lines: dx.lines, time: Date.now(), key: id, strength: 'native', source: 'notes-cache' } : (cached ? cached.dxCached : null),
      psychDx: psychDx,
      rel: relFact,
      weight: weight,
      note: noteFact
    };
  }

  // ---- verdicts: red / ok / hidden per tile, EXACTLY per the spec ----
  // The spec supersedes the old verdicts.js wherever they differ.
  // decideVerdicts(facts) is pure: same facts in, same verdicts out.
  // Each verdict carries the reason + the facts it rests on.
  function decideVerdicts(f) {
    var noteType = (f.classification && f.classification.verdict) || 'followup';
    var isNew = noteType === 'new';
    var isReadmit = noteType === 'readmit';
    var isFollowup = noteType === 'followup' || noteType === 'quarterly';
    var facility = f.facility;
    var verdicts = {}, visibility = {}, reasons = {};
    function set(key, verdict, visible, reason) {
      verdicts[key] = verdict; visibility[key] = visible; reasons[key] = reason;
    }
    // --- BIMS (spec §2.3) ---
    // Value: the last score, or "NA" when the chart has no BIMS at all.
    // Red: always on admission + readmission. On follow-up, only if the
    // note has no BIMS in the previous 12 months.
    // 0/99: red until ONE 0 or 99 is in the note (transfer once, no
    // duplicate); once recorded, never red — UNLESS the score goes up by
    // 5+ points, then red again, repeating until a 0/99 is recorded again.
    // (Interpretation, flagged: a rise is measured from the recorded 0/99.
    //  From a recorded 0, a real chart score >= 5 is a 5+ rise. From a
    //  recorded 99 — "not testable" — any newer real score means the
    //  patient is testable again, so it goes red.)
    var bimsVal = f.bims && f.bims.value ? f.bims.value : 'NA';
    var chartScore = (f.bims && typeof f.bims.score === 'number') ? f.bims.score : null;
    var noteBims = (f.note && f.note.bims) || [];
    var noteNewest = noteBims.length ? noteBims[noteBims.length - 1] : null;
    var noteHas099 = noteBims.some(function (b) { return b.score === 0 || b.score === 99; });
    var noteHasRecentBims = false;
    if (noteNewest && noteNewest.d) {
      var ageDays = daysBetween(noteNewest.d, new Date());
      noteHasRecentBims = ageDays !== null && ageDays <= 365;
    }
    var bimsRed = false, bimsWhy = '';
    if (chartScore === 0 || chartScore === 99) {
      if (!noteHas099) { bimsRed = true; bimsWhy = 'chart shows ' + chartScore + ', not in the note yet — transfer once'; }
      else { bimsRed = false; bimsWhy = '0/99 already in the note — stop testing'; }
    } else if (noteHas099 && chartScore !== null) {
      // Rise after a recorded 0/99.
      var recorded = null;
      for (var bi = noteBims.length - 1; bi >= 0; bi--) {
        if (noteBims[bi].score === 0 || noteBims[bi].score === 99) { recorded = noteBims[bi].score; break; }
      }
      if (recorded === 0 && chartScore >= 5) { bimsRed = true; bimsWhy = 'score rose from 0 to ' + chartScore + ' (5+) — new scores needed again'; }
      else if (recorded === 99) { bimsRed = true; bimsWhy = 'testable again after a 99 (chart ' + chartScore + ') — new scores needed again'; }
      else { bimsRed = false; bimsWhy = 'recorded 0/99, chart ' + chartScore + ' is not a 5+ rise'; }
    } else if (isNew || isReadmit) {
      bimsRed = true; bimsWhy = 'admission/readmission — always red';
    } else {
      bimsRed = !noteHasRecentBims;
      bimsWhy = noteHasRecentBims ? 'note has a BIMS in the last 12 months' : 'no BIMS in the note in the last 12 months';
    }
    var bimsVisible = isNew || isReadmit || bimsRed;
    set('bims', bimsVisible ? (bimsRed ? 'red' : 'ok') : 'hidden', bimsVisible,
      'value=' + bimsVal + '; ' + bimsWhy);
    // --- Psych meds (spec §2.5) ---
    // Red ONLY if other than "- none", and only when the chart set differs
    // from the note set (set compare — order doesn't matter, within or
    // across groups). "- none" is never red.
    var medsVal = (f.meds && f.meds.value) || '- none';
    var chartMeds = psychMedSet(f.meds || {});
    var noteMeds = (f.note && f.note.psychMeds) || [];
    var medsDiffer = JSON.stringify(chartMeds) !== JSON.stringify(noteMeds.slice().sort());
    var medsRed = medsVal !== '- none' && medsDiffer;
    set('psychMeds', medsRed ? 'red' : 'ok', true,
      'value=' + medsVal.replace(/\n/g, ' / ') + '; chart=' + JSON.stringify(chartMeds) + ' note=' + JSON.stringify(noteMeds) + (medsVal === '- none' ? ' — "- none" is never red' : medsDiffer ? ' — sets differ' : ' — sets match'));
    // --- Diagnoses tile (spec §2.6) ---
    // Red ONLY if NOTHING is written in his note at all. Appears only on
    // admission + readmissions (never on follow-up).
    var dxVisible = isNew || isReadmit;
    var dxEmpty = !f.note || f.note.dxEmpty !== false;
    var dxRed = dxVisible && dxEmpty;
    set('diagnoses', dxVisible ? (dxRed ? 'red' : 'ok') : 'hidden', dxVisible,
      dxVisible ? (dxEmpty ? 'nothing written in the note' : 'something written in the note') : 'follow-up — tile does not appear');
    // --- Psych diagnoses on the Dash (spec §4.1) ---
    // Only for new patients + readmissions, never follow-up. Only red on
    // admission (on readmission they show but are not red).
    var psychDxVisible = isNew || isReadmit;
    var psychDxRed = isNew;
    set('psychDx', psychDxVisible ? (psychDxRed ? 'red' : 'ok') : 'hidden', psychDxVisible,
      psychDxVisible ? (isNew ? 'admission — red' : 'readmission — shows, not red') : 'follow-up — never shown');
    // --- Allergies (spec §1.3) ---
    // Red only if note and chart disagree (set compare, PCN normalized).
    // NEVER red at Bedford or Crown Heights. Visibility: admission always;
    // readmission + follow-up only if there is a difference.
    var chartAlg = (f.allergies && f.allergies.set) || [];
    var noteAlg = (f.note && f.note.allergiesSet) || [];
    // No Allergies line in the note at all -> it disagrees (nothing written).
    var noteHasAlgLine = !!(f.note && f.note.hasAllergiesLine);
    var algDiffer = JSON.stringify(chartAlg) !== JSON.stringify(noteAlg.slice().sort());
    if (!noteHasAlgLine && f.note) algDiffer = true; // no Allergies line at all -> red
    var algRed = algDiffer && facility !== 'bedford' && facility !== 'crown';
    var algVisible = isNew || algDiffer;
    set('allergies', algVisible ? (algRed ? 'red' : 'ok') : 'hidden', algVisible,
      'chart=' + JSON.stringify(chartAlg) + ' note=' + JSON.stringify(noteAlg) + (facility === 'bedford' || facility === 'crown' ? ' — never red at ' + facility : algDiffer ? ' — differ' : ' — agree'));
    // --- Relationships (spec §2.4) ---
    // Red ONLY on a NEW patient (admission). Visibility: admission always;
    // readmission only if different from the note (set compare, in-laws
    // distinct); never on follow-up.
    var chartRel = relSet((f.rel && f.rel.contacts) || []);
    var noteRel = (f.note && f.note.relSet) || [];
    var relDiffer = JSON.stringify(chartRel) !== JSON.stringify(noteRel.slice().sort());
    var relVisible = isNew || (isReadmit && relDiffer);
    var relRed = isNew;
    set('relationships', relVisible ? (relRed ? 'red' : 'ok') : 'hidden', relVisible,
      'chart=' + JSON.stringify(chartRel) + ' note=' + JSON.stringify(noteRel) + (isNew ? ' — admission, red' : isReadmit ? (relDiffer ? ' — readmission, differs, not red' : ' — readmission, same') : ' — follow-up, never shown'));
    // --- Room, weight, re-entry: NEVER red on their own (spec §4.1). ---
    set('room', 'ok', true, 'informational only — never red');
    set('weight', 'ok', true, 'informational only — never red');
    set('reentry', 'ok', true, 'informational only — never red');
    return { verdicts: verdicts, visibility: visibility, reasons: reasons };
  }

  // ================================================================
  // SLICE 3 — TILES
  // Plant the tile band ONCE, from the settled packet, on the Dash and
  // the Progress Notes page. Display-only: no clicks (the Hand, slice
  // 4), no keys (slice 4), no clipboard, no form writes, no note writes.
  // The tiles render slice 2's verdicts + visibility — they never
  // recompute a verdict, except age/sex (slice 2 publishes no ageSex
  // verdict; the tiles module derives it from the note type — see
  // tileState, flagged there).
  // Smooth Arrival: the band plants ONCE, at final size, in its final
  // position (immediately above the tab bar). It never re-plants, never
  // grows, never flickers. The band is a snapshot of the settled packet
  // for this page load — values settle inside their frames; there is no
  // re-render cascade and no in-place value update after planting.
  // Settle, then render: on the Dash the band waits for the meds frame
  // (the psych meds tile's size depends on how many med lines there
  // are, so planting before the frame loads would grow the tile). The
  // wait is the frame's load event (once) — never a timer, never a poll.
  // Brand-new patient (his ruling, 2026-11-24): if the Brain cannot
  // identify the patient (no packet), plant NOTHING — the band stays
  // blank until it finds the right ID.
  // NOTE on CSS timing: the Brain is @run-at document-end (not
  // document-start as the architecture states), and v0.2.0 injected no
  // CSS at all — slice 3 introduces the stylesheet. The style element
  // and the band are created in the same synchronous pass, so they land
  // in one paint: the band itself never shows unstyled and never
  // re-lays-out. The page content below the band shifts down once when
  // the band is inserted (inherent to adding a row above the tab bar —
  // the old system did the same).
  // ================================================================

  // ---- tile stylesheet: the ORIGINAL look (his ruling, 2026-11-24) ----
  // "Stick to the original looking design of the chart" — do not change
  // the way it looks until it is operating correctly and quickly. So
  // the tiles copy the old Core's TmTile styling verbatim (card/label/
  // value CSS from the TmTile custom element; band from TILE_CSS),
  // not the Docker redesign. No Lucide icons, no new colors.
  // Card: #fff, 1px #e2e8f0, 12px radius, 0 1px 3px shadow, 12/16/14px
  // padding. Label: 10.5px/700/.1em/uppercase/#8494a7. Value: 21px/700/
  // 1.3/#131c2b; missing "—": #b6c2d2. Red (warn): FULL #ff1a1a
  // background, white text, 1px #ff8080 border, red glow shadow,
  // label #ffe1e1 — a red tile, not a red border.
  // The psych meds tile lists PSYCH meds only (his ruling, 2026-11-24:
  // "in the psych med tiles, it should just list psych meds"). The
  // seizure / Parkinson's / pain grouping, the tier ordering, and the
  // distinct borders live on the FULL MEDS LIST on the Dash (the panel),
  // where the groups are identified clearly — NOT in the tile. The tile
  // has one group (psych meds), so there is nothing to border and no
  // tier CSS here. The packet still gathers and carries the seizure /
  // Parkinson's / pain groups (the panel's source); the tile just does
  // not display them.
  var TILE_CSS_ID = 'tmV1TilesStyle';
  var TILE_CSS = [
    '#tmV1Band{display:flex;flex-wrap:wrap;justify-content:flex-start;gap:12px;padding:8px 12px;margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;box-sizing:border-box;}',
    '.tm-v1-tile{flex:0 1 auto;max-width:660px;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,.05);padding:12px 16px 14px;background:#fff;box-sizing:border-box;}',
    '.tm-v1-tile .tm-v1-label{white-space:nowrap;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8494a7;}',
    '.tm-v1-tile .tm-v1-value{margin-top:9px;font-size:21px;font-weight:700;line-height:1.3;color:#131c2b;white-space:pre-wrap;word-break:break-word;}',
    '.tm-v1-tile .tm-v1-value.tm-v1-muted{color:#b6c2d2;}',
    '.tm-v1-tile.tm-v1-red{background:#ff1a1a;border:1px solid #ff8080;box-shadow:0 0 10px rgba(255,26,26,.55),0 1px 3px rgba(15,23,42,.05);}',
    '.tm-v1-tile.tm-v1-red .tm-v1-label{color:#ffe1e1;}',
    '.tm-v1-tile.tm-v1-red .tm-v1-value{color:#ffffff;}',
    '.tm-v1-tile.tm-v1-red .tm-v1-value.tm-v1-muted{color:#ffffff;}'
  ].join('\n');
  function ensureTileCSS() {
    try {
      if (document.getElementById(TILE_CSS_ID)) return;
      var st = document.createElement('style');
      st.id = TILE_CSS_ID;
      st.textContent = TILE_CSS;
      var head = document.head || document.getElementsByTagName('head')[0];
      if (head) head.appendChild(st);
      else document.documentElement.appendChild(st);
    } catch (e) {}
  }

  // ---- which tiles, in band order ----
  // The band order is not ruled in the spec; this is the task's order:
  // psych meds first (his floor), then diagnoses, room, weight, BIMS,
  // age/sex, allergies, relationships, re-entry.
  var TILE_DEFS = [
    { key: 'psychMeds', label: 'Psych meds' },
    { key: 'diagnoses', label: 'Diagnoses' },
    { key: 'room', label: 'Room' },
    { key: 'weight', label: 'Weight' },
    { key: 'bims', label: 'BIMS' },
    { key: 'ageSex', label: 'Age/Sex' },
    { key: 'allergies', label: 'Allergies' },
    { key: 'relationships', label: 'Relationships' },
    { key: 'reentry', label: 'Re-entry' }
  ];

  // ---- tile state: visibility + red/ok, straight from the packet ----
  // Slice 2 decides every tile except age/sex (it publishes no ageSex
  // verdict — the HPI-word compare was never wired into decideVerdicts).
  // For age/sex the tiles module derives visibility from the note type
  // (spec §4.1): admission -> show + red; readmission -> show, not red;
  // follow-up -> hidden. A wrong age on readmission/follow-up cannot go
  // red until slice 2 computes the HPI verdict — flagged, not decided.
  // Re-entry: slice 2 sets it visible always (informational). Spec §4.1's
  // follow-up list omits re-entry (it never needs updating), so the packet
  // and the spec disagree on follow-up — the packet wins here (use what
  // slice 2 decided); flagged, not decided.
  function tileState(key, packet) {
    var v = packet.verdicts || {};
    var vis = packet.visibility || {};
    if (key === 'ageSex') {
      var nt = (packet.classification && packet.classification.verdict) || 'followup';
      if (nt === 'new') return { visible: true, red: true };
      if (nt === 'readmit') return { visible: true, red: false };
      return { visible: false, red: false };
    }
    if (v[key] === 'hidden' || vis[key] === false) return { visible: false, red: false };
    return { visible: true, red: v[key] === 'red' };
  }

  // ---- tile DOM builders (textContent only — no innerHTML anywhere) ----
  function tileEl(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== null && text !== undefined) d.textContent = text;
    return d;
  }
  // The psych meds tile lists PSYCH meds only (his ruling, 2026-11-24).
  // It renders the psych lines (packet.meds value, Melatonin last) as
  // plain text — no seizure group, no Parkinson's group, no tier group
  // labels, no tier borders. The seizure / Parkinson's / pain groups
  // stay in the packet (the full meds list on the Dash is their home);
  // the tile is the psych meds tile. The psych group IS the copy value.
  // Rest/pain meds are not in the tile either. When the meds frame has
  // not loaded, the tile reads "not loaded" rather than "- none" —
  // "- none" means no medications at all, and an unloaded panel must
  // never read as none.
  function buildTile(key, label, packet) {
    var st = tileState(key, packet);
    if (!st.visible) return null;
    var tile = tileEl('div', 'tm-v1-tile' + (st.red ? ' tm-v1-red' : ''));
    tile.setAttribute('data-tile', key);
    tile.appendChild(tileEl('div', 'tm-v1-label', label));
    var val = tileEl('div', 'tm-v1-value');
    if (key === 'psychMeds') {
      var meds = packet.meds || {};
      if (!meds.loaded) {
        val.textContent = 'not loaded';
        val.className += ' tm-v1-muted';
      } else {
        val.textContent = meds.value || '- none';
      }
    } else if (key === 'diagnoses') {
      var dx = (packet.dx && packet.dx.value) || '';
      val.textContent = dx || '—';
      if (!dx) val.className += ' tm-v1-muted';
    } else if (key === 'room') {
      var room = (packet.room && packet.room.value) || '';
      val.textContent = room || '—';
      if (!room) val.className += ' tm-v1-muted';
    } else if (key === 'weight') {
      var w = (packet.weight && packet.weight.value) || '';
      val.textContent = w || '—';
      if (!w) val.className += ' tm-v1-muted';
    } else if (key === 'bims') {
      val.textContent = (packet.bims && packet.bims.value) || 'NA';
    } else if (key === 'ageSex') {
      var a = (packet.ageSex && packet.ageSex.value) || '';
      val.textContent = a || '—';
      if (!a) val.className += ' tm-v1-muted';
    } else if (key === 'allergies') {
      var al = (packet.allergies && packet.allergies.value) || '';
      val.textContent = al || '—';
      if (!al) val.className += ' tm-v1-muted';
    } else if (key === 'relationships') {
      var r = (packet.rel && packet.rel.value) || '';
      val.textContent = r || '—';
      if (!r) val.className += ' tm-v1-muted';
    } else if (key === 'reentry') {
      var rd = packet.readmit || {};
      val.textContent = 'Re-entry: ' + (rd.reentry || '—') + '\nInitial: ' + (rd.initial || '—') + '\nDischarge: ' + (rd.discharge || '—');
    }
    tile.appendChild(val);
    return tile;
  }

  // ---- where the band goes: the Dash + the Progress Notes page only ----
  // Dash: the residentdashboard URL, or the meds panel frame. Progress
  // Notes: the progressnotes URL, or the VIEW ALL button, or #pnDxBox.
  // The assessments list and the form pages never get the band.
  function isTilePage() {
    var href = '';
    try { href = window.location.href; } catch (e) {}
    if (/cp_residentdashboard/i.test(href)) return true;
    if (/progressnotes/i.test(href)) return true;
    try {
      if (document.getElementById('iFramePanel_Medications')) return true;
      if (document.querySelector('[data-testid="pn-view-all-btn"]')) return true;
      if (document.getElementById('pnDxBox')) return true;
    } catch (e) {}
    return false;
  }

  // ---- settle, then render: the meds frame gates the plant ----
  // The psych meds tile's size depends on how many med lines there are,
  // so planting before the meds frame loads would grow the tile when the
  // frame lands. The band waits for the frame: loaded with a table, or
  // done loading without one (a 404 — readyState complete, no table —
  // means nothing more is coming). No frame on the page (Progress Notes)
  // means settled at once. The wait is the frame's load event (once, in
  // watchFrames) — never a timer, never a poll.
  var _bandPlanted = false;
  function medsFrameSettled() {
    var f = null;
    try { f = document.getElementById('iFramePanel_Medications'); } catch (e) {}
    if (!f) return true;
    try {
      var d = f.contentDocument || (f.contentWindow && f.contentWindow.document);
      if (!d || !d.body) return false;
      // (v0.3.5: a fresh frame's initial document is about:blank —
      // readyState 'complete', no table — which looks "done loading
      // without a table" but means nothing has loaded yet. Planting
      // on the blank leaves the psych tile "not loaded" for the whole
      // page load (the band is a snapshot, so it never corrects).
      // If the frame has a real src, a document is still coming —
      // wait for the load event. If it has no src (or a blank src),
      // nothing is coming — fall through to the settled check.)
      var u = '';
      try { u = d.URL || ''; } catch (e2) {}
      if (!u || u === 'about:blank') {
        var src = '';
        try { src = f.getAttribute('src') || ''; } catch (e3) {}
        if (src && src !== 'about:blank') return false;
      }
      if (d.querySelector('table')) return true;
      if (d.readyState === 'complete') return true;
    } catch (e) { return true; }
    return false;
  }
  function plantTiles(packet) {
    if (_bandPlanted) return false;
    if (!packet || !packet.key) return false;
    ensureTileCSS();
    var band = tileEl('div', null);
    band.id = 'tmV1Band';
    band.setAttribute('data-tm-v1-band', '1');
    var n = 0;
    TILE_DEFS.forEach(function (def) {
      var t = buildTile(def.key, def.label, packet);
      if (t) { band.appendChild(t); n++; }
    });
    if (!n) return false;
    // Anchor: immediately above the tab bar (the old layout model).
    // Fallback: after the resident header; last resort: top of body.
    var placed = false;
    try {
      var tabs = document.querySelector('ul.pccTabs');
      if (tabs && tabs.parentNode) { tabs.parentNode.insertBefore(band, tabs); placed = true; }
    } catch (e) {}
    if (!placed) {
      try {
        var hdr = document.getElementById('residentHeader');
        if (hdr && hdr.parentNode) { hdr.parentNode.insertBefore(band, hdr.nextSibling); placed = true; }
      } catch (e) {}
    }
    if (!placed) {
      try { document.body.insertBefore(band, document.body.firstChild); placed = true; } catch (e) {}
    }
    if (!placed) return false;
    _bandPlanted = true;
    return true;
  }
  function settleAndPlant() {
    if (_bandPlanted) return false;
    if (!isTilePage()) return false;
    if (!medsFrameSettled()) return false;
    var packet = readPacket();
    if (!packet || !packet.key) return false;
    return plantTiles(packet);
  }

  // ---- init: derive once per page load, publish, expose the API ----
  // (3) Verdict invalidation on patient change: if the stored packet's
  // key differs from this page's patient (a new chart opened in this
  // tab, or the patient became null), the old packet is stale — drop it
  // so it is never reused, then publish the new patient's packet.
  // Frame-load watcher: the Dash meds/diagnoses panels live in iframes
  // that may load AFTER the Brain's first gather pass. A frame's load
  // event is a real event (not a poller, not a timer): when a panel
  // frame finishes loading, re-gather and re-publish once, so the
  // packet carries the panel's facts. If the frame is already loaded,
  // the first gather saw it and no listener is attached. { once: true }
  // bounds it to a single re-publish per frame per page load.
  function watchFrames() {
    ['iFramePanel_Medications', 'iFramePanel_ActiveDiagnoses'].forEach(function (fid) {
      var f = null;
      try { f = document.getElementById(fid); } catch (e) {}
      if (!f) return;
      var loaded = false;
      try { loaded = !!(f.contentDocument && f.contentDocument.body && f.contentDocument.querySelector('table')); } catch (e) {}
      if (loaded) return;
      try {
        f.addEventListener('load', function () {
          publishPacket();
          // Slice 3: the meds frame settling is the plant trigger.
          if (fid === 'iFramePanel_Medications') settleAndPlant();
        }, { once: true });
      } catch (e) {}
    });
  }

  // (4) Event-driven only: this runs once per page load. A navigation
  // re-runs the script (fresh memo, fresh derive). Nothing re-derives
  // on a timer or a poll. Cross-tab re-derivation (storage event) is
  // deferred — the shared packet key needs a per-tab design decision
  // first, and a naive listener would let two tabs fight over one key.
  function init() {
    var id = patientId();
    var old = readPacket();
    if (old && old.key && old.key !== id) {
      try { localStorage.removeItem(PACKET_KEY); } catch (e) {}
    }
    if (id) publishPacket();
    settleAndPlant();
    watchFrames();
    // Read-only introspection API: for the rig, and for the Hand (later
    // slice) to ask "which patient is this" and "does this id match".
    // It exposes no writer — nothing here can write to a note, the
    // clipboard, or a form. The slice-2 entries (gatherAll, decideVerdicts,
    // classify, parseNote, parseMedOrder) are pure/reader functions the
    // rig drives directly on seeded fixtures.
    window.__tmBrainV1 = {
      version: VERSION,
      patientId: patientId,
      patientMatches: patientMatches,
      clientPK: clientPK,
      packet: readPacket,
      pkMap: readPkMap,
      gatherAll: function () { return gatherAll(readPacket()); },
      decideVerdicts: decideVerdicts,
      classify: classify,
      parseNote: parseNote,
      parseMedOrder: parseMedOrder
    };
  }

  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
