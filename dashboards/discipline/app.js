/* Discipline by Design Dashboard: a module for the Toolkit platform.
   Entries save on this device first (so it works offline). The platform (platform.js) then syncs
   "my data" to the signed-in account. The Maya example stays on this device only and is never synced. */
(function () {
  "use strict";
  var REG = window.ToolkitDashboards = window.ToolkitDashboards || {};
  var SHELL =
    '<header class="top">' +
    '<div class="brand"><div class="brand-kicker">DISCIPLINE <span>by Design</span></div><h1 id="appTitle">Dashboard</h1><p id="appSub" class="sub"></p></div>' +
    '<div class="top-right"><span id="saveState" class="save-state" aria-live="polite"></span><a class="top-link" href="#/home">My toolkits</a></div>' +
    "</header>" +
    '<div id="exampleBanner" class="example-banner" hidden><strong>EXAMPLE DATA:</strong> Maya, the composite baker from Chapter 13. Her entries show how the dashboard works. They stay on this device and are never saved to your account. Your own entries are kept separately and are not changed. ' +
    '<button type="button" class="btn small light" data-action="clearExample">Clear example</button></div>' +
    '<div id="backupBanner" class="backup-banner" role="status" hidden><span>Your entries sync to your account. An exported backup is a good extra copy, and it has been a while since your last one.</span>' +
    '<span class="btn-row"><button type="button" class="btn small gold-dark" data-action="export">Export now</button><button type="button" class="btn small light" data-action="snoozeBackup">Remind me later</button></span></div>' +
    '<div class="layout"><nav class="side" id="sideNav" aria-label="Sections"></nav><main id="view" tabindex="-1"></main></div>' +
    '<nav class="bottom" id="bottomNav" aria-label="Sections"></nav>' +
    '<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>' +
    '<input type="file" id="importFile" accept="application/json,.json" hidden>';
  var VIEWS = ["today", "dashboard", "sessions", "system", "disruption", "howto", "data", "more"];

  REG.discipline = { views: VIEWS, create: create };

  /* ctx = { root, store, base, changed(data), syncLabel(), confirm? } supplied by platform.js */
  function create(ctx) {
  var L = window.DBDLogic;
  var KEY_MINE = "mine", KEY_EX = "example", KEY_MODE = "mode";
  /* Backup reminder keys. These sit beside the data and are not part of an export file or the account copy. */
  var KEY_LASTBK = "lastBackupAt", KEY_FIRST = "firstEntryAt", KEY_SNOOZE = "backupSnoozeUntil";
  var DAY_MS = 86400000, REMIND_DAYS = 30, SNOOZE_DAYS = 7;
  var FOOT = "\u00a9 2026 Nathan Hansen. A companion to Discipline by Design. Licensed for one person's use.";
  var store = ctx.store, root = ctx.root;
  function H(v) { return ctx.base + v; }
  root.innerHTML = SHELL;

  var mode = store.getItem(KEY_MODE) === "example" && store.getItem(KEY_EX) ? "example" : "mine";
  var state = load(mode);
  var selected = null;
  var view = "today";
  var alive = true, rendering = false;

  function load(m) {
    var raw = store.getItem(m === "example" ? KEY_EX : KEY_MINE);
    if (!raw) return L.blankData();
    try { return L.normalize(JSON.parse(raw)); } catch (e) { return L.blankData(); }
  }
  var saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer); saveTimer = null;
    var doIt = function () {
      saveTimer = null;
      store.setItem(mode === "example" ? KEY_EX : KEY_MINE, JSON.stringify(state));
      store.setItem(KEY_MODE, mode);
      if (mode === "mine") { noteFirstEntry(); ctx.changed(state); }
      setSaveState();
    };
    if (now) doIt(); else { setText("saveState", "Saving\u2026"); saveTimer = setTimeout(doIt, 300); }
  }
  function setSaveState() {
    if (!alive) return;
    setText("saveState", store.memoryOnly ? "Not saved on this device: storage is off in this browser" : (mode === "example" ? "Example data (this device only)" : ctx.syncLabel()));
  }

  /* ---------- backup reminder and saved storage ---------- */
  var BLANK_JSON = JSON.stringify(L.normalize(L.blankData()));
  function hasUserData(d) { try { return JSON.stringify(L.normalize(JSON.parse(JSON.stringify(d)))) !== BLANK_JSON; } catch (e) { return false; } }
  function readTime(k) { var v = +store.getItem(k); return v > 0 ? v : null; }
  function noteFirstEntry() {
    if (readTime(KEY_FIRST) || !hasUserData(mineData())) return;
    store.setItem(KEY_FIRST, String(Date.now()));
    requestPersist();
  }
  function backupDue() {
    if (mode !== "mine" || store.memoryOnly || !hasUserData(state)) return false;
    var now = Date.now(), since = readTime(KEY_LASTBK) || readTime(KEY_FIRST), snooze = readTime(KEY_SNOOZE);
    if (!since) return false;
    if (snooze && now < snooze) return false;
    return now - since >= REMIND_DAYS * DAY_MS;
  }
  function renderBackupBanner() { var b = $("backupBanner"); if (b) b.hidden = !backupDue(); }
  var persisted = null;
  function persistLine() {
    return persisted ? "Saved storage on this device: protected." : "Saved storage on this device: standard. Your account keeps the main copy.";
  }
  function showPersist() { var e = $("persistLine"); if (e) e.textContent = persistLine(); }
  function requestPersist() {
    try {
      if (!(navigator.storage && navigator.storage.persist && navigator.storage.persisted)) return;
      navigator.storage.persisted().then(function (p) { return p ? true : navigator.storage.persist(); })
        .then(function (p) { persisted = !!p; showPersist(); }, function () {});
    } catch (e) { /* fail silently */ }
  }

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function parseDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function dayDiff(a, b) { return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); }
  function fmt(d, o) { return d.toLocaleDateString("en-US", o || { month: "short", day: "numeric", year: "numeric" }); }
  function start() { return parseDate(state.system.start); }
  function dateOf(n) { var s = start(); return s ? addDays(s, n) : null; }
  function todayIndex() { var s = start(); if (!s) return null; return dayDiff(s, new Date()); }
  function get(obj, path) { return path.split(".").reduce(function (o, k) { return o == null ? "" : o[k]; }, obj); }
  function set(obj, path, v) { var p = path.split("."), o = obj; for (var i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; }
  function toast(t) { var e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, 2600); }
  function pct(x) { return x == null ? "\u2013" : Math.round(x * 100) + "%"; }
  function one(x) { return x == null ? "\u2013" : (Math.round(x * 10) / 10).toFixed(1); }
  function int(x) { return x == null ? "\u2013" : String(x); }

  var ICONS = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M9 14.5l2 2 4-4"/></svg>',
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>',
    sessions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9 11h6M9 14.5h6M9 18h4"/></svg>',
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M4 21h16"/><circle cx="14.5" cy="12.5" r="1"/></svg>',
    disruption: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 17.6 8 3.5 3.5 0 0 1 17 15z"/><path d="M11 15l-1.5 3.5h3L11 22"/></svg>',
    howto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 17v.2"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/></svg>'
  };
  var NAV = [["today", "Today", "Today & Return Tracker"], ["dashboard", "Dashboard", "Dashboard"], ["sessions", "Weekly", "Design Sessions"], ["system", "My System", "My System"],
             ["disruption", "", "Disruption Plan"], ["howto", "", "How to Use"], ["data", "", "Your data"]];
  function renderNav() {
    var cur = view, moreCur = ["more", "disruption", "howto", "data"].indexOf(cur) >= 0;
    $("bottomNav").innerHTML = NAV.slice(0, 4).map(function (n) {
      return '<a href="' + H(n[0]) + '"' + (cur === n[0] ? ' aria-current="page"' : "") + ">" + ICONS[n[0]] + "<span>" + n[1] + "</span></a>";
    }).join("") + '<a href="' + H("more") + '"' + (moreCur ? ' aria-current="page"' : "") + ">" + ICONS.more + "<span>More</span></a>";
    $("sideNav").innerHTML = NAV.map(function (n) {
      return '<a href="' + H(n[0]) + '"' + (cur === n[0] ? ' aria-current="page"' : "") + ">" + ICONS[n[0]] + "<span>" + n[2] + "</span></a>";
    }).join("");
  }

  function renderHeader(r) {
    var name = (state.system.name || "").trim(), t = r.totals, sub;
    if (!name) sub = "Your returns, your weekly design sessions, and the weeks so far.";
    else {
      var through = t.lastLogged < 0 ? "No days logged yet" : (dateOf(t.lastLogged) ? "Through " + fmt(dateOf(t.lastLogged)) : "Through day " + (t.lastLogged + 1));
      sub = name + "  \u00b7  " + through;
    }
    setText("appTitle", "Discipline by Design Dashboard");
    setText("appSub", sub);
    $("exampleBanner").hidden = mode !== "example";
    renderBackupBanner();
    setSaveState();
  }

  function footer() { return '<footer class="foot">' + esc(FOOT) + "</footer>"; }
  function privacyNote() {
    return '<div class="privacy"><b>Private to your account.</b> Your entries save on this device first, then sync to your own account, so they follow you when you sign in on another phone or computer. Only you can see them. For an extra copy, use <a href="' + H("data") + '">Export a backup</a> now and then.</div>';
  }

  /* ---------- views ---------- */
  function render() {
    var r = L.compute(state);
    renderNav(); renderHeader(r);
    var html = ({ today: vToday, dashboard: vDashboard, sessions: vSessions, system: vSystem, disruption: vDisruption, howto: vHowto, data: vData, more: vMore }[view] || vToday)(r);
    /* Replacing the view can fire a late "change" from a field that had focus; ignore it so it can't overwrite newer data. */
    rendering = true;
    try { var ae = document.activeElement; if (ae && root.contains(ae) && ae.blur) ae.blur(); $("view").innerHTML = html + footer(); } finally { rendering = false; }
  }

  function statusButtons(cur, idx, isRet) {
    return '<div class="status-grid">' + [["Target", "Hit the target"], ["Floor", "Did the floor"], ["Missed", "Missed"], ["Off", "Off (not scheduled)"]].map(function (s) {
      var label = s[0] === "Off" ? "Off" : s[0];
      var small = s[0] === "Off" ? "not scheduled" : (s[0] === "Target" ? "hit the target" : s[0] === "Floor" ? "the floor counts" : "it happens");
      return '<button type="button" class="sbtn ' + s[0] + (isRet && cur === s[0] ? " ret" : "") + '" data-action="setStatus" data-day="' + idx + '" data-status="' + s[0] + '" aria-pressed="' + (cur === s[0]) + '">' + label + "<small>" + small + "</small></button>";
    }).join("") + "</div>";
  }

  function dayDetail(r, idx) {
    var row = r.rows[idx], d = dateOf(idx), day = state.days[idx];
    var title = (d ? fmt(d, { weekday: "long", month: "long", day: "numeric" }) : "Day " + (idx + 1)) + " \u00b7 Week " + row.week;
    var ret = row.isReturn ? ' <span class="badge">Return \u00b7 ' + row.returnTime + (row.returnTime === 1 ? " day" : " days") + "</span>" : "";
    return '<div class="card detail" id="dayDetail"><div class="kicker">Selected day</div><div class="today-date">' + esc(title) + ret + "</div>" +
      statusButtons(day.s, idx, row.isReturn) +
      '<label class="field"><span>Note (optional)</span><input type="text" data-bind="days.' + idx + '.n" value="' + esc(day.n) + '" placeholder="A few words about the day" maxlength="200"></label>' +
      '<div class="btn-row"><button type="button" class="btn small light" data-action="clearDay" data-day="' + idx + '">Clear this day</button><button type="button" class="btn small light" data-action="closeDetail">Done</button></div></div>';
  }

  function vToday(r) {
    var t = r.totals, ti = todayIndex(), h = "";
    h += '<div class="next"><span class="kicker">Next step</span>' + esc(t.nextStep) + "</div>";
    // Log today
    h += '<section class="card deep" aria-labelledby="logToday"><div class="kicker">Log today</div>';
    if (ti === null) {
      h += '<h2 id="logToday">Set your start date first</h2><p class="lead">Add the Monday you start on <a href="' + H("system") + '" style="color:var(--gold)">My System</a>. Then today shows here for one-tap logging. You can still tap any day below.</p>';
    } else if (ti < 0) {
      h += '<h2 id="logToday">Your 12 weeks start on ' + esc(fmt(start(), { weekday: "long", month: "long", day: "numeric" })) + '</h2><p class="lead">Until then, set up My System and the Disruption Plan.</p>';
    } else if (ti >= L.DAYS) {
      h += '<h2 id="logToday">These 12 weeks ended on ' + esc(fmt(dateOf(L.DAYS - 1))) + '</h2><p class="lead">You can still tap any day below to change it. When this habit runs on its own, export a backup, then reset to start the next habit fresh. One habit at a time.</p>';
    } else {
      var row = r.rows[ti];
      h += '<h2 id="logToday" class="today-date" style="color:#fff">' + esc(fmt(new Date(), { weekday: "long", month: "long", day: "numeric" })) + "</h2>" +
        '<p class="lead">Day ' + (ti + 1) + " of 84 \u00b7 Week " + row.week + (state.system.habit ? " \u00b7 " + esc(state.system.habit) : "") + "</p>" +
        statusButtons(state.days[ti].s, ti, row.isReturn) +
        (row.isReturn ? '<p class="lead" style="color:#9fd8b3">That is a return. The comeback repetition is the most valuable repetition you will ever do.</p>' : "") +
        (state.system.floor ? '<p class="lead">Your floor: ' + esc(state.system.floor) + "</p>" : "") +
        '<label class="field"><span style="color:#fff">Note (optional)</span><input type="text" data-bind="days.' + ti + '.n" value="' + esc(state.days[ti].n) + '" placeholder="A few words about today" maxlength="200"></label>';
    }
    h += '<div class="now"><div>Last day logged<b>' + (t.lastLogged < 0 ? "\u2013" : esc(dateOf(t.lastLogged) ? fmt(dateOf(t.lastLogged), { month: "short", day: "numeric" }) : "Day " + (t.lastLogged + 1))) + "</b></div>" +
      "<div>Misses in a row now<b>" + t.missesInRowNow + "</b></div><div>Returns<b>" + t.returns + "</b></div><div>Return rate<b>" + pct(t.returnRate) + "</b></div></div></section>";
    // Tracker
    h += '<h2 class="section-title">Return Tracker</h2><p class="lead">Count how fast you come back, not the streak. Tap a day to change it: Target, Floor, Missed, Off (not scheduled), then blank. Off is not a miss. Returns are found and marked in green for you.</p>';
    h += '<div class="legend"><span><i style="background:var(--targetbg)"></i>Target</span><span><i style="background:var(--goldm)"></i>Floor</span><span><i style="background:var(--miss)"></i>Missed</span><span><i style="background:#fff"></i>Off (not scheduled)</span><span><i style="background:var(--greenl);border-color:var(--green)"></i>Return</span></div>';
    h += '<div class="summary card">' + [["Scheduled days", t.scheduled], ["Showed up", t.showedUp], ["Hit the target", t.target], ["Did the floor", t.floor], ["Missed", t.missed], ["Returns", t.returns, 1], ["Return rate", pct(t.returnRate), 1], ["Average return time", one(t.avgReturnTime)], ["Longest return time", int(t.longestReturnTime)], ["Missed two in a row", t.missedTwoInRow]]
      .map(function (x) { return "<div" + (x[2] ? ' class="g"' : "") + "><span>" + x[0] + "</span><b>" + x[1] + "</b></div>"; }).join("") + "</div>";
    for (var w = 0; w < L.WEEKS; w++) {
      var wk = r.weeks[w], ws = dateOf(w * 7);
      h += '<div class="week"><div class="week-head"><b>Week ' + (w + 1) + (ws ? " \u00b7 " + esc(fmt(ws, { month: "short", day: "numeric" })) : "") + "</b><span>" +
        (wk.scheduled ? wk.showedUp + " of " + wk.scheduled + " showed up" + (wk.hasReturn ? ' \u00b7 <span class="check">\u2713 return</span>' : "") : "") + '</span></div><div class="days">';
      for (var k = 0; k < 7; k++) {
        var n = w * 7 + k, row2 = r.rows[n], d = dateOf(n), s = row2.s;
        var cls = "day" + (s ? " " + s : "") + (row2.isReturn ? " ret" : "") + (selected === n ? " sel" : "") + (ti === n ? " today" : "");
        var st = row2.isReturn ? "Return" : (s === "Off" ? "Off" : s);
        var label = (d ? fmt(d, { weekday: "long", month: "long", day: "numeric" }) : "Day " + (n + 1)) + ": " + (s ? L.LABEL[s] : "not logged") + (row2.isReturn ? ", a return after " + row2.returnTime + " missed" : "");
        h += '<button type="button" class="' + cls + '" data-action="cycle" data-day="' + n + '" aria-label="' + esc(label) + '">' +
          '<span class="dn">' + (d ? esc(fmt(d, { weekday: "short" })) + "<br>" + d.getDate() : "Day<br>" + (n + 1)) + "</span>" +
          '<span class="st">' + esc(st || "\u00b7") + "</span>" + (row2.isReturn ? '<span class="badge">' + row2.returnTime + "</span>" : "") +
          (state.days[n].n ? '<span class="note-dot" aria-hidden="true"></span>' : "") + "</button>";
      }
      h += "</div></div>";
    }
    if (selected !== null) h += dayDetail(r, selected);
    return h;
  }

  function tile(label, val, cap, green, small) {
    return '<div class="tile' + (small ? " small" : "") + '"><div class="tl">' + label + '</div><div class="tv' + (green ? " g" : "") + '">' + esc(val) + '</div><div class="tc">' + esc(cap) + "</div></div>";
  }
  function vDashboard(r) {
    var t = r.totals, s = state.system, h = "";
    h += '<dl class="habit-strip"><dt>MY ONE HABIT</dt><dd class="hab">' + esc(s.habit || "") + "</dd><dt>FLOOR</dt><dd>" + esc(s.floor || "") + "</dd><dt>TARGET</dt><dd>" + esc(s.target || "") + '</dd><dt>DIRECTION</dt><dd class="dir">' + (s.direction ? "I am building discipline so that " + esc(s.direction) : "") + "</dd></dl>";
    h += '<div class="tiles">' +
      tile("RETURN RATE", pct(t.returnRate), "Misses followed by a repetition the very next day", true) +
      tile("AVERAGE RETURN TIME", one(t.avgReturnTime), "Days missed before coming back") +
      tile("LONGEST RETURN TIME", int(t.longestReturnTime), "One day is excellent. Two is a warning.") +
      tile("RETURNS", t.returns, "Comeback repetitions", true) +
      tile("SHOWED UP", t.showedUp, "of " + t.scheduled + " scheduled days") +
      tile("HIT THE TARGET", t.target, "Full target days") +
      tile("DID THE FLOOR", t.floor, "Floor days count") +
      tile("MISSES", t.missed, "Scheduled days missed") +
      tile("MISSED TWO IN A ROW", t.missedTwoInRow, "Times. Never miss twice.") +
      tile("EVIDENCE LINES", t.evidenceLines, "Evidence Ledger lines written") +
      tile("WEEKS WITH A RETURN", t.weeksWithReturn, "I am someone who comes back.", true) +
      tile("SHOWED UP IN A ROW (CURRENT / LONGEST)", t.showRunNow + " / " + t.showRunLongest, "Measure return time and return rate, not streaks.", false, true) +
      "</div>";
    h += '<div class="next"><span class="kicker">Next step</span>' + esc(t.nextStep) + "</div>";
    h += '<div class="charts">' +
      chartCard("Each week", stackedChart(r.weeks), [["Hit the target", "var(--navy)"], ["Did the floor", "var(--gold)"], ["Missed", "var(--missbar)"]]) +
      chartCard("Misses and returns by week", groupedChart(r.weeks), [["Missed", "var(--missbar)"], ["Returns", "var(--green)"]]) +
      chartCard("The quiet compound", compoundChart(r.weeks), [["Repetitions so far", "var(--gold)"]]) +
      '<section class="card"><h2>Latest Evidence Ledger lines</h2>' + (t.latestEvidence.length ? '<ul class="evidence">' + t.latestEvidence.map(function (e) { return "<li><b>Week " + e.week + ":</b> " + esc(e.text) + "</li>"; }).join("") + "</ul>" : '<p class="lead">Your Evidence Ledger lines from Design Sessions show here, newest first.</p>') + "</section>" +
      "</div>";
    h += '<p class="hint" style="margin-top:12px">Return rate counts each missed day. A miss on the last day you logged waits until the next day is logged. See How to Use for how each number works.</p>';
    return h;
  }
  function chartCard(title, svg, legend) {
    return '<section class="card chart"><h2>' + esc(title) + "</h2>" + svg + '<div class="clegend">' + legend.map(function (l) { return '<span><i style="background:' + l[1] + '"></i>' + esc(l[0]) + "</span>"; }).join("") + "</div></section>";
  }
  // Hand-written SVG bar charts. 12 weeks on the x axis.
  function frame(maxY, step, yTitle, bodyFn, desc) {
    var W = 360, H = 220, l = 34, rgt = 8, top = 10, bot = 38, pw = W - l - rgt, ph = H - top - bot;
    var y = function (v) { return top + ph - (v / maxY) * ph; };
    var g = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(desc) + '"><title>' + esc(desc) + "</title>";
    for (var v = 0; v <= maxY + 1e-9; v += step) {
      g += '<line x1="' + l + '" x2="' + (W - rgt) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E3E6EA"/><text x="' + (l - 6) + '" y="' + (y(v) + 4) + '" font-size="10" text-anchor="end" fill="#5E6B74">' + v + "</text>";
    }
    var bw = pw / 12;
    for (var i = 0; i < 12; i++) g += '<text x="' + (l + bw * i + bw / 2) + '" y="' + (top + ph + 14) + '" font-size="10" text-anchor="middle" fill="#5E6B74">' + (i + 1) + "</text>";
    g += '<line x1="' + l + '" x2="' + (W - rgt) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#5E6B74"/>';
    g += '<text x="' + (l + pw / 2) + '" y="' + (H - 6) + '" font-size="11" text-anchor="middle" fill="#1C2833">Week</text>';
    g += '<text transform="translate(11 ' + (top + ph / 2) + ') rotate(-90)" font-size="11" text-anchor="middle" fill="#1C2833">' + esc(yTitle) + "</text>";
    g += bodyFn({ x: function (i) { return l + bw * i; }, bw: bw, y: y, base: y(0) });
    return g + "</svg>";
  }
  function rect(x, y1, w, y2, fill, stroke, tip) {
    var hgt = y2 - y1; if (hgt <= 0) return "";
    return '<rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hgt.toFixed(1) + '" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '"' : "") + "><title>" + esc(tip) + "</title></rect>";
  }
  function stackedChart(weeks) {
    return frame(7, 1, "Days", function (c) {
      var o = "", gap = c.bw * 0.375 / 2, w = c.bw - gap * 2;
      weeks.forEach(function (wk, i) {
        var acc = 0;
        [["target", "#1E3446", "Hit the target"], ["floor", "#C9A24D", "Did the floor"], ["missed", "#B8BEC6", "Missed"]].forEach(function (s) {
          var v = wk[s[0]]; if (!v) return;
          o += rect(c.x(i) + gap, c.y(acc + v), w, c.y(acc), s[1], null, "Week " + wk.week + ", " + s[2] + ": " + v); acc += v;
        });
      });
      return o;
    }, "Each week: target, floor, and missed days stacked for weeks 1 to 12");
  }
  function niceStep(max) { if (max <= 8) return 1; if (max <= 20) return 2; if (max <= 50) return 5; if (max <= 100) return 10; return 20; }
  function groupedChart(weeks) {
    var mx = Math.max(1, Math.max.apply(null, weeks.map(function (w) { return Math.max(w.missed, w.returns); })));
    var st = niceStep(mx), top = Math.ceil(mx / st) * st;
    return frame(top, st, "Count", function (c) {
      var o = "", gap = c.bw * 0.2, w = (c.bw - gap * 2) / 2;
      weeks.forEach(function (wk, i) {
        o += rect(c.x(i) + gap, c.y(wk.missed), w, c.base, "#B8BEC6", null, "Week " + wk.week + ", Missed: " + wk.missed);
        o += rect(c.x(i) + gap + w, c.y(wk.returns), w, c.base, "#2E7D4F", null, "Week " + wk.week + ", Returns: " + wk.returns);
      });
      return o;
    }, "Misses and returns by week for weeks 1 to 12");
  }
  function compoundChart(weeks) {
    var mx = Math.max(1, Math.max.apply(null, weeks.map(function (w) { return w.repsSoFar || 0; })));
    var st = niceStep(mx), top = Math.ceil(mx / st) * st;
    return frame(top, st, "Repetitions", function (c) {
      var o = "", gap = c.bw * 0.15, w = c.bw - gap * 2;
      weeks.forEach(function (wk, i) {
        if (wk.repsSoFar == null) return;
        o += rect(c.x(i) + gap, c.y(wk.repsSoFar), w, c.base, "#C9A24D", "#1E3446", "Week " + wk.week + ", Repetitions so far: " + wk.repsSoFar);
      });
      return o;
    }, "The quiet compound: repetitions so far, by week");
  }

  function field(path, label, opts) {
    opts = opts || {};
    var v = get(state, path), ph = opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : "";
    var input = opts.long ? '<textarea data-bind="' + path + '" rows="' + (opts.rows || 3) + '"' + ph + ">" + esc(v) + "</textarea>"
      : '<input type="' + (opts.type || "text") + '" data-bind="' + path + '" value="' + esc(v) + '"' + ph + ">";
    return '<label class="field"><span>' + esc(label) + (opts.help ? "<small>" + esc(opts.help) + "</small>" : "") + "</span>" + input + "</label>";
  }
  function vSystem() {
    var s = start(), warn = s && s.getDay() !== 1 ? "This date is a " + fmt(s, { weekday: "long" }) + ". The tracker works with any day; the book's worksheet uses the Monday you start." : "";
    var days = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return '<section class="card"><h2>My System</h2><p class="lead">Your DOOR Method worksheet in short. These answers feed the Dashboard. Fill in what you have; the Dashboard works with any of it blank.</p>' +
      '<div class="two-col"><div>' + field("system.name", "Name") + "</div><div>" +
      field("system.start", "Started on (a Monday)", { type: "date" }) + '<p class="warn" id="startWarn">' + esc(warn) + "</p></div></div>" +
      '<div class="door-sec"><b>D</b>DECIDE THE DIRECTION</div>' +
      field("system.direction", "Direction sentence: I am building discipline so that", { long: true, rows: 2 }) +
      field("system.identity", "Identity statement: I am becoming someone who", { long: true, rows: 2 }) +
      '<div class="door-sec"><b>O</b>OPEN A SMALLER DOORWAY</div>' +
      field("system.habit", "My one habit") +
      field("system.floor", "Floor (the smallest version I will do no matter what)", { long: true, rows: 2 }) +
      field("system.target", "Target (what I aim for on an ordinary day)", { long: true, rows: 2 }) +
      '<div class="two-col"><div>' + field("system.anchorAfter", "Anchor: After") + "</div><div>" + field("system.anchorWill", "I will") + "</div></div>" +
      field("system.ifThen", "If-then plan", { long: true }) +
      field("system.later", "Later (good ideas that can wait)", { long: true, rows: 2 }) +
      '<div class="door-sec"><b>O</b>ORDER THE ROOM</div>' +
      field("system.physical", "Physical room", { long: true }) + field("system.digital", "Digital room", { long: true, rows: 2 }) + field("system.social", "Social room", { long: true }) +
      field("system.competing", "Competing habit I'll make harder", { long: true, rows: 2 }) + field("system.reward", "Immediate reward", { long: true, rows: 2 }) +
      '<div class="door-sec"><b>R</b>RETURN FAST</div>' +
      field("system.tracking", "Tracking method", { long: true, rows: 2 }) + field("system.protocol", "Return protocol", { long: true }) + field("system.partner", "Accountability partner", { long: true, rows: 2 }) +
      '<label class="field"><span>Design session day</span><select data-bind="system.sessionDay">' + days.map(function (d) { return '<option value="' + d + '"' + (state.system.sessionDay === d ? " selected" : "") + ">" + (d || "Choose a day") + "</option>"; }).join("") + "</select></label>" +
      "</section>";
  }

  function vSessions(r) {
    var tot = { scheduled: 0, showedUp: 0, target: 0, floor: 0, missed: 0, returns: 0 }, ti = todayIndex(), sd = state.system.sessionDay;
    var h = '<section class="card"><h2>Design Sessions</h2><p class="lead">Ten minutes, once a week. What worked? What slipped? What needs adjustment? Plus your return time and one line of evidence.' + (sd ? " Your design session day: " + esc(sd) + "." : "") + "</p>" +
      '<p class="hint">Counts fill in from the Return Tracker. The last box is your Evidence Ledger: one or two sentences of fact, not grades.</p></section>';
    r.weeks.forEach(function (wk, i) {
      Object.keys(tot).forEach(function (k) { tot[k] += wk[k]; });
      var ws = dateOf(i * 7), ses = state.sessions[i];
      var hasText = ses.worked || ses.slipped || ses.adjust || ses.evidence;
      var isCur = ti !== null && Math.floor(ti / 7) === i;
      var open = wk.scheduled > 0 || hasText || isCur || (i === 0 && r.totals.lastLogged < 0);
      h += '<details class="session"' + (open ? " open" : "") + "><summary><span><span class=\"wk\">Week " + wk.week + "</span>" + (ws ? ' <span class="meta">\u00b7 Week of ' + esc(fmt(ws, { month: "short", day: "numeric" })) + "</span>" : "") + "</span>" +
        '<span class="meta">' + (wk.scheduled ? wk.showedUp + " of " + wk.scheduled : "") + (wk.hasReturn ? ' <span class="check">\u2713</span>' : "") + "</span></summary>" +
        '<div class="session-body"><div class="chips">' +
        [["Scheduled days", wk.scheduled], ["Showed up", wk.showedUp], ["Hit the target", wk.target], ["Did the floor", wk.floor], ["Missed", wk.missed]].map(function (c) { return '<span class="chip">' + c[0] + " <b>" + c[1] + "</b></span>"; }).join("") +
        '<span class="chip g">Returns <b>' + wk.returns + "</b></span>" +
        '<span class="chip">Longest return time <b>' + int(wk.longest) + "</b></span>" +
        (wk.hasReturn ? '<span class="chip g">Return <b>\u2713</b></span>' : "") +
        '<span class="chip">Repetitions so far <b>' + int(wk.repsSoFar) + "</b></span></div>" +
        '<div class="two-col"><div>' + field("sessions." + i + ".worked", "What worked?", { long: true, rows: 2 }) + "</div><div>" + field("sessions." + i + ".slipped", "What slipped?", { long: true, rows: 2 }) + "</div></div>" +
        field("sessions." + i + ".adjust", "What needs adjustment?", { long: true, rows: 2 }) +
        field("sessions." + i + ".evidence", "Evidence Ledger line", { long: true, rows: 2, help: "One or two sentences of fact, not grades." }) +
        "</div></details>";
    });
    var t = r.totals;
    h += '<section class="card"><h2>Total</h2><div class="chips">' +
      [["Scheduled days", tot.scheduled], ["Showed up", tot.showedUp], ["Hit the target", tot.target], ["Did the floor", tot.floor], ["Missed", tot.missed]].map(function (c) { return '<span class="chip">' + c[0] + " <b>" + c[1] + "</b></span>"; }).join("") +
      '<span class="chip g">Returns <b>' + tot.returns + '</b></span><span class="chip">Longest return time <b>' + int(t.longestReturnTime) + '</b></span><span class="chip g">Weeks with a return <b>' + t.weeksWithReturn + '</b></span><span class="chip">Repetitions so far <b>' + (tot.scheduled ? tot.showedUp : "\u2013") + "</b></span></div></section>";
    return h;
  }

  function vDisruption() {
    var storms = ["TRAVEL", "BUSY SEASON AT WORK", "HOLIDAYS AND VISITORS", "ILLNESS", "KIDS OUT OF SCHOOL OR CAREGIVING", "MY OWN STORM"];
    var s = state.system, h = '<section class="card"><h2>The Disruption Plan</h2><p class="lead">If-then plans for the storms you can see coming, and a way back from the ones you can\'t.</p>' +
      '<div class="chips"><span class="chip">My habit <b>' + esc(s.habit || "\u2013") + '</b></span><span class="chip">Floor <b>' + esc(s.floor || "\u2013") + "</b></span></div>" +
      "<p>Most interruptions are not surprises. Write a plan for each storm before it hits: a portable or floor version, a lower target agreed in advance, and the point at which the full version comes back.</p>";
    storms.forEach(function (name, i) {
      h += '<div class="storm"><h3>' + name + "</h3>" + field("disruption.storms." + i + ".ifText", "If (the storm, and when it usually hits)") +
        field("disruption.storms." + i + ".thenText", "then I will (portable or floor version)", { long: true, rows: 2 }) + field("disruption.storms." + i + ".returns", "Full version returns when") + "</div>";
    });
    h += '<p class="hint">For example: If I am traveling, then I will do the hotel-room version: ten minutes of bodyweight exercise before breakfast.</p></section>';
    h += '<div class="quote"><span class="kicker">For the storms you can\'t plan</span><p>When life takes over, protect the floor if you can. If you can\'t, protect the return.</p></div>';
    h += '<section class="card"><h2>My long return</h2><p class="lead">For when you miss a season, not a day. The way back is the same as the way in.</p>' +
      field("disruption.longReturn.floor", "I will return to the floor:") + field("disruption.longReturn.time", "at the old time") + field("disruption.longReturn.place", "in the old place") + field("disruption.longReturn.tell", "and I will tell") +
      '<p class="hint" style="color:var(--green)">No heroic first week. Mark it in the return color.</p></section>';
    h += '<div class="two-col"><section class="card"><h2>Monthly drift check</h2><p>Compare what I\'m actually doing with what\'s written on my worksheet. Then restore the design or update it on purpose.</p>' + field("disruption.nextCheck", "Next check", { type: "date" }) + "</section>" +
      '<section class="card"><h2>After a miss, I\'ll ask</h2><p>What made this harder than usual?</p><p>What small change would make the next repetition easier?</p><p class="hint">Not: Why did I fail?</p></section></div>';
    h += '<p class="hint">From Discipline by Design, Chapter 11.</p>';
    return h;
  }

  function vHowto() {
    var steps = [["1. My System", "Fill in your DOOR Method worksheet answers: your direction sentence, one habit, floor, target, anchor, room, and return protocol. Enter the Monday you start. The dates everywhere else follow it."],
      ["2. Today and the Return Tracker", "Each day, tap one status: Target, Floor, Missed, or Off (not scheduled). It takes under ten seconds. Add a short note if you like. On the tracker, tapping a day moves it through the four statuses and back to blank. Returns are found and marked in green for you."],
      ["3. Design Sessions", "Once a week, for about ten minutes. Your counts fill in on their own. Write what worked, what slipped, what needs adjustment, and one Evidence Ledger line."],
      ["4. Dashboard", "Your return rate, return time, and each week at a glance. The Next step line shows what your return protocol says to do after a miss."],
      ["5. Disruption Plan", "Write if-then plans for travel, busy seasons, holidays, illness, and the long return, before they arrive."],
      ["6. The next habit", "One habit at a time. When this one runs on its own, export a backup, then reset and start fresh for the next."],
      ["7. Your data", "Everything you enter saves on this device and syncs to your account, so you can sign in on another device and pick up where you left off. If you are offline, your entries wait on this device and sync when you are back online. Export a backup now and then as an extra copy. Import puts it back."],
      ["8. On your home screen", "On iPhone, open this page in Safari, tap Share, then Add to Home Screen. On Android, open it in Chrome, tap the menu, then Add to Home screen or Install app. After you sign in once, it opens offline too."]];
    var nums = [["Return", "The first Target or Floor day after one or more misses: the comeback repetition. It is marked in green."],
      ["Return time", "How many scheduled days you missed before that comeback. Missed Tuesday, back Wednesday: 1. From the book: \u201cOne day is excellent. Two is a warning. A week is a pattern forming.\u201d"],
      ["Return rate", "Of your misses, how many were followed by a repetition the very next day. A miss on the last day you logged waits until the next day is logged."],
      ["Off (not scheduled)", "A day the habit isn't planned, such as a day off. It is not a miss, and it doesn't break a return or a run of days."],
      ["Missed two in a row", "Your return protocol's second line: if you miss two days in a row, tell your accountability partner and look at what made it harder."],
      ["Showed up in a row", "Shown small on purpose. Measure return time and return rate, not streaks."]];
    var tools = [["DOOR Method worksheet", "Build one habit you can keep, and a plan for coming back. My System holds the short version."],
      ["12-week return tracker", "Count how fast you come back, not the streak. The Return Tracker is the on-screen version."],
      ["Disruption Plan", "If-then plans for the storms you can see coming, and a way back from the ones you can't."],
      ["Floor Finder", "Your floor keeps failing, or you can't tell how small to go."],
      ["Anchor Map", "You keep forgetting, or the habit floats around your day."],
      ["Redesign Clinic", "Something broke and you want the design fault, not a verdict."],
      ["Pocket Cards", "You want the plan with you at the moment it matters. The Return Card and Comeback Week are for the days after a miss."],
      ["Evidence Ledger", "Every week, in the design session. Here it is the last box of each Design Session."],
      ["Accountability Partner Kit", "You want one person asking, kindly, about your return."]];
    var dl = function (arr, cls) { return '<dl class="howto ' + cls + '">' + arr.map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("") + "</dl>"; };
    return '<section class="card"><h2>How to Use</h2><p class="lead">A companion to Discipline by Design, by Nathan Hansen. Log your days, hold your weekly design session, and see how fast you come back.</p>' + dl(steps, "") + "</section>" +
      '<section class="card"><h2>How the numbers work</h2>' + dl(nums, "nums") + "</section>" +
      '<section class="card"><h2>The companion tools</h2><table class="tools"><thead><tr><th>Tool</th><th>Use it when</th></tr></thead><tbody>' + tools.map(function (x) { return "<tr><td>" + esc(x[0]) + "</td><td>" + esc(x[1]) + "</td></tr>"; }).join("") + "</tbody></table></section>" +
      '<section class="card"><h2>Color key</h2><p><span class="swatch" style="background:var(--goldl);color:var(--navy)">Pale gold</span>Your entries. Type, or tap.</p><p><span class="swatch" style="background:var(--gray)">Gray</span>Calculate on their own.</p><p><span class="swatch" style="background:var(--greenl);color:var(--green);border-color:var(--green)">Green</span>A return: the first repetition after a miss.</p></section>' +
      '<section class="card"><h2>Note</h2><p>This dashboard is a personal tracking tool. It is not medical or professional advice. It goes alongside the book and its fillable PDF tools; it does not replace them.</p></section>';
  }

  function vData() {
    return privacyNote() +
      '<section class="card"><h2>Back up and restore</h2><p class="lead">A backup is a small file with all of your entries. Keep it somewhere safe, such as your email or cloud drive.</p>' +
      '<p class="data-status"><span id="lastBackupLine">' + esc(lastBackupLine()) + '</span><br><span id="persistLine">' + esc(persistLine()) + "</span></p>" +
      '<div class="btn-row"><button type="button" class="btn" data-action="export">Export a backup</button><button type="button" class="btn light" data-action="import">Import a backup</button></div>' +
      (mode === "example" ? '<p class="hint">You are looking at the example. Export and Import work with your own entries, not Maya\'s.</p>' : "") + "</section>" +
      '<section class="card"><h2>See an example</h2><p class="lead">Load Maya, the composite baker from Chapter 13, to see how a filled-in dashboard looks. Your own entries are kept separately and are not changed.</p><div class="btn-row">' +
      (mode === "example" ? '<button type="button" class="btn gold" data-action="clearExample">Clear example and go back to my data</button>' : '<button type="button" class="btn gold" data-action="loadExample">Load Maya example</button>') + "</div></section>" +
      '<section class="card"><h2>Start over</h2><p class="lead">Reset erases your entries for this dashboard from this device and from your account. Export a backup first if you might want them.</p><button type="button" class="btn danger" data-action="reset">Reset my data</button></section>';
  }
  function lastBackupLine() { var t = readTime(KEY_LASTBK); return "Last backup: " + (t ? fmt(new Date(t)) : "never"); }
  function vMore() {
    return '<section class="card more-list"><a href="' + H("disruption") + '">Disruption Plan <span>Storms and the long return</span></a><a href="' + H("howto") + '">How to Use <span>Steps and how the numbers work</span></a><a href="' + H("data") + '">Your data <span>Backup, example, reset</span></a><a href="#/home">My toolkits <span>All of your dashboards</span></a><a href="#/account">My account <span>Email, password, sign out, delete my data</span></a></section>' + privacyNote();
  }
  /* ---------- actions ---------- */
  var CYCLE = ["", "Target", "Floor", "Missed", "Off"];
  function act(a, el) {
    var d = el.getAttribute("data-day"), n = d == null ? null : +d;
    if (a === "cycle") {
      var cur = state.days[n].s; state.days[n].s = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]; selected = n; save(); rerenderKeepScroll();
    } else if (a === "setStatus") {
      state.days[n].s = el.getAttribute("data-status"); save(); rerenderKeepScroll();
      var ti = todayIndex(); if (n === ti && selected !== n) toast(state.days[n].s === "Off" ? "Logged as Off (not scheduled)." : "Logged: " + state.days[n].s + ".");
    } else if (a === "clearDay") { state.days[n].s = ""; state.days[n].n = ""; save(); rerenderKeepScroll(); }
    else if (a === "closeDetail") { selected = null; rerenderKeepScroll(); }
    else if (a === "export") doExport();
    else if (a === "snoozeBackup") { store.setItem(KEY_SNOOZE, String(Date.now() + SNOOZE_DAYS * DAY_MS)); renderBackupBanner(); toast("Okay. I'll remind you again in a week."); }
    else if (a === "import") $("importFile").click();
    else if (a === "loadExample") {
      if (mode === "mine" && saveTimer) save(true);
      store.setItem(KEY_EX, JSON.stringify(L.normalize(window.DBD_MAYA))); mode = "example"; store.setItem(KEY_MODE, mode); state = load(mode); selected = null;
      location.hash = H("dashboard"); render(); toast("Example loaded. Your own entries are unchanged.");
    } else if (a === "clearExample") {
      store.removeItem(KEY_EX); mode = "mine"; store.setItem(KEY_MODE, mode); state = load(mode); selected = null; render(); toast("Example cleared. You are back to your own entries.");
    } else if (a === "reset") {
      if (window.confirm("Erase all of your entries for this dashboard? This removes them from this device and from your account. This cannot be undone. Export a backup first if you might want them.")) {
        store.removeItem(KEY_MINE); store.removeItem(KEY_LASTBK); store.removeItem(KEY_FIRST); store.removeItem(KEY_SNOOZE);
        if (mode === "mine") state = L.blankData(); else store.setItem(KEY_MODE, "example");
        ctx.changed(L.blankData());
        selected = null; render(); toast("Your entries were erased.");
      }
    }
  }
  function rerenderKeepScroll() { var y = window.scrollY; render(); window.scrollTo(0, y); }

  function mineData() { if (mode === "mine") return state; var raw = store.getItem(KEY_MINE); try { return raw ? L.normalize(JSON.parse(raw)) : L.blankData(); } catch (e) { return L.blankData(); } }
  function doExport() {
    if (mode === "mine") save(true);
    var now = new Date(), stamp = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    var payload = { app: "discipline-by-design-dashboard", version: 1, exportedAt: now.toISOString(), data: mineData() };
    var blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "discipline-dashboard-backup-" + stamp + ".json";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    store.setItem(KEY_LASTBK, String(now.getTime())); store.removeItem(KEY_SNOOZE);
    renderBackupBanner(); setText("lastBackupLine", lastBackupLine());
    toast("Backup saved to your downloads.");
  }
  /* Accepts a backup file from this version or from the earlier device-only version (same format). */
  function parseBackup(text) {
    var obj; try { obj = JSON.parse(text); } catch (e) { return null; }
    var data = obj && obj.app === "discipline-by-design-dashboard" ? obj.data : (obj && obj.days ? obj : null);
    return data && Array.isArray(data.days) ? L.normalize(data) : null;
  }
  function useMine(data, label) {
    store.setItem(KEY_MINE, JSON.stringify(L.normalize(data))); store.removeItem(KEY_EX); mode = "mine"; store.setItem(KEY_MODE, mode); state = load(mode); selected = null;
    noteFirstEntry(); ctx.changed(state); render(); if (label) toast(label);
  }
  function doImport(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var data = parseBackup(fr.result);
      if (!data) { toast("That file isn't a dashboard backup."); return; }
      if (!window.confirm("Replace your current entries with this backup? It will also replace the copy in your account.")) return;
      store.setItem(KEY_LASTBK, String(Date.now())); store.removeItem(KEY_SNOOZE);
      useMine(data, "Backup restored.");
    };
    fr.readAsText(file);
  }

  /* ---------- events ---------- */
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action]"); if (b && root.contains(b)) { e.preventDefault(); act(b.getAttribute("data-action"), b); }
  });
  $("view").addEventListener("input", function (e) {
    var p = e.target.getAttribute("data-bind"); if (!p || rendering) return;
    set(state, p, e.target.value); save();
    if (p === "system.name") renderHeader(L.compute(state));
  });
  $("view").addEventListener("change", function (e) {
    var p = e.target.getAttribute("data-bind"); if (!p || rendering) return;
    set(state, p, e.target.value); save(true);
    if (p === "system.start") { renderHeader(L.compute(state)); var s = start(), w = $("startWarn"); if (w) w.textContent = s && s.getDay() !== 1 ? "This date is a " + fmt(s, { weekday: "long" }) + ". The tracker works with any day; the book's worksheet uses the Monday you start." : ""; }
  });
  $("importFile").addEventListener("change", function (e) { if (e.target.files[0]) doImport(e.target.files[0]); e.target.value = ""; });

  noteFirstEntry();
  requestPersist();

  var api = {
    route: function (v) {
      view = VIEWS.indexOf(v) >= 0 ? v : "today";
      if (view !== "today") selected = null;
      render(); window.scrollTo(0, 0);
    },
    /* Newer copy arrived from the account (another device). */
    replaceMine: function (data) {
      clearTimeout(saveTimer); saveTimer = null;
      store.setItem(KEY_MINE, JSON.stringify(L.normalize(data)));
      if (mode === "mine") { state = load("mine"); rerenderKeepScroll(); }
    },
    mine: function () { return mineData(); },
    hasUserData: hasUserData,
    parseBackup: parseBackup,
    useMine: useMine,
    refreshStatus: setSaveState,
    toast: toast,
    flush: function () { if (saveTimer) save(true); },
    destroy: function () { if (saveTimer) save(true); alive = false; root.innerHTML = ""; if (window.DBDApp === api.debug) delete window.DBDApp; },
    debug: { state: function () { return state; }, mode: function () { return mode; }, compute: function () { return L.compute(state); } }
  };
  window.DBDApp = api.debug;
  return api;
  }
})();
