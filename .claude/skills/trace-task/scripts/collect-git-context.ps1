<#
.SYNOPSIS
  Collects repository evidence for a trace-task report and prints it as Markdown.

.DESCRIPTION
  Read-only: runs git and reads manifests, never modifies the repo.
  Compares the working tree (committed + uncommitted + untracked) against -Base,
  so work from several sessions or agents on the same task is included.

  Without PowerShell, the equivalent evidence is:
    git branch --show-current; git rev-parse HEAD
    git log --oneline <base>..HEAD
    git status --porcelain
    git diff --name-status <base>; git ls-files --others --exclude-standard
    git diff --stat <base>
    git diff <base> -- <dependency manifests>

.PARAMETER Base
  Commit/ref the task started from. Defaults to the merge-base with the default branch, or HEAD.

.PARAMETER Task
  Optional short task name, echoed in the header.

.EXAMPLE
  pwsh -NoProfile -File collect-git-context.ps1 -Base main -Task "save versioning"
#>
param(
  [string]$Base,
  [string]$Task = ''
)

$ErrorActionPreference = 'Stop'

function Invoke-Git { param([Parameter(ValueFromRemainingArguments)][string[]]$GitArgs)
  $out = & git @GitArgs 2>$null
  if ($LASTEXITCODE -ne 0) { return @() }
  return @($out)
}

$root = (Invoke-Git rev-parse --show-toplevel) | Select-Object -First 1
if (-not $root) { Write-Error 'Not inside a git repository.'; exit 1 }
Set-Location $root

# --- Base ref -----------------------------------------------------------------
if (-not $Base) {
  $default = (Invoke-Git symbolic-ref --short refs/remotes/origin/HEAD) | Select-Object -First 1
  if (-not $default) { foreach ($b in 'main', 'master') { if (Invoke-Git rev-parse --verify --quiet $b) { $default = $b; break } } }
  $mb = if ($default) { (Invoke-Git merge-base HEAD $default) | Select-Object -First 1 }
  $head = (Invoke-Git rev-parse HEAD) | Select-Object -First 1
  $Base = if ($mb -and $mb -ne $head) { $mb } else { 'HEAD' }
}
$baseSha = (Invoke-Git rev-parse --short $Base) | Select-Object -First 1
if (-not $baseSha) { Write-Error "Unknown base ref '$Base'."; exit 1 }

$branch = (Invoke-Git branch --show-current) | Select-Object -First 1
if (-not $branch) { $branch = '(detached)' }
$headShort = (Invoke-Git rev-parse --short HEAD) | Select-Object -First 1
$dirty = (Invoke-Git status --porcelain).Count -gt 0

# --- File changes -------------------------------------------------------------
$changes = [System.Collections.Generic.List[object]]::new()
foreach ($line in Invoke-Git diff --name-status -M $Base) {
  $parts = $line -split "`t"
  $changes.Add([pscustomobject]@{ Status = $parts[0].Substring(0, 1); File = $parts[-1] })
}
foreach ($f in Invoke-Git ls-files --others --exclude-standard) {
  if ($f -notlike '.ai/reports/*') { $changes.Add([pscustomobject]@{ Status = '?'; File = $f }) }
}

# --- Dependency manifests -----------------------------------------------------
$manifestPattern = '(^|/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|go\.mod|Cargo\.toml|Gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?|[^/]+\.csproj|Directory\.Packages\.props|packages\.config)$'
$manifests = $changes | Where-Object { $_.File -match $manifestPattern }

