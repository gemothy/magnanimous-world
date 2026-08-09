<#
    serve.ps1 -- static server for gone-away, plus a frame sink

    There is no node and no python on this machine, so the usual
    `python3 -m http.server` from HANDOFF.md is not available. HttpListener ships
    with .NET, so this is the one way to get a real http origin here. The
    "localhost" prefix specifically is allowed to non-elevated users; "+" or "*"
    would need a netsh urlacl reservation and an admin shell.

    Serving over http matters for more than tidiness: on file:// the library
    fetch fails and the build silently drops to the generative audio loop.

    POST /__shot?name=foo writes the request body to renders/foo.png. That exists
    because getting a rendered frame back out of the browser is otherwise
    surprisingly hard here -- the preview pane never composites (so screenshots
    time out) and Chrome only permits one automatic download per origin before it
    starts asking a question nothing can answer. A POST has neither limit.

    Usage:
        powershell -File scripts/serve.ps1            # foreground
        powershell -File scripts/serve.ps1 -Port 8791
#>
param(
    [int]$Port = 8791,
    [string]$Root = "$PSScriptRoot\.."
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path
# The soundtrack lives in the sibling tiki-lounge project and is reached through a git
# symlink, so requests legitimately resolve outside gone-away. Containment is checked
# against the repository instead.
$RepoRoot = (Resolve-Path (Join-Path $Root '..')).Path
$renders = Join-Path $Root 'renders'
New-Item -ItemType Directory -Force $renders | Out-Null

<#
    Follow git symlinks that were checked out as plain files.

    This clone has core.symlinks=false, which is the Windows default without developer
    mode. Git records gone-away/audio/beach-noir with mode 120000, but on checkout it
    lands as a 41-byte *text file* whose content is the target path
    ("../../tiki-lounge/public/audio/beach-noir") rather than as a directory.

    So every one of the 65 tracks 404s locally, the fetch fails, and the build drops to
    the generative fallback loop — which sounds plausible enough that it reads as a
    design decision rather than a broken checkout. Resolving the stand-in here makes the
    real soundtrack play without touching the repo or needing elevated symlink rights.
#>
function Resolve-LinkPath([string]$base, [string]$rel) {
    $parts = @($rel -split '[\\/]+' | Where-Object { $_ -ne '' })
    $cur = $base
    for ($i = 0; $i -lt $parts.Count; $i++) {
        $next = Join-Path $cur $parts[$i]
        # Only a non-final segment that is a file can be a link standing in for a folder.
        if ($i -lt $parts.Count - 1 -and (Test-Path $next -PathType Leaf)) {
            $item = Get-Item $next -Force
            if ($item.Length -gt 0 -and $item.Length -lt 1024) {
                $txt = ([System.IO.File]::ReadAllText($next)).Trim()
                if ($txt -notmatch '[\r\n]' -and $txt -match '[/\\]') {
                    $cand = Join-Path (Split-Path $next -Parent) $txt
                    if (Test-Path $cand) { $cur = (Resolve-Path $cand).Path; continue }
                }
            }
        }
        $cur = $next
    }
    return $cur
}

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.mp3'  = 'audio/mpeg'
    '.m4a'  = 'audio/mp4'      # the Beach Noir Revue ships as m4a
    '.ogg'  = 'audio/ogg'
    '.svg'  = 'image/svg+xml'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "serving $Root at http://localhost:$Port/  (ctrl-c to stop)"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    try {
        if ($req.HttpMethod -eq 'POST' -and $req.Url.AbsolutePath -eq '/__shot') {
            # Frame sink. The name is used to build a path, so allow only a plain
            # slug -- anything with a separator or a dot could escape renders/.
            $name = $req.QueryString['name']
            if ([string]::IsNullOrWhiteSpace($name)) { $name = 'frame' }
            $name = ($name -replace '[^A-Za-z0-9_.-]', '_') -replace '\.\.', '_'

            $ms = New-Object System.IO.MemoryStream
            $req.InputStream.CopyTo($ms)
            $bytes = $ms.ToArray()
            $ms.Dispose()

            $dest = Join-Path $renders "$name.png"
            [System.IO.File]::WriteAllBytes($dest, $bytes)
            Write-Output "shot: $name.png  ($($bytes.Length) bytes)"

            # The page fetches this cross-nothing, but be explicit anyway so a
            # future file:// or differently-ported client still works.
            $res.AddHeader('Access-Control-Allow-Origin', '*')
            $res.StatusCode = 200
            $out = [System.Text.Encoding]::UTF8.GetBytes("ok $($bytes.Length)")
            $res.ContentType = 'text/plain'
            # ContentLength64 is not optional: HttpListener defaults it to 0 and then
            # refuses the write as overrunning the declared length.
            $res.ContentLength64 = $out.Length
            $res.OutputStream.Write($out, 0, $out.Length)
            $res.Close()
            continue
        }

        $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
        if ($rel -eq '') { $rel = 'index.html' }

        # Keep requests inside the repository regardless of what ../ the client sends.
        # The bound is the repo rather than gone-away because the audio symlink points at
        # the sibling tiki-lounge project; it is still checked, just one level wider.
        $full = [System.IO.Path]::GetFullPath((Resolve-LinkPath $Root $rel))
        if (-not $full.StartsWith($RepoRoot, [StringComparison]::OrdinalIgnoreCase)) {
            $res.StatusCode = 403; $res.Close(); continue
        }

        if (-not (Test-Path $full -PathType Leaf)) {
            $res.StatusCode = 404
            $out = [System.Text.Encoding]::UTF8.GetBytes("404 $rel")
            $res.ContentLength64 = $out.Length
            $res.OutputStream.Write($out, 0, $out.Length)
            $res.Close(); continue
        }

        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] }
        else { $res.ContentType = 'application/octet-stream' }

        # Every request is a fresh read. The whole review loop is edit-reload-look,
        # and a cached index.html would show the previous iteration's image while
        # reporting success -- the exact failure mode this loop exists to catch.
        $res.AddHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

        $bytes = [System.IO.File]::ReadAllBytes($full)
        $res.ContentLength64 = $bytes.Length
        # A HEAD response carries the headers and nothing else; writing a body to one
        # throws "bytes exceed the Content-Length". Preview harnesses probe with HEAD
        # to see whether the port is up, so this is hit on every start.
        if ($req.HttpMethod -ne 'HEAD') {
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $res.Close()
    }
    catch {
        Write-Output "error: $($_.Exception.Message)"
        try { $res.StatusCode = 500; $res.Close() } catch { }
    }
}
