<#
.SYNOPSIS
  Run BEFORE flashing OpenWrt, while the NAS still runs WD's firmware. Read-only.

.DESCRIPTION
  Checks that the device is a WD My Cloud EX2 Ultra, and optionally copies all 8 flash
  partitions to this PC with SHA-256 checksums (your way back to WD firmware).
  Same checks as preflight-wd.sh:
    - WD model number in /etc/system.conf must be BVBZ (My Cloud EX2 Ultra). The same WD
      firmware image also serves the My Cloud Mirror Gen2, so this is what tells them apart.
    - The flash layout must be exactly the EX2 Ultra's 8 partitions (/proc/mtd).
    - The unit must have 2 drive bays (DVC_DRIVE_COUNT in /etc/system.conf).
  Needs SSH turned on in the WD dashboard (user "sshd"); asks for its password.

.EXAMPLE
  .\preflight-wd.cmd 192.168.1.50
  .\preflight-wd.cmd 192.168.1.50 -Backup .\wd-flash-backup
#>
param(
	[Parameter(Mandatory = $true, Position = 0)][string]$Ip,
	[string]$Backup
)

$ErrorActionPreference = 'Stop'
$Target = $Ip
if ($Target -notmatch '@') { $Target = "sshd@$Ip" }

function Stop-Preflight([string]$Message) {
	Write-Host ''
	Write-Host "STOP: $Message" -ForegroundColor Red
	Write-Host 'Nothing was changed. Do not flash OpenWrt with these scripts on this device.'
	exit 1
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
	Stop-Preflight "'ssh' is missing. On Windows 10/11: Settings > System > Optional features > add 'OpenSSH Client'."
}

# EX2 Ultra flash layout under WD firmware: "<size> <name>" per partition
$ExpectMtd = @(
	'00500000 U-Boot', '00500000 uImage', '00500000 uRamdisk', '0b900000 image.cfs',
	'00f00000 rescue fw', '01400000 config', '00a00000 reserve1', '00a00000 reserve2')

# Read-only report from the NAS. Sent as one line of shell, so no Windows line endings
# or quoting rules can get in the way.
$remote = 'if [ -f /etc/openwrt_release ]; then echo OPENWRT; exit 0; fi; ' +
	'[ -r /etc/system.conf ] || { echo NOSYSCONF; exit 0; }; ' +
	'echo MODEL=$(sed -n ''s/^modelNumber=//p'' /etc/system.conf | head -1 | tr -d ''\042\r''); ' +
	'echo BAYS=$(sed -n ''s/^DVC_DRIVE_COUNT=//p'' /etc/system.conf | head -1 | tr -d ''\042\r''); ' +
	'sed -n ''s/^mtd\([0-9]*\): \([0-9a-f]*\) [0-9a-f]* .\(.*\).$/MTD=\2 \3/p'' /proc/mtd; ' +
	'echo DISKS=$(ls -d /sys/block/sd? 2>/dev/null | wc -l); ' +
	'grep -A1 ^md /proc/mdstat 2>/dev/null | sed s/^/RAID=/'

Write-Host "== connecting to $Target (type the WD SSH password if asked)"
$out = & ssh -o ConnectTimeout=8 $Target $remote
if ($LASTEXITCODE -ne 0) { Stop-Preflight "can't connect over SSH. Turn on SSH in the WD dashboard and check the IP address." }
$lines = @($out | ForEach-Object { "$_".TrimEnd("`r") })

if ($lines -contains 'OPENWRT') {
	Write-Host 'This NAS already runs OpenWrt: skip this step and use .\setup.cmd check'
	exit 0
}
if ($lines -contains 'NOSYSCONF') { Stop-Preflight "no /etc/system.conf: this doesn't look like WD My Cloud firmware." }

function Get-Value([string]$Key) {
	$l = $lines | Where-Object { $_.StartsWith("$Key=") } | Select-Object -First 1
	if ($l) { return $l.Substring($Key.Length + 1) } else { return '' }
}
$model = Get-Value 'MODEL'
$bays = Get-Value 'BAYS'
$disks = Get-Value 'DISKS'
$mtd = @($lines | Where-Object { $_.StartsWith('MTD=') } | ForEach-Object { $_.Substring(4) })
$raid = @($lines | Where-Object { $_.StartsWith('RAID=') } | ForEach-Object { $_.Substring(5) })

