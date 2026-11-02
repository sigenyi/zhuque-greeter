#!/usr/bin/env bash
# 朱雀 · ZHUQUE — go back to the stock LightDM greeter.
#   sudo ./uninstall.sh           switch back (keeps theme + nody-greeter installed)
#   sudo ./uninstall.sh --purge   also remove the theme and the nody-greeter package
set -euo pipefail

BACKUP_DIR=/var/backups/zhuque-greeter
say() { printf '\033[1;31m[zhuque]\033[0m %s\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "run it with sudo:  sudo ./uninstall.sh" >&2; exit 1; }

rm -f /etc/lightdm/lightdm.conf.d/90-zhuque.conf
[[ -f /etc/lightdm/lightdm.conf ]] && sed -i -E 's/^#zhuque# //' /etc/lightdm/lightdm.conf
if [[ -f "$BACKUP_DIR/web-greeter.yml.orig" ]]; then
  cp -a "$BACKUP_DIR/web-greeter.yml.orig" /etc/lightdm/web-greeter.yml
fi

if [[ "${1:-}" == "--purge" ]]; then
  rm -rf /usr/share/web-greeter/themes/zhuque
  apt-get purge -y nody-greeter || true
  rm -rf "$BACKUP_DIR"
  say "theme and nody-greeter removed"
fi

effective="$(lightdm --show-config 2>&1 | grep -E 'greeter-session=' | tail -n1 || true)"
say "LightDM now uses: ${effective:-the Debian default (lightdm-gtk-greeter)}"
say "restart LightDM to see it:  sudo systemctl restart lightdm   (this logs you out)"