# --- Known build/test commands ------------------------------------------------
$commands = [System.Collections.Generic.List[string]]::new()
if (Test-Path package.json) {
  $pm = if (Test-Path pnpm-lock.yaml) { 'pnpm' } elseif (Test-Path yarn.lock) { 'yarn' } else { 'npm run' }
  $scripts = (Get-Content package.json -Raw | ConvertFrom-Json).scripts
  if ($scripts) {
    foreach ($s in 'test', 'build', 'lint', 'typecheck', 'check') {
      if ($scripts.PSObject.Properties.Name -contains $s) { $commands.Add("``$pm $s`` → ``$($scripts.$s)``") }
    }
  }
}
if (Test-Path Makefile) {
  foreach ($t in 'test', 'build', 'lint', 'check') {
    if (Select-String -Path Makefile -Pattern "^${t}:" -Quiet) { $commands.Add("``make $t``") }
  }
}
if (Test-Path Cargo.toml) { $commands.Add('`cargo build`', '`cargo test`') }
if (Test-Path go.mod) { $commands.Add('`go build ./...`', '`go test ./...`') }
if ((Test-Path pyproject.toml) -or (Test-Path pytest.ini)) { $commands.Add('`pytest`') }
if (Get-ChildItem -Filter *.sln -ErrorAction SilentlyContinue) { $commands.Add('`dotnet build`', '`dotnet test`') }

# --- Ticket references --------------------------------------------------------
$range = "$Base..HEAD"
$commits = if ($Base -ne 'HEAD') { Invoke-Git log --format='%h %s (%an)' $range } else { @() }
$messages = if ($Base -ne 'HEAD') { (Invoke-Git log --format='%B' $range) -join "`n" } else { '' }
$refs = [regex]::Matches("$messages`n$branch", '([\w.-]+/[\w.-]+)?#\d+|\b[A-Z][A-Z0-9]+-\d+\b') |
  ForEach-Object Value | Sort-Object -Unique

# --- Output -------------------------------------------------------------------
$fence = '```'
$out = [System.Collections.Generic.List[string]]::new()
$out.Add("### Evidence$(if ($Task) { ": $Task" })")
$out.Add('')
$out.Add("- Collected: $(Get-Date -Format 'yyyy-MM-dd HH:mm') by collect-git-context.ps1")
$out.Add("- Repo: $(Split-Path $root -Leaf)")
$out.Add("- Branch: $branch")
$out.Add("- Base: $Base ($baseSha)")
$out.Add("- Head: $headShort$(if ($dirty) { ' + uncommitted changes' })")
$out.Add("- Ticket refs (commits/branch): $(if ($refs) { $refs -join ', ' } else { 'none found' })")
$out.Add('')
$out.Add("#### Commits in $range")
$out.Add('')
if ($commits) { $commits | ForEach-Object { $out.Add("- $_") } } else { $out.Add('- none (work is uncommitted, or base is HEAD)') }
$out.Add('')
$out.Add('#### Files changed vs base (A added, M modified, D deleted, R renamed, ? untracked)')
$out.Add('')
if ($changes.Count) { $changes | ForEach-Object { $out.Add("- $($_.Status) $($_.File)") } } else { $out.Add('- none') }
$out.Add('')
$out.Add('#### Diff stat (tracked files)')
$out.Add('')
$stat = Invoke-Git diff --stat $Base
$out.Add($fence)
if ($stat) { $stat | ForEach-Object { $out.Add($_) } } else { $out.Add('(no tracked changes)') }
$out.Add($fence)
$out.Add('')
$out.Add('#### Dependency manifests changed')
$out.Add('')
if ($manifests) {
  foreach ($m in $manifests) {
    $out.Add("- $($m.Status) $($m.File)")
    if ($m.Status -ne '?') {
      $out.Add('')
      $out.Add("${fence}diff")
      Invoke-Git diff -U0 $Base -- $m.File | Where-Object { $_ -match '^[+-][^+-]' } | ForEach-Object { $out.Add($_) }
      $out.Add($fence)
    }
  }
} else { $out.Add('- none') }
$out.Add('')
$out.Add('#### Git status')
$out.Add('')
$status = Invoke-Git status --short --branch
$out.Add($fence)
$status | ForEach-Object { $out.Add($_) }
$out.Add($fence)
$out.Add('')
$out.Add('#### Known build/test commands (detected, not run)')
$out.Add('')
if ($commands.Count) { $commands | ForEach-Object { $out.Add("- $_") } } else { $out.Add('- none detected') }

$out -join "`n"
