<#
.SYNOPSIS
  EX2 Ultra Reborn installer for Windows (PowerShell or Command Prompt).

.DESCRIPTION
  Uploads this repo to the NAS (into RAM, /tmp) and runs the same setup.sh there that the
  Mac/Linux instructions use, so both follow exactly the same, tested steps and the same
  strict model checks. Needs only what Windows 10/11 already include: ssh and tar.

  Steps, in order:
    .\setup.cmd key        add your SSH key to the NAS (asks for the NAS root password once)
    .\setup.cmd check      read-only: is this an EX2 Ultra on OpenWrt? which disks and RAID?
    .\setup.cmd packages   install the packages this setup needs (the NAS needs internet)
    .\setup.cmd data       use the existing WD data mirror (RAID 1) as /mnt/data; never formats
    .\setup.cmd install    scripts, dashboard and theme; names, fan, alerts, disk sleep; reboot
    .\setup.cmd alerts     optional: e-mail alerts
    .\setup.cmd update     later: re-copy scripts, dashboard and theme only

  The NAS address is asked for once, or pass it:  .\setup.cmd check -Nas 192.168.1.50
  (or set it for the session:  $env:NAS = "192.168.1.50")
#>
param(
	[Parameter(Position = 0)]
	[ValidateSet('key', 'check', 'packages', 'data', 'install', 'alerts', 'update')]
	[string]$Command,
	[string]$Nas = $env:NAS
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot

function Stop-Setup([string]$Message) {
	Write-Host "STOP: $Message" -ForegroundColor Red
	exit 1
}

# True when ssh refuses the NAS because its host key changed. That is expected once, right
# after OpenWrt replaced the WD firmware (preflight-wd.cmd saved WD's key for the same address).
function Test-HostKeyChanged([string]$Target) {
	$eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'   # PS 5.1: stderr must not throw
	$out = (& ssh -o BatchMode=yes -o ConnectTimeout=8 $Target true 2>&1 | Out-String)
	$ErrorActionPreference = $eap
	return ($out -match 'REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed')
}

# Forget the saved host key of the NAS (in the known_hosts file(s) ssh actually uses for it).
function Remove-OldHostKey([string]$Target) {
	$cfg = & ssh -G $Target
	$hostName = ($cfg | Where-Object { $_ -like 'hostname *' } | Select-Object -First 1).Substring(9)
	$port = ($cfg | Where-Object { $_ -like 'port *' } | Select-Object -First 1).Substring(5)
	$entry = if ($port -eq '22') { $hostName } else { "[${hostName}]:$port" }
	$files = ($cfg | Where-Object { $_ -like 'userknownhostsfile *' } | Select-Object -First 1).Substring(19)
	foreach ($m in [regex]::Matches($files, '(.+?known_hosts2?)(?=\s|$)')) {
		$f = $m.Groups[1].Value.Trim()
		if (Test-Path $f) { & ssh-keygen -R $entry -f $f | Out-Null }
	}
}

if (-not $Command) {
	Get-Help $PSCommandPath -Detailed | Out-Host
	exit 1
}
foreach ($tool in 'ssh', 'scp', 'tar') {
	if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
		Stop-Setup "'$tool' is missing. On Windows 10/11: Settings > System > Optional features > add 'OpenSSH Client'."
	}
}
if (-not $Nas) { $Nas = Read-Host 'NAS address (IP, e.g. 192.168.1.50)' }
if (-not $Nas) { Stop-Setup 'no NAS address given.' }
if ($Nas -notmatch '@') { $Nas = "root@$Nas" }
$env:NAS = $Nas.Substring($Nas.IndexOf('@') + 1)   # remembered for this window

