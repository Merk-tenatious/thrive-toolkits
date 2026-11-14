/* Toolkit platform: accounts, activation, sync, and the screens around each dashboard.
   Talks only to the Supabase project in config.js (Auth, the two tables through Row Level Security, and the
   "toolkit" Edge Function). No analytics. Secrets never live here: the anon/publishable key is public by design. */
(function () {
  "use strict";
  var C = window.TOOLKIT_CONFIG || {}, PRODUCTS = window.TOOLKIT_PRODUCTS || [], REG = window.ToolkitDashboards || {};
  var SITE = C.siteName || "Thrive Toolkits", STORE = C.storeUrl || "https://payhip.com/uthrive", CONTACT = C.contactUrl || STORE;
  var FN = C.functionName || "toolkit";
  var REDIRECT = C.siteUrl || (location.origin + location.pathname);
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ---------- local storage ---------- */
  var LS = (function () {
    try { var k = "__tp_test"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return localStorage; }
    catch (e) { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, key: function (i) { return Object.keys(m)[i] || null; }, get length() { return Object.keys(m).length; }, memoryOnly: true }; }
  })();
  function getJSON(k, d) { try { var v = LS.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function setJSON(k, v) { LS.setItem(k, JSON.stringify(v)); }
  function userPrefix(uid) { return "tp.u." + uid + "."; }
  function prodPrefix(slug) { return userPrefix(user.id) + slug + "."; }
  function makeStore(prefix) {
    return { getItem: function (k) { return LS.getItem(prefix + k); }, setItem: function (k, v) { LS.setItem(prefix + k, v); }, removeItem: function (k) { LS.removeItem(prefix + k); }, memoryOnly: !!LS.memoryOnly };
  }
  function clearPrefix(prefix) {
    var keys = []; for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (k && k.indexOf(prefix) === 0) keys.push(k); }
    keys.forEach(function (k) { LS.removeItem(k); });
  }

  /* ---------- Supabase ---------- */
  var configured = C.supabaseUrl && C.supabaseAnonKey && !/REPLACE/.test(C.supabaseUrl + C.supabaseAnonKey);
  var sb = configured ? window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { flowType: "implicit", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: "tp.auth" }
  }) : null;

  var user = null;          // { id, email }
  var offlineUser = false;  // signed in from the saved session while offline
  var activations = [];     // [{ product_slug, revoked, activated_at }]
  var current = null;       // { slug, mod, root }
  var recoveryMode = false;
  var flash = null;         // { kind: "ok"|"err", text } shown once on the next screen

  function product(slug) { return PRODUCTS.filter(function (p) { return p.slug === slug; })[0]; }
  function activeFor(slug) { return activations.filter(function (a) { return a.product_slug === slug && !a.revoked; })[0]; }
  function revokedFor(slug) { return activations.filter(function (a) { return a.product_slug === slug && a.revoked; })[0]; }
  function setUser(u) {
    user = u ? { id: u.id, email: u.email } : null;
    if (user) { setJSON("tp.lastUser", user); activations = getJSON(userPrefix(user.id) + "activations", []); }
    else { LS.removeItem("tp.lastUser"); activations = []; }
  }
  function isNetErr(e) { return !navigator.onLine || (e && /fetch|network|Failed to fetch|Load failed|NetworkError/i.test(String(e.message || e.name || e))); }

  async function refreshActivations() {
    if (!user || !navigator.onLine || !sb) return activations;
    var r = await sb.from("activations").select("product_slug, revoked, activated_at");
    if (!r.error && r.data) { activations = r.data; setJSON(userPrefix(user.id) + "activations", activations); }
    return activations;
  }

  /* ---------- sync: device first, then the account (last write wins by updated_at) ---------- */
  var pushTimers = {}, syncState = {}; // slug -> "synced" | "pending" | "offline" | "error"
  function meta(slug) { return getJSON(prodPrefix(slug) + "sync", {}); }
  function setMeta(slug, m) { setJSON(prodPrefix(slug) + "sync", m); }
  function localMine(slug) { var raw = LS.getItem(prodPrefix(slug) + "mine"); try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function setSync(slug, s) { syncState[slug] = s; if (current && current.slug === slug) current.mod.refreshStatus(); }
  function syncLabel(slug) {
    var s = syncState[slug] || (meta(slug).dirty ? "pending" : "synced");
    if (s === "offline" || (!navigator.onLine && meta(slug).dirty)) return "Offline: saved on this device";
    if (s === "pending") return "Saving to your account\u2026";
    if (s === "error") return "Saved on this device. Not synced yet";
    return "Saved to your account";
  }
  function changed(slug) {
    var m = meta(slug); m.dirty = true; m.localAt = new Date().toISOString(); setMeta(slug, m);
    setSync(slug, navigator.onLine ? "pending" : "offline");
    clearTimeout(pushTimers[slug]); pushTimers[slug] = setTimeout(function () { push(slug); }, 1200);
  }
  async function push(slug) {
    if (!user || !sb) return;
    var m = meta(slug); if (!m.dirty) { setSync(slug, "synced"); return; }
    if (!navigator.onLine || offlineUser) { setSync(slug, "offline"); return; }
    var sentAt = m.localAt, data = localMine(slug) || {};
    setSync(slug, "pending");
    var r;
    try { r = await sb.rpc("save_dashboard", { p_product_slug: slug, p_data: data, p_updated_at: sentAt }); }
    catch (e) { r = { error: e }; }
    if (r.error) {
      if (isNetErr(r.error)) { setSync(slug, "offline"); return; }
      if (/row-level security|42501|permission/i.test(r.error.message + " " + r.error.code)) { await refreshActivations(); setSync(slug, "error"); if (current && current.slug === slug && !activeFor(slug)) route(); return; }
      setSync(slug, "error"); setTimeout(function () { push(slug); }, 15000); return;
    }
    var res = r.data || {}, m2 = meta(slug);
    if (res.applied) {
      if (m2.localAt === sentAt) m2.dirty = false;
      m2.serverAt = res.updated_at; setMeta(slug, m2);
      setSync(slug, m2.dirty ? "pending" : "synced");
      if (m2.dirty) push(slug);
    } else {
      // The account has a newer copy (edited on another device). The newer copy wins.
      applyRemote(slug, res.data, res.updated_at);
    }
  }
  function applyRemote(slug, data, updatedAt) {
    LS.setItem(prodPrefix(slug) + "mine", JSON.stringify(data || {}));
    var m = meta(slug); m.dirty = false; m.serverAt = updatedAt; m.localAt = updatedAt; setMeta(slug, m);
    if (current && current.slug === slug) current.mod.replaceMine(data || {});
    setSync(slug, "synced");
  }
  async function pull(slug) {
    if (!user || !sb || !navigator.onLine || offlineUser) { setSync(slug, meta(slug).dirty ? "offline" : "synced"); return; }
    var r;
    try { r = await sb.from("dashboard_data").select("data, updated_at").eq("product_slug", slug); } catch (e) { r = { error: e }; }
    if (r.error) { setSync(slug, isNetErr(r.error) ? "offline" : "error"); return; }
    var row = r.data && r.data[0], m = meta(slug);
    if (!row) {
      var mine = localMine(slug);
      if (mine && current && current.mod.hasUserData(mine)) { if (!m.dirty) { m.dirty = true; m.localAt = new Date().toISOString(); setMeta(slug, m); } push(slug); }
      else setSync(slug, "synced");
      return;
    }
    var serverT = Date.parse(row.updated_at), localT = Date.parse(m.localAt || 0) || 0;
    if (m.dirty && localT > serverT) push(slug);
    else if (Date.parse(m.serverAt || 0) !== serverT || m.dirty) applyRemote(slug, row.data, row.updated_at);
    else setSync(slug, "synced");
  }
  function pushAllDirty() { PRODUCTS.forEach(function (p) { if (user && meta(p.slug).dirty) push(p.slug); }); }

  /* ---------- screens ---------- */
  function toast(t) { var e = $("ptoast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, 3200); }
  function header(title, sub) {
    return '<header class="ptop"><div class="brand-kicker">' + esc(SITE.toUpperCase()) + '</div><h1>' + esc(title) + "</h1>" + (sub ? '<p class="sub">' + esc(sub) + "</p>" : "") + "</header>";
  }
  function footLinks(signedIn) {
    return '<nav class="pfoot" aria-label="Site">' + (signedIn ? '<a href="#/home">My toolkits</a><a href="#/account">My account</a>' : "") +
      '<a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="' + esc(STORE) + '" rel="noopener">Thrive store</a>' +
      '<span>\u00a9 2026 Nathan Hansen</span></nav>';
  }
  function flashHtml() { if (!flash) return ""; var f = flash; flash = null; return '<p class="' + (f.kind === "err" ? "err" : "ok") + '" role="alert">' + esc(f.text) + "</p>"; }
  function showPlatform(html) {
    leaveDashboard();
    document.body.className = "platform";
    $("app").hidden = false; $("dash").hidden = true;
    $("app").innerHTML = html; window.scrollTo(0, 0);
  }
  function formErr(form, text) { var e = form.querySelector(".err"); if (!e) { e = document.createElement("p"); e.className = "err"; e.setAttribute("role", "alert"); form.insertBefore(e, form.firstChild); } e.textContent = text; }
  function busy(form, on, label) { var b = form.querySelector("button[type=submit]"); if (!b) return; if (on) { b.dataset.label = b.textContent; b.textContent = label || "One moment\u2026"; b.disabled = true; } else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; } }
  function authMessage(err) {
    var code = (err && (err.code || err.error_code)) || "", msg = (err && err.message) || "";
    if (isNetErr(err)) return "You're offline. Connect to the internet and try again.";
    if (code === "invalid_credentials" || /invalid login/i.test(msg)) return "That email and password don't match. Try again, or reset your password.";
    if (code === "email_not_confirmed" || /not confirmed/i.test(msg)) return "Please confirm your email first. Open the link we sent to your inbox.";
    if (code === "weak_password" || /password should/i.test(msg)) return "Please use a password with at least 8 characters.";
    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || /rate limit/i.test(msg)) return "Too many tries in a short time. Please wait a few minutes and try again.";
    if (/email address.*invalid|validate email/i.test(msg)) return "Please check the email address.";
    return "Something went wrong. Please try again in a moment.";
  }

  function vNotConfigured() {
    showPlatform(header("Not set up yet") + '<div class="pwrap"><section class="card"><p>This site still needs its Supabase settings in config.js.</p></section></div>' + footLinks(false));
  }

  function vSignIn() {
    showPlatform(header("Sign in", "Your private toolkit dashboards") +
      '<div class="pwrap">' + flashHtml() + '<form class="card" id="fSignIn" novalidate><h2>Sign in</h2>' +
      '<label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
      '<label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>' +
      '<button type="submit" class="btn block">Sign in</button>' +
      '<div class="links"><a href="#/signup">New here? Create an account</a><a href="#/forgot">Forgot your password?</a></div></form>' +
      '<p class="hint">Bought a toolkit on the Thrive store? Create an account, then enter the license key from your Payhip receipt email.</p></div>' + footLinks(false));
    var f = $("fSignIn");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = f.email.value.trim(), pw = f.password.value;
      if (!email || !pw) return formErr(f, "Enter your email and password.");
      busy(f, true, "Signing in\u2026");
      var r; try { r = await sb.auth.signInWithPassword({ email: email, password: pw }); } catch (x) { r = { error: x }; }
      busy(f, false);
      if (r.error) {
        formErr(f, authMessage(r.error));
        if ((r.error.code === "email_not_confirmed") || /not confirmed/i.test(r.error.message || "")) addResend(f, email);
        return;
      }
      offlineUser = false; setUser(r.data.user); await refreshActivations(); goHomeOrDashboard();
    });
  }
  function addResend(f, email) {
    if (f.querySelector("[data-resend]")) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "btn small light"; b.setAttribute("data-resend", "1"); b.textContent = "Send the confirmation link again";
    b.addEventListener("click", async function () { b.disabled = true; await sb.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: REDIRECT } }).catch(function () {}); b.textContent = "Sent. Check your inbox."; });
    f.querySelector(".err").after(b);
  }

  function vSignUp() {
    showPlatform(header("Create an account", "One account for all of your toolkit dashboards") +
      '<div class="pwrap"><form class="card" id="fSignUp" novalidate><h2>Create an account</h2>' +
      '<label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
      '<label class="field"><span>Password<small>At least 8 characters.</small></span><input type="password" name="password" autocomplete="new-password" minlength="8" required></label>' +
      '<label class="field"><span>Password again</span><input type="password" name="password2" autocomplete="new-password" required></label>' +
      '<label class="check"><input type="checkbox" name="agree"><span>I have read the <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a> and <a href="terms.html" target="_blank" rel="noopener">terms</a>.</span></label>' +
      '<button type="submit" class="btn block">Create account</button>' +
      '<div class="links"><a href="#/signin">Already have an account? Sign in</a></div></form></div>' + footLinks(false));
    var f = $("fSignUp");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = f.email.value.trim(), pw = f.password.value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return formErr(f, "Please check the email address.");
      if (pw.length < 8) return formErr(f, "Please use a password with at least 8 characters.");
      if (pw !== f.password2.value) return formErr(f, "The two passwords don't match.");
      if (!f.agree.checked) return formErr(f, "Please tick the box to say you have read the privacy policy and terms.");
      busy(f, true, "Creating your account\u2026");
      var r; try { r = await sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: REDIRECT } }); } catch (x) { r = { error: x }; }
      busy(f, false);
      if (r.error) return formErr(f, authMessage(r.error));
      if (r.data && r.data.session) { setUser(r.data.user); go("#/activate"); return; } // email confirmation turned off
      vCheckEmail(email);
    });
  }
  function vCheckEmail(email) {
    showPlatform(header("Check your email") + '<div class="pwrap"><section class="card"><h2>One more step</h2>' +
      "<p>We sent a link to <b>" + esc(email) + "</b>. Open it on this device to confirm your account. You'll come back here signed in, ready to enter your license key.</p>" +
      '<p class="hint">Nothing there after a few minutes? Check your spam or promotions folder.</p><div class="links"><a href="#/signin">Back to sign in</a></div></section></div>' + footLinks(false));
  }

  function vForgot() {
    showPlatform(header("Reset your password") + '<div class="pwrap"><form class="card" id="fForgot" novalidate><h2>Forgot your password?</h2>' +
      '<p class="lead">Enter your email and we will send you a link to choose a new password.</p>' +
      '<label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
      '<button type="submit" class="btn block">Send the reset link</button><div class="links"><a href="#/signin">Back to sign in</a></div></form></div>' + footLinks(false));
    var f = $("fForgot");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = f.email.value.trim(); if (!email) return formErr(f, "Enter your email.");
      busy(f, true);
      var r; try { r = await sb.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT }); } catch (x) { r = { error: x }; }
      busy(f, false);
      if (r.error && (isNetErr(r.error) || /rate limit/i.test(r.error.message || ""))) return formErr(f, authMessage(r.error));
      flash = { kind: "ok", text: "If an account uses that email, a reset link is on its way. Open it on this device." }; go("#/signin");
    });
  }

  function vReset() {
    if (!user) { flash = { kind: "err", text: "That reset link has expired. Please ask for a new one." }; return go("#/forgot"); }
    showPlatform(header("Choose a new password") + '<div class="pwrap"><form class="card" id="fReset" novalidate><h2>New password</h2>' +
      '<label class="field"><span>New password<small>At least 8 characters.</small></span><input type="password" name="password" autocomplete="new-password" required></label>' +
      '<label class="field"><span>New password again</span><input type="password" name="password2" autocomplete="new-password" required></label>' +
      '<button type="submit" class="btn block">Save new password</button></form></div>' + footLinks(true));
    var f = $("fReset");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (f.password.value.length < 8) return formErr(f, "Please use a password with at least 8 characters.");
      if (f.password.value !== f.password2.value) return formErr(f, "The two passwords don't match.");
      busy(f, true);
      var r; try { r = await sb.auth.updateUser({ password: f.password.value }); } catch (x) { r = { error: x }; }
      busy(f, false);
      if (r.error) return formErr(f, authMessage(r.error));
      recoveryMode = false; await refreshActivations(); toast("Your password is updated."); goHomeOrDashboard();
    });
  }

  function vHome() {
    var mine = PRODUCTS.filter(function (p) { return activeFor(p.slug) || revokedFor(p.slug); });
    var others = PRODUCTS.filter(function (p) { return !activeFor(p.slug) && !revokedFor(p.slug); });
    var h = header("My toolkits", user.email + (offlineUser ? "  \u00b7  offline" : "")) + '<div class="pwrap wide">' + flashHtml();
    if (!mine.length) h += '<section class="card"><h2>Welcome</h2><p class="lead">Enter the license key from your Payhip receipt email to open your first dashboard.</p><a class="btn gold" href="#/activate">Enter a license key</a></section>';
    mine.forEach(function (p) {
      var on = !!activeFor(p.slug);
      h += '<section class="card prod"><div class="pk">' + esc(p.kicker) + " <span>" + esc(p.kickerItalic || "") + "</span></div><h2>" + esc(p.name) + ' Dashboard</h2><p class="lead">' + esc(p.blurb) + "</p>" +
        (on ? '<div class="btn-row"><a class="btn" href="' + esc(p.route) + '">Open dashboard</a></div>'
            : '<p><span class="status-pill off">Turned off</span></p><p class="lead">This toolkit is turned off for your account. If you think this is a mistake, contact me through the <a href="' + esc(CONTACT) + '" rel="noopener">Thrive store</a>.</p>') + "</section>";
    });
    if (mine.length) h += '<section class="card"><h2>Add another toolkit</h2><p class="lead">Bought another toolkit? Enter its license key to add it to this account.</p><a class="btn light" href="#/activate">Enter a license key</a></section>';
    if (others.length) h += '<section class="card"><h2>Other toolkits</h2><ul class="plist">' + others.map(function (p) { return "<li><span>" + esc(p.name) + '</span><a href="' + esc(p.buyUrl || STORE) + '" rel="noopener">See it on the Thrive store</a></li>'; }).join("") + "</ul></section>";
    h += "</div>" + footLinks(true);
    showPlatform(h);
  }

  function vActivate(slugHint) {
    var p = slugHint && product(slugHint);
    showPlatform(header("Enter your license key", p ? p.name + " Dashboard" : "Unlock a toolkit dashboard") +
      '<div class="pwrap">' + flashHtml() + '<form class="card" id="fAct" novalidate><h2>Your license key</h2>' +
      '<p class="lead">It is in your Payhip receipt email, next to the toolkit download. It looks like XXXXX-XXXXX-XXXXX-XXXXX. You only enter it once.</p>' +
      '<label class="field"><span>License key</span><input type="text" class="key" name="key" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" maxlength="100"></label>' +
      '<button type="submit" class="btn gold block">Activate</button>' +
      '<p class="hint" style="margin-top:12px">Each key works for one account. Signed in as ' + esc(user.email) + ".</p>" +
      '<div class="links"><a href="#/home">Back to my toolkits</a></div></form></div>' + footLinks(true));
    var f = $("fAct");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var key = f.key.value.trim();
      if (key.replace(/\s/g, "").length < 8) return formErr(f, "Enter the license key from your Payhip receipt email.");
      if (!navigator.onLine) return formErr(f, "You're offline. Connect to the internet to activate your key.");
      busy(f, true, "Checking your key\u2026");
      var r; try { r = await sb.functions.invoke(FN, { body: { action: "activate", license_key: key, product_slug: slugHint || null } }); } catch (x) { r = { error: x }; }
      busy(f, false);
      if (r.error) {
        var msg = "The key check isn't available right now. Please try again in a few minutes.";
        try { var j = await r.error.context.json(); if (j && j.message) msg = j.message; } catch (x2) { if (isNetErr(r.error)) msg = "You're offline. Connect to the internet to activate your key."; }
        return formErr(f, msg);
      }
      await refreshActivations();
      var slug = r.data && r.data.product_slug, prod = product(slug);
      toast((prod ? prod.name : "Your toolkit") + " is now active on your account.");
      go(prod ? prod.route : "#/home");
    });
  }

  function vInactive(slug) {
    var p = product(slug);
    if (revokedFor(slug)) {
      showPlatform(header(p.name + " Dashboard") + '<div class="pwrap"><section class="card"><h2>This toolkit is turned off</h2><p>This toolkit is turned off for your account, so its dashboard can\u2019t open. If you think this is a mistake, contact me through the <a href="' + esc(CONTACT) + '" rel="noopener">Thrive store</a>.</p><div class="links"><a href="#/home">Back to my toolkits</a></div></section></div>' + footLinks(true));
    } else { vActivate(slug); }
  }

  function vAccount() {
    var rows = activations.length ? activations.map(function (a) {
      var p = product(a.product_slug);
      return "<li><span>" + esc(p ? p.name : a.product_slug) + '<br><small class="hint">Activated ' + esc(new Date(a.activated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })) + "</small></span>" +
        (a.revoked ? '<span class="status-pill off">Turned off</span>' : '<span class="status-pill">Active</span>') + "</li>";
    }).join("") : '<li><span class="hint">No toolkits yet.</span></li>';
    showPlatform(header("My account", user.email) + '<div class="pwrap wide">' + flashHtml() +
      '<section class="card"><h2>Account</h2><ul class="plist"><li><span>Email</span><b>' + esc(user.email) + "</b></li></ul></section>" +
      '<section class="card"><h2>Toolkits on this account</h2><ul class="plist">' + rows + '</ul><div class="btn-row" style="margin-top:10px"><a class="btn light small" href="#/activate">Enter a license key</a></div></section>' +
      '<form class="card" id="fPw" novalidate><h2>Change password</h2><label class="field"><span>New password<small>At least 8 characters.</small></span><input type="password" name="password" autocomplete="new-password"></label>' +
      '<label class="field"><span>New password again</span><input type="password" name="password2" autocomplete="new-password"></label><button type="submit" class="btn light">Save new password</button></form>' +
      '<section class="card"><h2>Sign out</h2><p class="lead">Signing out removes your entries from this device. They stay safe in your account.</p><button type="button" class="btn" id="bSignOut">Sign out</button></section>' +
      '<section class="card"><h2>Delete my data</h2><p class="lead">Delete my entries removes everything you have typed into your dashboards, on this device and in your account. Your account and toolkits stay, so you can start fresh.</p>' +
      '<button type="button" class="btn danger" id="bDelData">Delete my entries</button>' +
      '<p class="lead" style="margin-top:16px">Delete my account removes your account, your toolkit activations, and all of your entries. It cannot be undone. If you come back later, you can create a new account and enter your key again.</p>' +
      '<button type="button" class="btn danger" id="bDelAcct">Delete my account</button></section>' +
      '<p class="hint">Read the <a href="privacy.html">privacy policy</a> for what is stored and why.</p></div>' + footLinks(true));
    var f = $("fPw");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (f.password.value.length < 8) return formErr(f, "Please use a password with at least 8 characters.");
      if (f.password.value !== f.password2.value) return formErr(f, "The two passwords don't match.");
      busy(f, true); var r; try { r = await sb.auth.updateUser({ password: f.password.value }); } catch (x) { r = { error: x }; } busy(f, false);
      if (r.error) return formErr(f, authMessage(r.error));
      f.reset(); toast("Your password is updated.");
    });
    $("bSignOut").addEventListener("click", signOut);
    $("bDelData").addEventListener("click", async function () {
      if (!navigator.onLine) return toast("You're offline. Connect to the internet to delete your entries.");
      if (!window.confirm("Delete all of your dashboard entries, on this device and in your account? This cannot be undone.")) return;
      var r = await sb.from("dashboard_data").delete().eq("user_id", user.id);
      if (r.error) return toast("That didn't work. Please try again.");
      PRODUCTS.forEach(function (p) { clearPrefix(prodPrefix(p.slug)); });
      flash = { kind: "ok", text: "Your entries were deleted." }; vAccount();
    });
    $("bDelAcct").addEventListener("click", async function () {
      if (!navigator.onLine) return toast("You're offline. Connect to the internet to delete your account.");
      if (!window.confirm("Delete your account, your toolkit activations, and all of your entries? This cannot be undone.")) return;
      var r; try { r = await sb.functions.invoke(FN, { body: { action: "delete_account" } }); } catch (x) { r = { error: x }; }
      if (r.error) return toast("That didn't work. Please try again.");
      var uid = user.id; clearPrefix(userPrefix(uid));
      await sb.auth.signOut({ scope: "local" }).catch(function () {});
      setUser(null); flash = { kind: "ok", text: "Your account and all of its data were deleted." }; go("#/signin");
    });
  }

  async function signOut() {
    if (current) current.mod.flush();
    var dirty = PRODUCTS.some(function (p) { return meta(p.slug).dirty; });
    if (dirty && navigator.onLine) { pushAllDirty(); await new Promise(function (r) { setTimeout(r, 1500); }); dirty = PRODUCTS.some(function (p) { return meta(p.slug).dirty; }); }
    if (dirty && !window.confirm("Some entries haven't reached your account yet, because you're offline. If you sign out now, they will be lost. Sign out anyway?")) return;
    var uid = user.id;
    leaveDashboard();
    clearPrefix(userPrefix(uid));
    await sb.auth.signOut({ scope: "local" }).catch(function () {});
    setUser(null); offlineUser = false;
    flash = { kind: "ok", text: "You're signed out." }; go("#/signin");
  }

  /* ---------- dashboards ---------- */
  function leaveDashboard() {
    if (!current) return;
    try { current.mod.destroy(); } catch (e) { /* ignore */ }
    current.root.remove(); current = null; $("notice").innerHTML = "";
  }
  function openDashboard(slug, view) {
    var p = product(slug), Mod = REG[slug];
    if (!p || !Mod) return go("#/home");
    if (!activeFor(slug)) return vInactive(slug);
    if (!current || current.slug !== slug) {
      leaveDashboard();
      var root = document.createElement("div"); root.className = "dash-root"; $("dash").appendChild(root);
      var mod = Mod.create({ root: root, store: makeStore(prodPrefix(slug)), base: "#/d/" + slug + "/", changed: function () { changed(slug); }, syncLabel: function () { return syncLabel(slug); } });
      current = { slug: slug, mod: mod, root: root };
      $("app").hidden = true; $("app").innerHTML = ""; $("dash").hidden = false; document.body.className = "in-dash";
      pull(slug).then(function () { offerLegacyImport(slug); });
    }
    current.mod.route(view);
  }
  /* One-time offer: this device has entries from the earlier device-only version (same web address only). */
  function offerLegacyImport(slug) {
    var p = product(slug); if (!p || !p.legacyKey || !current || current.slug !== slug) return;
    var flag = userPrefix(user.id) + slug + ".legacyOffered";
    if (LS.getItem(flag)) return;
    var raw = LS.getItem(p.legacyKey); if (!raw) return;
    var data; try { data = current.mod.parseBackup(raw); } catch (e) { data = null; }
    if (!data || !current.mod.hasUserData(data)) return;
    var accountHas = current.mod.hasUserData(current.mod.mine());
    $("notice").innerHTML = '<section class="card" role="dialog" aria-labelledby="lgT"><h2 id="lgT">Bring in your earlier entries?</h2><p class="lead">This device has entries from the earlier version of this dashboard, which saved only on this device. You can add them to your account so they sync everywhere.' +
      (accountHas ? " Your account already has entries, and these would replace them." : "") + '</p><div class="btn-row"><button type="button" class="btn gold" id="lgYes">Add them to my account</button><button type="button" class="btn light" id="lgNo">No, thanks</button></div></section>';
    $("lgYes").addEventListener("click", function () {
      LS.setItem(flag, "imported"); $("notice").innerHTML = "";
      current.mod.useMine(data, "Your earlier entries are now in your account.");
    });
    $("lgNo").addEventListener("click", function () { LS.setItem(flag, "declined"); $("notice").innerHTML = ""; });
  }

  /* ---------- routing ---------- */
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function goHomeOrDashboard() {
    var act = PRODUCTS.filter(function (p) { return activeFor(p.slug); });
    go(act.length === 1 && !revokedFor(act[0].slug) && PRODUCTS.length === 1 ? act[0].route : (act.length ? "#/home" : "#/activate"));
  }
  var LEGACY_VIEWS = ["today", "dashboard", "sessions", "system", "disruption", "howto", "data", "more"];
  function route() {
    if (!sb) return vNotConfigured();
    var h = (location.hash || "").replace(/^#/, "");
    if (LEGACY_VIEWS.indexOf(h) >= 0) { return go(current ? "#/d/" + current.slug + "/" + h : "#/home"); }
    var parts = h.replace(/^\//, "").split("/"), page = parts[0] || "";
    if (!user) {
      if (page === "signup") return vSignUp();
      if (page === "forgot") return vForgot();
      if (page === "reset") return vReset();
      if (page !== "signin") return go("#/signin");
      return vSignIn();
    }
    if (recoveryMode && page !== "reset") return go("#/reset");
    if (page === "signin" || page === "signup" || page === "") return goHomeOrDashboard();
    if (page === "forgot") return vForgot();
    if (page === "reset") return vReset();
    if (page === "home") return vHome();
    if (page === "account") return vAccount();
    if (page === "activate") return vActivate(parts[1]);
    if (page === "d") return openDashboard(parts[1], parts[2] || "today");
    go("#/home");
  }

  /* ---------- start ---------- */
  async function boot() {
    if (!sb) return vNotConfigured();
    var h0 = location.hash || "", hp = new URLSearchParams(h0.replace(/^#/, ""));
    var linkType = hp.get("type"), linkErr = hp.get("error_description");
    var s = null;
    try { var r = await sb.auth.getSession(); s = r.data && r.data.session; } catch (e) { s = null; }
    if (s && s.user) setUser(s.user);
    else {
      var last = getJSON("tp.lastUser", null);
      if (last && !navigator.onLine && LS.getItem("tp.auth")) { user = last; offlineUser = true; activations = getJSON(userPrefix(last.id) + "activations", []); }
    }
    sb.auth.onAuthStateChange(function (ev, session) {
      if (ev === "PASSWORD_RECOVERY") { recoveryMode = true; if (session) setUser(session.user); setTimeout(function () { go("#/reset"); }, 0); }
      else if (ev === "TOKEN_REFRESHED" && session) { if (offlineUser) { offlineUser = false; setTimeout(function () { refreshActivations(); pushAllDirty(); }, 0); } }
      else if (ev === "SIGNED_OUT") { /* handled by signOut() */ }
    });
    if (user && !offlineUser) await refreshActivations().catch(function () {});
    if (linkErr) { flash = { kind: "err", text: "That link has expired or was already used. Please sign in, or ask for a new link." }; return go("#/signin"); }
    if (linkType === "recovery" && user) { recoveryMode = true; return go("#/reset"); }
    if (linkType === "signup" && user) { flash = { kind: "ok", text: "Your email is confirmed. Welcome." }; return go(activations.length ? "#/home" : "#/activate"); }
    if (/access_token=/.test(h0)) return goHomeOrDashboard();
    route();
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("online", function () {
    if (!user) return;
    if (offlineUser) { sb.auth.getSession().then(function (r) { if (r.data && r.data.session) { offlineUser = false; refreshActivations().then(function () { pushAllDirty(); if (current) pull(current.slug); }); } }); return; }
    pushAllDirty(); if (current) pull(current.slug);
  });
  window.addEventListener("offline", function () { if (current) setSync(current.slug, meta(current.slug).dirty ? "offline" : "synced"); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && current && navigator.onLine && !meta(current.slug).dirty) pull(current.slug);
    if (document.visibilityState === "hidden" && current) { current.mod.flush(); pushAllDirty(); }
  });
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  window.ToolkitPlatform = { user: function () { return user; }, activations: function () { return activations; }, syncState: function (s) { return { state: syncState[s], meta: user ? meta(s) : null }; }, push: push, pull: pull };
  boot();
})();
