#!/usr/bin/env bash
# 朱雀 · ZHUQUE — install the red terminal login screen
# Target: Debian 13 (trixie) with LightDM (the Xfce default). Run:  sudo ./install.sh
set -euo pipefail

THEME_NAME=zhuque
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THEME_SRC="$HERE/theme/$THEME_NAME"
THEME_DST="/usr/share/web-greeter/themes/$THEME_NAME"
NODY_VERSION=1.6.2
NODY_DEB="nody-greeter-${NODY_VERSION}-debian.deb"
NODY_URL="https://github.com/JezerM/nody-greeter/releases/download/${NODY_VERSION}/${NODY_DEB}"
DROPIN=/etc/lightdm/lightdm.conf.d/90-zhuque.conf
MAIN_CONF=/etc/lightdm/lightdm.conf
WG_CONF=/etc/lightdm/web-greeter.yml
BACKUP_DIR=/var/backups/zhuque-greeter

say() { printf '\033[1;31m[zhuque]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[zhuque] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run it with sudo:  sudo ./install.sh"
[[ -f "$THEME_SRC/index.html" ]] || die "theme files not found in $THEME_SRC"

# ── 1. LightDM must be the display manager ─────────────────────────────────
dm="$(cat /etc/X11/default-display-manager 2>/dev/null || true)"
[[ "$dm" == */lightdm ]] || die "display manager is '${dm:-unknown}', not LightDM. This theme needs LightDM."

# ── 2. packages: fonts + LightDM introspection data ────────────────────────
say "installing fonts and LightDM bindings…"
apt-get update -qq
pkgs=(fonts-unifont fonts-wqy-zenhei liblightdm-gobject-1-0 gir1.2-lightdm-1 gobject-introspection
      x11-xserver-utils)
# nody-greeter's node-gtk needs the GIRepository typelib on newer Debian (JezerM/nody-greeter#66)
if apt-cache show gir1.2-girepository-2.0 >/dev/null 2>&1; then pkgs+=(gir1.2-girepository-2.0); fi
apt-get install -y "${pkgs[@]}"

# ── 3. nody-greeter (web-based LightDM greeter, renders the HTML theme) ────
if ! command -v nody-greeter >/dev/null 2>&1; then
  deb="$HERE/$NODY_DEB"
  if [[ ! -f "$deb" ]]; then
    say "downloading $NODY_DEB (~88 MB) from GitHub…"
    if command -v curl >/dev/null 2>&1; then curl -fL --retry 3 -o "$deb" "$NODY_URL"
    else wget -O "$deb" "$NODY_URL"; fi || die "download failed — fetch $NODY_URL manually and put it next to install.sh"
  fi
  say "package sha256: $(sha256sum "$deb" | cut -d' ' -f1)"
  apt-get install -y "$deb"
else
  say "nody-greeter already installed: $(command -v nody-greeter)"
fi

shopt -s nullglob
gir=(/usr/lib/*/girepository-1.0/GIRepository-*.typelib /usr/lib/girepository-1.0/GIRepository-*.typelib)
ldm=(/usr/lib/*/girepository-1.0/LightDM-1.typelib /usr/lib/girepository-1.0/LightDM-1.typelib)
shopt -u nullglob
(( ${#gir[@]} )) || die "GIRepository typelib missing (try: apt install gir1.2-girepository-2.0). Nothing was switched."
(( ${#ldm[@]} )) || die "LightDM typelib missing (try: apt install gir1.2-lightdm-1). Nothing was switched."

# ── 4. theme files ─────────────────────────────────────────────────────────
say "installing theme → $THEME_DST"
install -d -m 755 "$THEME_DST"
cp -r "$THEME_SRC/." "$THEME_DST/"
find "$THEME_DST" -type d -exec chmod 755 {} +
find "$THEME_DST" -type f -exec chmod 644 {} +

# ── 5. greeter config (original is backed up once) ─────────────────────────
install -d -m 755 "$BACKUP_DIR"
if [[ -f "$WG_CONF" && ! -f "$BACKUP_DIR/web-greeter.yml.orig" ]]; then
  cp -a "$WG_CONF" "$BACKUP_DIR/web-greeter.yml.orig"
fi
cat > "$WG_CONF" <<EOF
# written by zhuque-greeter install.sh (original: $BACKUP_DIR/web-greeter.yml.orig)
branding:
    background_images_dir: /usr/share/backgrounds
    logo_image: ""
    user_image: ""
greeter:
    debug_mode: false
    detect_theme_errors: true
    screensaver_timeout: 300
    secure_mode: true
    theme: $THEME_NAME
    icon_theme:
    time_language:
layouts:
    - us
features:
    battery: false
    backlight:
        enabled: false
        value: 10
        steps: 0
EOF

# ── 6. point LightDM at nody-greeter (one drop-in file — delete it to undo) ─
if grep -Eq '^[[:space:]]*greeter-session[[:space:]]*=' "$MAIN_CONF" 2>/dev/null; then
  [[ -f "$BACKUP_DIR/lightdm.conf.orig" ]] || cp -a "$MAIN_CONF" "$BACKUP_DIR/lightdm.conf.orig"
  sed -i -E 's/^([[:space:]]*greeter-session[[:space:]]*=.*)$/#zhuque# \1/' "$MAIN_CONF"
  say "commented out greeter-session in $MAIN_CONF (it would override the drop-in)"
fi
install -d -m 755 /etc/lightdm/lightdm.conf.d
cat > "$DROPIN" <<'EOF'
# Added by zhuque-greeter install.sh. Delete this file (or run uninstall.sh) to get the stock greeter back.
[Seat:*]
greeter-session=nody-greeter
EOF

effective="$(lightdm --show-config 2>&1 | grep -E 'greeter-session=' | tail -n1 || true)"
say "LightDM now uses: ${effective:-<could not read config>}"

cat <<EOF

  Installed. Nothing changes until LightDM restarts.

  1) Quick check, as your normal user (no sudo):
       nody-greeter --api-version
     It should print a version number such as 1.0.0. If it prints an error
     mentioning "Typelib" instead, don't restart yet: fix that first.

  2) Save your work, then restart LightDM (this logs you out):
       sudo systemctl restart lightdm
     or simply reboot.

  If the new login screen ever fails: press Ctrl+Alt+F3, log in on the text
  console and run:   sudo $HERE/uninstall.sh && sudo systemctl restart lightdm
EOF
