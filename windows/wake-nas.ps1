<#
.SYNOPSIS
  Wake the NAS with a Wake-on-LAN magic packet (broadcast on the local network).
.EXAMPLE
  .\wake-nas.cmd 00:11:22:33:44:55
  The NAS's MAC address: ssh root@<NAS IP> cat /sys/class/net/eth0/address
#>
param([Parameter(Mandatory = $true, Position = 0)][string]$Mac, [int[]]$Port = @(9, 7))

$hex = $Mac -replace '[:\-\.]', ''
if ($hex -notmatch '^[0-9A-Fa-f]{12}$') { Write-Host "not a MAC address: $Mac" -ForegroundColor Red; exit 1 }
$macBytes = [byte[]](0..5 | ForEach-Object { [Convert]::ToByte($hex.Substring($_ * 2, 2), 16) })
$packet = New-Object byte[] 102
for ($i = 0; $i -lt 6; $i++) { $packet[$i] = 0xFF }
for ($r = 0; $r -lt 16; $r++) { [Array]::Copy($macBytes, 0, $packet, 6 + $r * 6, 6) }

$udp = New-Object System.Net.Sockets.UdpClient
$udp.EnableBroadcast = $true
foreach ($p in $Port) {
	[void]$udp.Send($packet, $packet.Length, (New-Object System.Net.IPEndPoint ([System.Net.IPAddress]::Broadcast), $p))
}
$udp.Close()
Write-Host "magic packet sent to $Mac"