# --- key: install the user's SSH public key on the NAS -------------------------------
if ($Command -eq 'key') {
	$sshDir = Join-Path $HOME '.ssh'
	$pub = Join-Path $sshDir 'id_ed25519.pub'
	if (-not (Test-Path $pub)) {
		Write-Host '== creating an SSH key (press Enter to accept the defaults)'
		if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir | Out-Null }
		& ssh-keygen -t ed25519 -f (Join-Path $sshDir 'id_ed25519')
		if ($LASTEXITCODE -ne 0 -or -not (Test-Path $pub)) { Stop-Setup 'could not create an SSH key.' }
	}
	if (Test-HostKeyChanged $Nas) {
		Write-Host "The NAS at $Nas has a different SSH identity than the one saved on this PC." -ForegroundColor Yellow
		Write-Host 'That is normal right after installing OpenWrt on it (WD firmware had its own key).'
		Write-Host 'If you did NOT just reinstall the NAS, answer N: something else may be answering at that address.'
		$answer = Read-Host 'Did you just install OpenWrt on this NAS? Forget the old identity? [y/N]'
		if ($answer -notmatch '^[yY]') { Stop-Setup 'stopped; the saved identity was kept.' }
		Remove-OldHostKey $Nas
	}
	Write-Host "== adding your key to $Nas (type the NAS root password when asked)"
	$key = (Get-Content -Raw $pub).Trim()
	if ($key -notmatch '^ssh-[a-z0-9-]+ [A-Za-z0-9+/=]+( [^'']*)?$') { Stop-Setup "unexpected key format in $pub" }
	& ssh -o ConnectTimeout=8 $Nas "umask 077; mkdir -p /etc/dropbear; grep -qxF '$key' /etc/dropbear/authorized_keys 2>/dev/null || echo '$key' >> /etc/dropbear/authorized_keys"
	if ($LASTEXITCODE -ne 0) { Stop-Setup "could not add the key (ssh exit code $LASTEXITCODE)." }
	& ssh -o BatchMode=yes -o ConnectTimeout=8 $Nas true
	if ($LASTEXITCODE -ne 0) { Stop-Setup 'the key was added, but key login still fails.' }
	Write-Host 'OK: key login works. Next: .\setup.cmd check' -ForegroundColor Green
	exit 0
}

# --- every other step: upload the repo to the NAS and run setup.sh there --------------
& ssh -o BatchMode=yes -o ConnectTimeout=8 $Nas true
if ($LASTEXITCODE -ne 0) {
	if (Test-HostKeyChanged $Nas) { Stop-Setup "the NAS's SSH identity changed (normal right after installing OpenWrt). Run:  .\setup.cmd key" }
	Stop-Setup "can't log in to $Nas with your SSH key. Run first:  .\setup.cmd key"
}

$tarPath = Join-Path ([IO.Path]::GetTempPath()) 'ex2-ultra-reborn.tar'
$env:COPYFILE_DISABLE = '1'   # macOS (PowerShell 7): no ._ metadata files in the archive
& tar --exclude='._*' --exclude=.DS_Store -cf $tarPath -C $Repo setup.sh nas-system luci-app-nas luci-theme-nasos
if ($LASTEXITCODE -ne 0) { Stop-Setup 'could not pack the repo (tar).' }

# scp -O copies the file byte for byte (OpenWrt's dropbear provides the scp it needs)
& scp -q -O -o ConnectTimeout=8 $tarPath "${Nas}:/tmp/ex2rb.tar"
$rc = $LASTEXITCODE
if ($rc -ne 0) {
	# Windows 10's scp (OpenSSH 8.x) has no -O option; it already uses the classic protocol
	& scp -q -o ConnectTimeout=8 $tarPath "${Nas}:/tmp/ex2rb.tar"
	$rc = $LASTEXITCODE
}
Remove-Item $tarPath -ErrorAction SilentlyContinue
if ($rc -ne 0) { Stop-Setup "could not copy the files to the NAS (scp exit code $rc)." }

# -t gives setup.sh a terminal for its questions; files are removed from the NAS afterwards.
# chmod: Windows tar stores every file as 0666 and every folder as 0777; without it, setup.sh
# would install world-writable files (and make existing system folders world-writable).
& ssh -t -o ConnectTimeout=8 $Nas "rm -rf /tmp/ex2rb; mkdir -p /tmp/ex2rb && tar -x -o -f /tmp/ex2rb.tar -C /tmp/ex2rb && rm -f /tmp/ex2rb.tar && chmod -R go-w /tmp/ex2rb && NAS=local sh /tmp/ex2rb/setup.sh $Command; rc=`$?; rm -rf /tmp/ex2rb /tmp/ex2rb.tar; exit `$rc"
$rc = $LASTEXITCODE
if ($rc -ne 0) { exit $rc }

if ($Command -eq 'install') {
	$answer = Read-Host 'Reboot the NAS now? [y/N]'
	if ($answer -match '^[yY]') {
		& ssh -o ConnectTimeout=8 $Nas reboot
		Write-Host 'Rebooting. Wait about 2 minutes, then open the dashboard in your browser.'
	}
}
