#
# NAS OS theme for LuCI
# Licensed to the public under the Apache License 2.0.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=NAS OS - soft, borderless theme with accent colours
LUCI_DEPENDS:=
PKG_LICENSE:=Apache-2.0
PKG_VERSION:=0.1.0

define Package/luci-theme-nasos/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.NASOS
	if [ "$$(uci -q get luci.main.mediaurlbase)" = "/luci-static/nasos" ]; then
		uci set luci.main.mediaurlbase=/luci-static/bootstrap
	fi
	uci commit luci
}
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
