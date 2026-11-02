/*
 * 朱雀 · ZHUQUE —— 极简赤色终端登录主题（主逻辑）
 * Theme logic for nody-greeter / web-greeter 3 (LightDM). Plain ES5-style script,
 * no modules, no network access, no console.error() — nody-greeter treats any
 * console error as a theme crash and offers to swap to its default theme.
 */
(function () {
  "use strict";

  /* ═════════════════════════ 配置 · CONFIG ═════════════════════════ */

  var CONFIG = {
    rememberUser: true       // 记住上次登录的用户和会话
  };

  /* ═════════════════════════ 文案 · STRINGS (简体中文) ═════════════════════════ */

  var T = {
    selectOperator: "选择操作员：",
    otherUser: "其他用户……",
    loggedIn: "〔在线〕",
    operator: "操作员",
    username: "用户名",
    password: "访问口令",
    passwordCurrent: "当前口令",
    passwordNew: "新口令",
    passwordRetype: "确认新口令",
    verifyCode: "验证码",
    verifying: "验证中……",
    denied: "访问被拒绝",
    granted: "访问已授权",
    capsLock: "注意：大写锁定已开启",
    sessionFail: "无法启动会话：{session}",
    noUsers: "未发现操作员，请输入用户名。",
    authRestart: "验证中断，正在重试……",
    authStuck: "无法验证此操作员。按 Esc 选择其他用户。",
    emptyName: "用户名不能为空。",
    sessionLabel: "会话",
    restart: "重启",
    shutdown: "关机",
    suspend: "挂起",
    hibernate: "休眠",
    confirm: "确认{action}？回车 确认 · Esc 取消",
    doing: "正在{action}……",
    actionFail: "{action}失败",
    week: "星期"
  };

  var SESSION_NAMES = {
    "xfce": "Xfce 桌面",
    "xfce-wayland": "Xfce 桌面（Wayland）",
    "lightdm-xsession": "默认 X 会话",
    "default": "默认会话",
    "gnome": "GNOME 桌面",
    "gnome-xorg": "GNOME 桌面（Xorg）",
    "gnome-wayland": "GNOME 桌面（Wayland）",
    "gnome-classic": "GNOME 经典",
    "plasma": "KDE Plasma 桌面",
    "plasmax11": "KDE Plasma（X11）",
    "plasmawayland": "KDE Plasma（Wayland）",
    "cinnamon": "Cinnamon 桌面",
    "mate": "MATE 桌面",
    "lxqt": "LXQt 桌面",
    "lxde": "LXDE 桌面",
    "LXDE": "LXDE 桌面",
    "i3": "i3 窗口管理器",
    "openbox": "Openbox 窗口管理器",
    "sway": "Sway 合成器",
    "awesome": "Awesome 窗口管理器",
    "bspwm": "bspwm 窗口管理器",
    "xmonad": "XMonad 窗口管理器",
    "icewm-session": "IceWM 桌面",
    "budgie-desktop": "Budgie 桌面"
  };

  // PAM 的英文提示 → 中文（顺序很重要）
  var MESSAGE_MAP = [
    [/account.*expired|expired.*account/i, "账户已过期，请联系管理员。"],
    [/password.*expired|expired.*password|change your password|must change/i, "口令已过期，必须立即修改。"],
    [/locked|too many|maximum number/i, "账户已被暂时锁定，请稍后再试。"],
    [/(place|swipe|touch|scan|put).*finger|finger.*(reader|sensor)/i, "请将手指放在指纹识别器上……"],
    [/(fingerprint|finger).*(not match|no match|fail|again)|failed to match/i, "指纹不匹配，请重试。"],
    [/do(es)? not match|mismatch|sorry, passwords/i, "两次输入的口令不一致。"],
    [/bad password|too short|too simple|dictionary|palindrome|too similar/i, "新口令强度不足，请换一个更复杂的口令。"],
    [/unchanged|exhausted|manipulation error/i, "口令未被修改。"],
    [/successfully|updated/i, "操作成功。"],
    [/authentication (failure|failed)|incorrect|invalid/i, "口令错误。"]
  ];

  var WEEKDAYS = "日一二三四五六";

  /* ═════════════════════════ 小工具 · helpers ═════════════════════════ */

  function $(id) { return document.getElementById(id); }

  function log() {
    try {
      var a = Array.prototype.slice.call(arguments);
      a.unshift("[zhuque]");
      console.log.apply(console, a);   // never console.error (see header)
    } catch (e) { /* ignore */ }
  }

  function safe(fn, fallback) {
    try {
      var v = fn();
      return (v === undefined || v === null) ? fallback : v;
    } catch (e) {
      log("safe() caught:", e && e.message);
      return fallback;
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmt(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] != null ? vars[k] : m;
    });
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  var store = {
    get: function (k) { try { return window.localStorage.getItem("zhuque." + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem("zhuque." + k, v); } catch (e) { /* ignore */ } }
  };

  /* ═════════════════════════ 状态 · state ═════════════════════════ */

  var ldm = null;              // window.lightdm
  var ui = {};
  var st = {
    role: "primary",
    mode: "password",          // select|username|password|busy|stuck|menu|confirm|granted
    prevMode: "password",
    users: [],
    sessions: [],
    hideUsers: false,
    listIdx: 0,
    user: null,                // { username, display_name, session, logged_in }
    sessionKey: null,
    authActive: false,
    promptReady: false,
    promptLabel: T.password,
    promptSecret: true,
    pending: null,
    responded: false,
    failStreak: 0,
    msgs: [],
    caps: false,
    menuIdx: 0,
    menu: [],
    confirm: null
  };

  /* ═════════════════════════ 启动 · bootstrapping ═════════════════════════ */

  var started = false;

  function start() {
    if (started) return;
    started = true;
    try {
      init();
    } catch (e) {
      log("init failed:", e && e.stack);
    }
  }

  // nody-greeter / web-greeter fire "GreeterReady" once window.lightdm is usable.
  window.addEventListener("GreeterReady", start);
  // Safety net: if the event was missed but the API exists, start anyway.
  setTimeout(function () { if (!started && window.lightdm) start(); }, 3000);

  // Never let an unexpected error surface as an "Uncaught" console error.
  window.addEventListener("error", function (ev) {
    log("suppressed error:", ev && ev.message);
    if (ev && ev.preventDefault) ev.preventDefault();
  });
  window.addEventListener("unhandledrejection", function (ev) {
    log("suppressed rejection:", ev && ev.reason);
    if (ev && ev.preventDefault) ev.preventDefault();
  });

  function init() {
    ldm = window.lightdm || null;
    st.role = document.body.classList.contains("secondary") ? "secondary" : "primary";

    // A primary page that lands on a non-primary monitor must stay passive.
    if (st.role === "primary") {
      var isPrimary = safe(function () { return window.greeter_comm.window_metadata.is_primary; }, true);
      if (isPrimary === false) {
        st.role = "secondary";
        document.body.classList.remove("primary");
        document.body.classList.add("secondary");
        ["term", "sysmenu"].forEach(function (id) { var el = $(id); if (el) el.style.display = "none"; });
      }
    }

    ["console", "sysmenu", "entry", "clock-time", "clock-date"].forEach(function (id) { ui[id] = $(id); });
    startClock();
    if (st.role === "secondary") return;   // other monitors: clock only

    st.users = safe(function () { return ldm.users; }, []) || [];
    st.sessions = safe(function () { return ldm.sessions; }, []) || [];
    st.hideUsers = !!safe(function () { return ldm.hide_users_hint; }, false);
    st.sessionKey = pickSession(preselect());

    connectSignals();
    bindInput();
    buildMenu();
    enterLogin();
  }

  /* ═════════════════════════ 登录流程 · login flow ═════════════════════════ */

  // Who should the prompt open for? LightDM's hint (e.g. lock screen) >
  // last successful login > first listed user. null → ask for a user name.
  function preselect() {
    var hint = safe(function () { return ldm.select_user_hint; }, null);
    var remembered = CONFIG.rememberUser ? store.get("lastUser") : null;
    var name = hint || remembered;
    for (var i = 0; i < st.users.length; i++) {
      if (st.users[i].username === name) return st.users[i];
    }
    if (name) return { username: name };
    return (!st.hideUsers && st.users.length) ? st.users[0] : null;
  }

  function enterLogin() {
    var u = preselect();
    if (u) { chooseUser(u); return; }
    if (st.users.length === 0) addMsg(T.noUsers, "info");
    openUsername();
  }

  function chooseUser(user) {
    st.user = user;
    st.sessionKey = pickSession(user);
    st.failStreak = 0;
    renderMenu();
    beginAuth();
    setMode("password");
  }

  function pickSession(user) {
    var keys = st.sessions.map(function (s) { return s.key; });
    function ok(k) { return k && keys.indexOf(k) >= 0; }
    var saved = user && user.username ? store.get("session." + user.username) : null;
    if (ok(saved)) return saved;
    if (user && ok(user.session)) return user.session;
    var def = safe(function () { return ldm.default_session; }, null);
    if (ok(def)) return def;
    return keys.length ? keys[0] : null;
  }

  function beginAuth() {
    st.promptReady = false;
    st.pending = null;
    st.responded = false;
    st.promptLabel = T.password;
    st.promptSecret = true;
    st.authActive = true;
    // cancel + authenticate in the same tick: liblightdm ignores the stale
    // "authentication-complete" of the cancelled round (sequence numbers).
    safe(function () { return ldm.cancel_authentication(); }, false);
    safe(function () { return ldm.authenticate(st.user.username); }, false);
  }

  function stopAuth() {
    st.authActive = false;
    st.promptReady = false;
    st.pending = null;
    safe(function () { return ldm.cancel_authentication(); }, false);
  }

  function connectSignals() {
    if (!ldm) return;
    safe(function () { ldm.show_prompt.connect(onPrompt); });
    safe(function () { ldm.show_message.connect(onMessage); });
    safe(function () { ldm.authentication_complete.connect(onComplete); });
  }

  function onPrompt(text, type) {
    try {
      if (!st.authActive) return;
      st.promptReady = true;
      st.promptSecret = type !== 0;
      st.promptLabel = promptLabel(text, type);
      if (st.pending !== null) {
        var p = st.pending;
        st.pending = null;
        sendResponse(p);
        return;
      }
      if (st.mode === "busy" || st.mode === "password") setMode("password");
      else render();
    } catch (e) { log("onPrompt:", e && e.message); }
  }

  function onMessage(text, type) {
    try {
      if (!text) return;
      addMsg(translateMessage(text), type === 1 ? "err" : "info");
    } catch (e) { log("onMessage:", e && e.message); }
  }

  function onComplete() {
    try {
      var ok = !!safe(function () { return ldm.is_authenticated; }, false);
      if (ok) { granted(); return; }
      if (!st.authActive) return;          // echo of our own cancellation
      st.authActive = false;
      st.promptReady = false;
      if (st.responded) {
        st.failStreak = 0;
        denied();
      } else {
        // PAM ended without asking us anything (fingerprint timeout, locked account…)
        st.failStreak += 1;
        if (st.failStreak > 3) {
          addMsg(T.authStuck, "err");
          setMode("stuck");
        } else {
          addMsg(T.authRestart, "info");
          setTimeout(function () {
            if (st.mode === "password" || st.mode === "busy") { beginAuth(); setMode("password"); }
          }, 1200);
        }
      }
    } catch (e) { log("onComplete:", e && e.message); }
  }

  function promptLabel(text, type) {
    var t = String(text || "").toLowerCase();
    if (/current|\(current\)|old/.test(t)) return T.passwordCurrent;
    if (/retype|again|confirm|repeat|verify new/.test(t)) return T.passwordRetype;
    if (/new/.test(t)) return T.passwordNew;
    if (/login|user ?name/.test(t)) return T.username;
    if (/code|token|otp|verification|one-time/.test(t)) return T.verifyCode;
    if (/pass|口令|密码/.test(t) || type !== 0) return T.password;
    return String(text || "").replace(/[:：]\s*$/, "") || T.password;
  }

  function translateMessage(text) {
    for (var i = 0; i < MESSAGE_MAP.length; i++) {
      if (MESSAGE_MAP[i][0].test(text)) return MESSAGE_MAP[i][1];
    }
    return text;
  }

  function submit() {
    var v = ui.entry.value;
    ui.entry.value = "";
    if (st.mode === "username") {
      var name = v.trim();
      if (!name) { addMsg(T.emptyName, "err"); return; }
      var found = null;
      for (var i = 0; i < st.users.length; i++) if (st.users[i].username === name) found = st.users[i];
      st.msgs = [];
      chooseUser(found || { username: name });
      return;
    }
    if (st.mode !== "password") return;
    if (!st.authActive) beginAuth();
    if (st.promptReady) sendResponse(v);
    else { st.pending = v; st.responded = true; setMode("busy"); }
  }

  function sendResponse(v) {
    st.promptReady = false;
    st.responded = true;
    setMode("busy");
    safe(function () { return ldm.respond(v); }, false);
  }

  function denied() {
    st.msgs = [{ text: T.denied, kind: "plain" }];
    beginAuth();
    setMode("password");
  }

  function granted() {
    if (st.mode === "granted") return;
    st.authActive = false;
    if (CONFIG.rememberUser && st.user) {
      store.set("lastUser", st.user.username);
      if (st.sessionKey) store.set("session." + st.user.username, st.sessionKey);
    }
    st.msgs = [{ text: T.granted, kind: "plain" }];
    setMode("granted");
    // give the browser one frame to paint the line, then hand over to LightDM
    setTimeout(function () {
      var ok = safe(function () { return ldm.start_session(st.sessionKey); }, true);
      if (ok === false) {
        st.msgs = [{ text: fmt(T.sessionFail, { session: sessionName(st.sessionKey) }), kind: "err" }];
        beginAuth();
        setMode("password");
      }
    }, 60);
  }

  /* ─────────────── user list / manual username ─────────────── */

  function openUserList() {
    stopAuth();
    var cur = st.user ? st.user.username : null;
    st.listIdx = 0;
    for (var i = 0; i < st.users.length; i++) if (st.users[i].username === cur) st.listIdx = i;
    setMode("select");
  }

  function openUsername() {
    stopAuth();
    st.user = null;
    ui.entry.value = "";
    setMode("username");
  }

  function openUserListOrName() {
    st.msgs = [];
    if (st.users.length && !st.hideUsers) openUserList();
    else openUsername();
  }

  function chooseListItem(i) {
    if (i >= st.users.length) { openUsername(); return; }
    st.msgs = [];
    chooseUser(st.users[i]);
  }

  /* ─────────────── session + power menu ─────────────── */

  function buildMenu() {
    st.menu = [{ id: "session" }];
    if (safe(function () { return ldm.can_restart; }, false)) st.menu.push({ id: "restart" });
    if (safe(function () { return ldm.can_shutdown; }, false)) st.menu.push({ id: "shutdown" });
    if (safe(function () { return ldm.can_suspend; }, false)) st.menu.push({ id: "suspend" });
    if (safe(function () { return ldm.can_hibernate; }, false)) st.menu.push({ id: "hibernate" });
    renderMenu();
  }

  function sessionName(key) {
    if (!key) return SESSION_NAMES["default"];
    if (SESSION_NAMES[key]) return SESSION_NAMES[key];
    for (var i = 0; i < st.sessions.length; i++) {
      if (st.sessions[i].key === key) return st.sessions[i].name || key;
    }
    return key;
  }

  function cycleSession() {
    if (!st.sessions.length) return;
    var keys = st.sessions.map(function (s) { return s.key; });
    var i = keys.indexOf(st.sessionKey);
    st.sessionKey = keys[(i + 1) % keys.length];
    renderMenu();
  }

  function renderMenu() {
    if (!ui.sysmenu) return;
    var h = [];
    for (var i = 0; i < st.menu.length; i++) {
      var it = st.menu[i];
      var label = it.id === "session" ? T.sessionLabel + "：" + esc(sessionName(st.sessionKey)) : T[it.id];
      var sel = (st.mode === "menu" || st.mode === "confirm") && i === st.menuIdx;
      h.push("<span class=\"mi" + (sel ? " sel" : "") + "\" data-mi=\"" + i + "\">" + label + "</span>");
    }
    ui.sysmenu.innerHTML = h.join("");
  }

  function openMenu() {
    if (st.mode !== "menu" && st.mode !== "confirm") {
      st.prevMode = st.mode;
      st.menuIdx = 0;             // always reopen on the harmless first item
    }
    setMode("menu");
  }

  function closeMenu() {
    st.confirm = null;
    var back = st.prevMode;
    if (back === "password" && !st.authActive && st.user) beginAuth();
    setMode(back === "menu" || back === "confirm" ? "password" : back);
  }

  function activateMenu(i) {
    var it = st.menu[i];
    if (!it) return;
    st.menuIdx = i;
    if (it.id === "session") { cycleSession(); setMode("menu"); return; }
    st.confirm = it.id;
    setMode("confirm");
  }

  function doPower(id) {
    st.confirm = null;
    st.msgs = [{ text: fmt(T.doing, { action: T[id] }), kind: "info" }];
    stopAuth();
    setMode("busy");
    var ok = safe(function () { return ldm[id](); }, true);
    if (ok === false) st.msgs = [{ text: fmt(T.actionFail, { action: T[id] }), kind: "err" }];
    // Suspend/hibernate return after resume; failed requests return at once.
    setTimeout(function () {
      if (st.mode !== "busy") return;
      if (ok !== false) st.msgs = [];
      if (st.user) { beginAuth(); setMode("password"); } else setMode("username");
    }, ok === false ? 1500 : 3000);
  }

  /* ─────────────── messages ─────────────── */

  function addMsg(text, kind) {
    st.msgs.push({ text: text, kind: kind || "info" });
    if (st.msgs.length > 2) st.msgs.shift();
    render();
  }

  /* ═════════════════════════ 渲染 · rendering ═════════════════════════ */

  function setMode(m) {
    st.mode = m;
    if (m !== "password" && m !== "username") ui.entry.value = "";
    render();
    renderMenu();
    focusEntry();
  }

  function render() {
    if (!ui.console || st.role !== "primary") return;
    var m = st.mode, h = [], i;

    if (m === "select") {
      h.push("<div class=\"line\">" + T.selectOperator + "</div><div class=\"users\">");
      for (i = 0; i <= st.users.length; i++) {
        var u = st.users[i];
        var note = "";
        if (u && u.display_name && u.display_name !== u.username) note += "（" + esc(u.display_name) + "）";
        if (u && u.logged_in) note += T.loggedIn;
        var sel = i === st.listIdx;
        h.push("<div class=\"opt" + (sel ? " sel" : "") + "\" data-idx=\"" + i + "\"><span class=\"mark\">" +
          (sel ? "▶" : "") + "</span><span>" + (u ? esc(u.username) : T.otherUser) +
          "</span><span class=\"note\">" + note + "</span></div>");
      }
      h.push("</div>");
    } else if (m === "username") {
      h.push(promptHtml(T.username, esc(ui.entry.value), true, false));
    } else {
      h.push("<div class=\"line\">" + T.operator + "：" + esc(st.user ? st.user.username : "") + "</div>");
      if (m !== "stuck" && m !== "granted") {
        var shown = st.promptSecret ? new Array(ui.entry.value.length + 1).join("*") : esc(ui.entry.value);
        h.push(promptHtml(st.promptLabel, shown, m === "password", m === "busy" && st.authActive));
      }
    }

    h.push("<div class=\"msgs\">");
    for (i = 0; i < st.msgs.length; i++) {
      h.push("<div class=\"line " + st.msgs[i].kind + "\">" + esc(st.msgs[i].text) + "</div>");
    }
    h.push("</div>");

    if (m === "confirm" && st.confirm) {
      h.push("<div class=\"line msgs\"><span class=\"err\">" + fmt(T.confirm, { action: T[st.confirm] }) + "</span></div>");
    }
    if (st.caps && (m === "password" || m === "username")) {
      h.push("<div class=\"line msgs\"><span class=\"err\">" + T.capsLock + "</span></div>");
    }

    ui.console.innerHTML = h.join("");
  }

  function promptHtml(label, value, cursorOn, busy) {
    return "<div class=\"prompt\"><span>" + esc(label) + "：</span>" +
      "<span class=\"typed\">" + value + "</span><span class=\"cursor" + (cursorOn ? "" : " off") + "\"></span>" +
      (busy ? "<span class=\"busy\">" + T.verifying + "</span>" : "") + "</div>";
  }

  /* ═════════════════════════ 键盘与鼠标 · input ═════════════════════════ */

  function focusEntry() {
    if (st.role !== "primary" || !ui.entry) return;
    try { if (document.activeElement !== ui.entry) ui.entry.focus(); } catch (e) { /* ignore */ }
  }

  function bindInput() {
    ui.entry.focus();
    ui.entry.addEventListener("blur", function () { setTimeout(focusEntry, 0); });
    ui.entry.addEventListener("input", function () {
      if (st.mode === "password" || st.mode === "username") render();
      else ui.entry.value = "";
    });

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", updateCaps, true);

    document.addEventListener("mousedown", function (e) {
      var t = e.target;
      var opt = t && t.closest ? t.closest(".opt") : null;
      var mi = t && t.closest ? t.closest(".mi") : null;
      if (opt && st.mode === "select") {
        st.listIdx = parseInt(opt.getAttribute("data-idx"), 10) || 0;
        chooseListItem(st.listIdx);
      } else if (mi && st.mode !== "granted" && st.mode !== "busy") {
        if (st.mode !== "menu" && st.mode !== "confirm") st.prevMode = st.mode;
        activateMenu(parseInt(mi.getAttribute("data-mi"), 10) || 0);
      }
      e.preventDefault();          // keep focus on the hidden entry
      focusEntry();
    }, true);
  }

  function updateCaps(e) {
    if (!e || !e.getModifierState) return;
    var caps = !!e.getModifierState("CapsLock");
    if (caps !== st.caps) { st.caps = caps; render(); }
  }

  function onKey(e) {
    updateCaps(e);
    var k = e.key;
    var m = st.mode;

    if (m === "granted") { e.preventDefault(); return; }

    if (m === "busy") {
      if (k === "Escape" && st.authActive) { e.preventDefault(); openUserListOrName(); return; }
      if (k === "Enter" || k === "Tab") e.preventDefault();
      return;
    }

    if (m === "select") {
      var n = st.users.length + 1;
      if (k === "ArrowUp") { st.listIdx = (st.listIdx + n - 1) % n; render(); }
      else if (k === "ArrowDown") { st.listIdx = (st.listIdx + 1) % n; render(); }
      else if (k === "Enter") chooseListItem(st.listIdx);
      else if (k === "Tab") openMenu();
      else if (k === "Escape" && st.user) chooseUser(st.user);
      else return;
      e.preventDefault();
      return;
    }

    if (m === "confirm") {
      e.preventDefault();
      if (k === "Enter") doPower(st.confirm);
      else if (k === "Escape") { st.confirm = null; setMode("menu"); }
      return;
    }

    if (m === "menu") {
      var c = st.menu.length;
      if (k === "ArrowLeft" || k === "ArrowUp") { st.menuIdx = (st.menuIdx + c - 1) % c; renderMenu(); }
      else if (k === "ArrowRight" || k === "ArrowDown") { st.menuIdx = (st.menuIdx + 1) % c; renderMenu(); }
      else if (k === "Enter") activateMenu(st.menuIdx);
      else if (k === "Escape" || k === "Tab") closeMenu();
      e.preventDefault();
      return;
    }

    if (m === "stuck") {
      if (k === "Escape") { e.preventDefault(); openUserListOrName(); }
      else if (k === "Tab") { e.preventDefault(); openMenu(); }
      return;
    }

    if (m === "password" || m === "username") {
      if (k === "Enter") { e.preventDefault(); submit(); return; }
      if (k === "Tab") { e.preventDefault(); openMenu(); return; }
      if (k === "Escape") {
        e.preventDefault();
        if (m === "password") openUserListOrName();
        else if (st.users.length && !st.hideUsers) { st.msgs = []; openUserList(); }
      }
    }
  }

  /* ═════════════════════════ 时钟 · clock ═════════════════════════ */

  function startClock() {
    var lastTime = "", lastDate = "";
    (function tick() {
      var d = new Date();
      var time = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
      var date = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日　" + T.week + WEEKDAYS.charAt(d.getDay());
      if (time !== lastTime && ui["clock-time"]) { ui["clock-time"].textContent = time; lastTime = time; }
      if (date !== lastDate && ui["clock-date"]) { ui["clock-date"].textContent = date; lastDate = date; }
      setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    })();
  }

  // exposed for the browser preview harness only
  window.__zhuque = { st: st, config: CONFIG, strings: T };
})();