Write-Host "WD model number: $model"
if ($model -ne 'BVBZ') { Stop-Preflight "model number is '$model', not BVBZ (My Cloud EX2 Ultra). These scripts are only for the EX2 Ultra." }
Write-Host "Drive bays:      $bays"
if ($bays -ne '2') { Stop-Preflight "WD reports '$bays' drive bays; the EX2 Ultra has 2." }
Write-Host 'Flash layout:'
$mtd | ForEach-Object { Write-Host "  $_" }
if (($mtd -join '|') -ne ($ExpectMtd -join '|')) { Stop-Preflight "the flash layout differs from the EX2 Ultra's. This may be a different hardware revision." }
Write-Host "Disks found:     $disks"
Write-Host 'RAID (WD):'
if ($raid.Count) { $raid | ForEach-Object { Write-Host "  $_" } } else { Write-Host '  none' }
if (-not ($raid | Where-Object { $_ -like 'md1 : active raid1*' })) {
	Write-Host 'NOTE: no RAID 1 data mirror (md1) is running. setup needs two disks in WD RAID 1 mode.' -ForegroundColor Yellow
}
Write-Host ''
Write-Host 'OK: this is a WD My Cloud EX2 Ultra with the expected flash layout.' -ForegroundColor Green

if ($Backup) {
	if (-not (Test-Path $Backup)) { New-Item -ItemType Directory -Path $Backup | Out-Null }
	$dir = (Resolve-Path $Backup).Path
	$stream = Join-Path $dir 'flash-all.bin'
	Write-Host ''
	Write-Host "== backing up all 8 flash partitions to $dir (read-only on the NAS; about 270 MB)"

	# One SSH session dumps every partition, one after another, into a single file. The file
	# is written by cmd.exe's ">" redirect, which keeps the bytes exactly as sent (a
	# PowerShell pipe or Start-Process redirect would treat them as text and corrupt them).
	# nanddump (as the OpenWrt wiki suggests) when the WD firmware has it, else a plain read.
	$nd = (0..7 | ForEach-Object { "nanddump -q /dev/mtd$_" }) -join '; '
	$ct = (0..7 | ForEach-Object { "cat /dev/mtd$_" }) -join '; '
	$remote = "if command -v nanddump >/dev/null 2>&1; then $nd; else $ct; fi"
	$line = "ssh -o ConnectTimeout=8 $Target `"$remote`" > `"$stream`""
	if ($env:OS -eq 'Windows_NT') {
		$runner = Join-Path ([IO.Path]::GetTempPath()) 'ex2rb-backup.cmd'
		[IO.File]::WriteAllText($runner, "@$line`r`n")
		& cmd.exe /c $runner
	} else {
		$runner = Join-Path ([IO.Path]::GetTempPath()) 'ex2rb-backup.sh'
		[IO.File]::WriteAllText($runner, "$line`n")
		& /bin/sh $runner
	}
	$rc = $LASTEXITCODE
	Remove-Item $runner -ErrorAction SilentlyContinue
	if ($rc -ne 0) { Stop-Preflight "the flash dump failed (ssh exit code $rc)." }

	# Split the stream into one file per partition, using the exact sizes from /proc/mtd
	$sizes = @($mtd | ForEach-Object { [Convert]::ToInt64($_.Split(' ')[0], 16) })
	$total = ($sizes | Measure-Object -Sum).Sum
	$got = (Get-Item $stream).Length
	if ($got -ne $total) { Remove-Item $stream; Stop-Preflight "received $got bytes, expected $total. Try again." }
	$in = [IO.File]::OpenRead($stream)
	$buf = New-Object byte[] 1048576
	$sums = @()
	try {
		for ($n = 0; $n -lt $mtd.Count; $n++) {
			$name = $mtd[$n].Substring(9)
			$file = Join-Path $dir ("mtd$n-" + ($name -replace ' ', '_') + '.bin')
			$out = [IO.File]::Create($file)
			$left = $sizes[$n]
			while ($left -gt 0) {
				$want = [int][Math]::Min($buf.Length, $left)
				$r = $in.Read($buf, 0, $want)
				if ($r -le 0) { break }
				$out.Write($buf, 0, $r); $left -= $r
			}
			$out.Close()
			if ($left -ne 0) { Stop-Preflight "mtd$n is short by $left bytes. Try again." }
			Write-Host "  mtd$n ${name}: $($sizes[$n]) bytes"
			$sums += ('{0}  {1}' -f (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower(), (Split-Path $file -Leaf))
		}
	} finally { $in.Close() }
	Remove-Item $stream
	[IO.File]::WriteAllText((Join-Path $dir 'SHA256SUMS'), (($sums -join "`n") + "`n"))
	Write-Host "Saved, with checksums in $(Join-Path $dir 'SHA256SUMS'). Keep this folder safe: it is your way back to WD firmware." -ForegroundColor Green
}
