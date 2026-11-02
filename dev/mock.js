/*
 * Browser-only mock of the nody-greeter / web-greeter 3 JavaScript API.
 * NOT installed with the theme. Used for the live preview and automated tests.
 *
 * Behaviour mirrors liblightdm where it matters for themes:
 *  - authenticate() bumps a sequence number; results of older rounds are dropped
 *  - cancel_authentication() alone produces an "authentication-complete" (failed)
 *  - respond() is only legal while a prompt is waiting (misuse is recorded)
 */
(function () {
  "use strict";
  var P = new URLSearchParams(location.search);
  var DEMO_PASSWORD = P.get("pw") || "zhuque";
  var USERS = (P.get("users") || "fox,guest").split(",").filter(Boolean);

  window.__mock = { calls: [], misuse: [], started: null, power: [] };
  function rec(name, arg) { window.__mock.calls.push(arg === undefined ? name : name + ":" + arg); }
  function misuse(msg) { window.__mock.misuse.push(msg); console.warn("[mock] MISUSE " + msg); }

  function Signal(name) { this.name = name; this.cbs = []; }
  Signal.prototype.connect = function (cb) { if (typeof cb === "function") this.cbs.push(cb); };
  Signal.prototype.disconnect = function (cb) { this.cbs = this.cbs.filter(function (c) { return c !== cb; }); };
  Signal.prototype._emit = function () {
    var args = arguments;
    this.cbs.forEach(function (cb) { cb.apply(null, args); });
  };

  var seq = 0, waiting = 0, inAuth = false, authUser = null, isAuth = false;

  var lightdm = {
    show_prompt: new Signal("show-prompt"),
    show_message: new Signal("show-message"),
    authentication_complete: new Signal("authentication-complete"),
    autologin_timer_expired: new Signal("autologin-timer-expired"),
    battery_update: new Signal("battery_update"),
    brightness_update: new Signal("brightness_update"),
    idle: new Signal("idle"),
    reset: new Signal("reset"),

    get hostname() { return P.get("host") || "localhost"; },
    get users() {
      return USERS.map(function (u, i) {
        return { username: u, display_name: i === 0 ? u : u.charAt(0).toUpperCase() + u.slice(1),
          home_directory: "/home/" + u, image: "", language: "", layout: "", layouts: [],
          logged_in: false, session: "xfce", background: "" };
      });
    },
    get sessions() {
      return [
        { key: "xfce", name: "Xfce Session", comment: "Use this session to run Xfce as your desktop environment", type: "x" },
        { key: "lightdm-xsession", name: "Default X session", comment: "", type: "x" }
      ];
    },
    get default_session() { return "lightdm-xsession"; },
    get hide_users_hint() { return P.get("hide") === "1"; },
    get select_user_hint() { return undefined; },
    get lock_hint() { return P.get("lock") === "1"; },
    get can_shutdown() { return true; },
    get can_restart() { return true; },
    get can_suspend() { return true; },
    get can_hibernate() { return false; },
    get can_access_battery() { return true; },
    get battery_data() {
      return { name: "BAT0", level: 87, status: "Discharging", ac_status: false, capacity: 100, time: "", watt: 0 };
    },
    get in_authentication() { return inAuth; },
    get is_authenticated() { return isAuth; },
    get authentication_user() { return authUser; },

    authenticate: function (username) {
      rec("authenticate", username);
      seq += 1;
      var my = seq;
      inAuth = true; isAuth = false; authUser = username; waiting = 0;
      setTimeout(function () {
        if (my !== seq) return;
        waiting = 1;
        lightdm.show_prompt._emit("Password: ", 1);
      }, 140);
      return true;
    },
    cancel_authentication: function () {
      rec("cancel_authentication");
      if (!inAuth) return true;
      var my = seq;
      waiting = 0;
      setTimeout(function () {            // liblightdm: END_AUTHENTICATION for this round
        if (my !== seq || !inAuth) return;
        inAuth = false; isAuth = false;
        lightdm.authentication_complete._emit();
      }, 60);
      return true;
    },
    respond: function (response) {
      rec("respond");
      if (waiting <= 0) { misuse("respond() without a pending prompt"); return false; }
      waiting -= 1;
      var my = seq;
      setTimeout(function () {
        if (my !== seq) return;
        inAuth = false;
        isAuth = response === DEMO_PASSWORD;
        lightdm.authentication_complete._emit();
      }, 900);
      return true;
    },
    start_session: function (key) {
      rec("start_session", key);
      if (!isAuth) misuse("start_session() while not authenticated");
      window.__mock.started = key;
      showDemoNote("（演示）会话「" + key + "」已启动 —— 真实系统会在此进入桌面。三秒后重新载入……");
      setTimeout(function () { if (!P.get("noreload")) location.reload(); }, 3200);
      return true;
    },
    shutdown: function () { rec("shutdown"); window.__mock.power.push("shutdown"); return true; },
    restart: function () { rec("restart"); window.__mock.power.push("restart"); return true; },
    suspend: function () { rec("suspend"); window.__mock.power.push("suspend"); return true; },
    hibernate: function () { rec("hibernate"); window.__mock.power.push("hibernate"); return true; },
    set_language: function () { return false; }
  };

  function showDemoNote(text) {
    var n = document.getElementById("demo-note");
    if (!n) return;
    n.textContent = text;
    n.classList.add("big");
  }

  window.lightdm = lightdm;
  window.greeter_config = {
    branding: { background_images_dir: "/usr/share/backgrounds", logo_image: "", user_image: "" },
    greeter: { debug_mode: false, detect_theme_errors: true, screensaver_timeout: 300, secure_mode: true, theme: "zhuque", time_language: "" },
    features: { battery: true, backlight: { enabled: false, value: 10, steps: 0 } }
  };
  window.theme_utils = {
    dirlist: function (p, o, cb) { if (cb) cb([]); },
    get_current_localized_date: function () { return new Date().toLocaleDateString("zh-CN"); },
    get_current_localized_time: function () { return new Date().toLocaleTimeString("zh-CN"); }
  };
  var meta = { id: 1, is_primary: P.get("secondary") !== "1", position: { x: 0, y: 0 },
    size: { width: innerWidth, height: innerHeight }, overallBoundary: { minX: 0, maxX: innerWidth, minY: 0, maxY: innerHeight } };
  window.greeter_comm = {
    get window_metadata() { return meta; },
    broadcast: function (data) {
      var ev = new Event("GreeterBroadcastEvent");
      ev.window = meta; ev.data = data;
      setTimeout(function () { window.dispatchEvent(ev); }, 0);
    },
    whenReady: function () { return Promise.resolve(); }
  };

  // Same timing as nody-greeter's preload: DOMContentLoaded + 2 ms.
  window.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () { window.dispatchEvent(new Event("GreeterReady")); }, 2);
  });
})();
