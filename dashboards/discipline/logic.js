/* Discipline by Design Dashboard: calculations.
   Each rule mirrors a formula in Discipline_by_Design_Dashboard.xlsx (Return Tracker, Design Sessions, Dashboard). */
(function (root) {
  var DAYS = 84, WEEKS = 12;
  var STATUSES = ["Target", "Floor", "Missed", "Off"];
  var LABEL = { Target: "Target", Floor: "Floor", Missed: "Missed", Off: "Off (not scheduled)" };

  function isShow(s) { return s === "Target" || s === "Floor"; }

  // Return Tracker columns G..L for each of the 84 rows.
  function computeDays(days) {
    var out = [], prevH = 0, prevK = 0;
    for (var n = 0; n < DAYS; n++) {
      var s = (days[n] && days[n].s) || "";
      var showed = isShow(s) ? 1 : (s === "Missed" ? 0 : null);          // G
      var H, isReturn, J, K;
      if (n === 0) {
        H = s === "Missed" ? 1 : 0;                                         // H11
        isReturn = false; J = 0;                                            // I11, J11
        K = showed === 1 ? 1 : 0;                                           // K11
      } else {
        H = s === "Missed" ? prevH + 1 : (isShow(s) ? 0 : prevH);           // misses in a row
        isReturn = isShow(s) && prevH > 0;                                  // Return = Yes
        J = isReturn ? prevH : 0;                                           // return time (days)
        K = showed === 1 ? prevK + 1 : (s === "Missed" ? 0 : prevK);        // showed up in a row
      }
      out.push({ n: n, week: Math.floor(n / 7) + 1, s: s, showed: showed, missRun: H, isReturn: isReturn, returnTime: J, showRun: K, logged: s !== "" });
      prevH = H; prevK = K;
    }
    return out;
  }

  function compute(data) {
    var rows = computeDays(data.days || []);
    var c = { Target: 0, Floor: 0, Missed: 0, Off: 0 };
    var returns = 0, rtSum = 0, rtCount = 0, longest = 0, twoInRow = 0, last = -1, longestShow = 0;
    rows.forEach(function (r) {
      if (c[r.s] !== undefined) c[r.s]++;
      if (r.isReturn) returns++;
      if (r.returnTime > 0) { rtSum += r.returnTime; rtCount++; }
      if (r.returnTime > longest) longest = r.returnTime;
      if (r.s === "Missed" && r.missRun === 2) twoInRow++;
      if (r.logged) last = r.n;
      if (r.showRun > longestShow) longestShow = r.showRun;
    });
    var missesNow = last < 0 ? 0 : rows[last].missRun;                       // O8
    var showRunNow = last < 0 ? 0 : rows[last].showRun;                      // O9
    var denom = c.Missed - missesNow;                                        // F8-O8
    var t = {
      scheduled: c.Target + c.Floor + c.Missed,
      showedUp: c.Target + c.Floor,
      target: c.Target, floor: c.Floor, missed: c.Missed,
      returns: returns,
      returnRate: denom <= 0 ? null : returns / denom,
      avgReturnTime: returns === 0 ? null : (rtCount ? rtSum / rtCount : 0),
      longestReturnTime: returns === 0 ? null : longest,
      missedTwoInRow: twoInRow,
      lastLogged: last, missesInRowNow: missesNow,
      showRunNow: showRunNow, showRunLongest: longestShow
    };
    // Design Sessions rows 7..18
    var weeks = [], cum = 0, weeksWithReturn = 0;
    for (var w = 1; w <= WEEKS; w++) {
      var wr = rows.slice((w - 1) * 7, w * 7);
      var wk = { week: w, target: 0, floor: 0, missed: 0, returns: 0, longest: null };
      var mx = 0;
      wr.forEach(function (r) {
        if (r.s === "Target") wk.target++;
        if (r.s === "Floor") wk.floor++;
        if (r.s === "Missed") wk.missed++;
        if (r.isReturn) wk.returns++;
        if (r.returnTime > mx) mx = r.returnTime;
      });
      wk.scheduled = wk.target + wk.floor + wk.missed;
      wk.showedUp = wk.target + wk.floor;
      wk.longest = wk.returns === 0 ? null : mx;
      wk.hasReturn = wk.returns > 0;
      cum += wk.showedUp;
      wk.repsSoFar = wk.scheduled === 0 ? null : cum;
      if (wk.hasReturn) weeksWithReturn++;
      var ses = (data.sessions || [])[w - 1] || {};
      wk.evidence = (ses.evidence || "").trim();
      weeks.push(wk);
    }
    t.weeksWithReturn = weeksWithReturn;
    t.evidenceLines = weeks.filter(function (x) { return x.evidence !== ""; }).length;
    t.latestEvidence = weeks.filter(function (x) { return x.evidence !== ""; }).reverse().slice(0, 5)
      .map(function (x) { return { week: x.week, text: x.evidence }; });
    var floor = ((data.system || {}).floor || "").trim();
    var next;
    if (last < 0) next = "Log your first day on the Return Tracker. If today allows only the floor, the floor counts.";
    else if (missesNow >= 2) next = "Two misses in a row. Tell your accountability partner and look at what made it harder. The Redesign Clinic can help.";
    else if (missesNow === 1) next = "Return fast. Next time, do your floor at the usual time and place, and mark it. Your floor: " + (floor || "(add it on My System)");
    else next = "Keep the system running. Bring this week to your design session.";
    t.nextStep = next;
    return { rows: rows, totals: t, weeks: weeks };
  }

  function blankData() {
    var d = { version: 1, system: {}, days: [], sessions: [], disruption: { storms: [], longReturn: {}, nextCheck: "" } };
    for (var i = 0; i < DAYS; i++) d.days.push({ s: "", n: "" });
    for (var j = 0; j < WEEKS; j++) d.sessions.push({ worked: "", slipped: "", adjust: "", evidence: "" });
    for (var k = 0; k < 6; k++) d.disruption.storms.push({ ifText: "", thenText: "", returns: "" });
    return d;
  }

  // Bring any saved or imported object into the expected shape.
  function normalize(src) {
    var d = blankData();
    if (!src || typeof src !== "object") return d;
    if (src.system && typeof src.system === "object") Object.keys(src.system).forEach(function (k) { d.system[k] = String(src.system[k] == null ? "" : src.system[k]); });
    if (Array.isArray(src.days)) src.days.slice(0, DAYS).forEach(function (x, i) {
      if (!x) return;
      d.days[i].s = STATUSES.indexOf(x.s) >= 0 ? x.s : "";
      d.days[i].n = String(x.n || "");
    });
    if (Array.isArray(src.sessions)) src.sessions.slice(0, WEEKS).forEach(function (x, i) {
      if (!x) return; ["worked", "slipped", "adjust", "evidence"].forEach(function (k) { d.sessions[i][k] = String(x[k] || ""); });
    });
    var dp = src.disruption || {};
    if (Array.isArray(dp.storms)) dp.storms.slice(0, 6).forEach(function (x, i) {
      if (!x) return; ["ifText", "thenText", "returns"].forEach(function (k) { d.disruption.storms[i][k] = String(x[k] || ""); });
    });
    if (dp.longReturn) ["floor", "time", "place", "tell"].forEach(function (k) { d.disruption.longReturn[k] = String(dp.longReturn[k] || ""); });
    d.disruption.nextCheck = String(dp.nextCheck || "");
    return d;
  }

  var api = { DAYS: DAYS, WEEKS: WEEKS, STATUSES: STATUSES, LABEL: LABEL, compute: compute, computeDays: computeDays, blankData: blankData, normalize: normalize };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DBDLogic = api;
})(this);
