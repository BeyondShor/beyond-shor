#!/usr/bin/env python3
"""Build the self-contained ShorSight inventory page that /cbom embeds.

Produces ONE static HTML file with the scan result and the risk analysis baked in:
no server, no fetch, no external asset. It is ShorSight's own UI, reduced to the two
tabs that are worth showing on a public site — Inventory and Risk Management.

    python shorsight/build_inventory.py \
        frontend/public/cbom.json shorsight/governance.beyond-shor.json \
        -o frontend/public/shorsight/inventory.html \
        --risk-out frontend/data/governance.json

The risk part of the governance result is also written to frontend/data/governance.json:
below desktop width /cbom shows a React rendering of the same data instead of this UI,
and computing both from one run keeps them from drifting apart.

Run it with the interpreter ShorSight is installed into (pipx:
~/.local/share/pipx/venvs/shorsight/bin/python), and AFTER scripts/sign-cbom.mjs, so
the page shows exactly the bytes the ML-DSA-65 signature covers.

The page is read-only by construction: report mode activates as soon as a CBOM is
embedded, which hides the load/scan/export controls, and the governance editor is
gated on the local server being present (window.__SERVE__), which it never is here.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# the shipped UI, taken from the installed package so the page tracks the tool
try:
    from importlib import resources
    INDEX = resources.files("shorsight.inventory").joinpath("static/index.html")
    TEMPLATE = INDEX.read_text("utf-8")
except Exception as exc:                                  # noqa: BLE001
    sys.exit(f"cannot read ShorSight's UI template ({exc}); is shorsight installed?")

TABS = ("const TABS = [['inventory','Inventory'],['risk','Risk&nbsp;Management']];\n"
        "// beyond-shor.eu: Compliance / Maturity / Governance / How-to are dropped — this page\n"
        "// is a showcase of a scan result, not the working tool.\n")

# beyond-shor.eu only: the site's own fonts, and the glue for living inside the /cbom
# iframe. Standalone (opened directly) the page behaves exactly like ShorSight's UI.
EMBED = """<style>
  @font-face{font-family:'Inter';src:url(/shorsight/fonts/inter-latin-wght-normal.woff2) format('woff2');
             font-weight:100 900;font-display:swap}
  @font-face{font-family:'JetBrains Mono';src:url(/shorsight/fonts/jetbrains-mono-latin-wght-normal.woff2) format('woff2');
             font-weight:100 800;font-display:swap}
  .pill,.occ,.sinkrow .call{font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace}
  /* framed: the iframe grows with the content, so the page has nothing to scroll and
     min-height:100vh would pin the frame at its tallest height forever */
  html.embedded{overflow:hidden;scrollbar-gutter:auto}
  html.embedded body{min-height:0;background-attachment:scroll}
  /* the drawer is moved along with the parent's scroll; only the slide may animate */
  html.embedded #detail{transition:transform .2s}
  /* on a phone the frame runs edge to edge; the site's 16px gutter replaces ShorSight's 24px */
  @media(max-width:639px){html.embedded header{padding:12px 16px} html.embedded main{padding:16px}}
</style>
<script>
(function(){
  var frame=null; try{frame=window.frameElement}catch(e){}
  if(!frame) return;
  document.documentElement.classList.add('embedded');
  var host=window.parent, queued=false;

  function fit(){ frame.style.height=document.body.scrollHeight+'px'; }

  // position:fixed is relative to the iframe, which is as tall as the whole report —
  // pin the detail drawer to the slice of the frame that is actually on screen,
  // below the site's sticky header
  function pin(){
    queued=false;
    var d=document.getElementById('detail'); if(!d) return;
    var r=frame.getBoundingClientRect(), hdr=host.document.querySelector('header');
    var inset=hdr?hdr.getBoundingClientRect().bottom:0;
    var top=Math.max(0,inset-r.top), bottom=Math.min(r.height,host.innerHeight-r.top);
    d.style.top=top+'px'; d.style.height=Math.max(0,bottom-top)+'px';
  }
  function queue(){ if(!queued){ queued=true; requestAnimationFrame(pin); } }

  document.addEventListener('DOMContentLoaded',function(){
    new ResizeObserver(function(){ fit(); queue(); }).observe(document.body);
    host.addEventListener('scroll',queue,{passive:true});
    host.addEventListener('resize',queue);
    fit(); pin();
  });
})();
</script>
"""


def embed(html: str, element_id: str, payload) -> str:
    """Replace the JSON payload of one <script type=application/json> island."""
    pattern = re.compile(rf'(<script id="{element_id}" type="application/json">).*?(</script>)',
                         re.S)
    # </script> inside a string literal would end the island early
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html, n = pattern.subn(lambda m: m.group(1) + blob + m.group(2), html, count=1)
    if n != 1:
        sys.exit(f"could not find the '{element_id}' island in the template")
    return html


def source_labels(cbom: dict) -> set[str]:
    """The asset keys `shorsight govern` matches against: the provenance labels."""
    labels = set()
    for prop in cbom.get("metadata", {}).get("properties", []):
        if prop.get("name") == "crypto:provenance":
            labels.add(json.loads(prop["value"]).get("label"))
    return labels


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cbom", type=Path, nargs="?", default=ROOT / "frontend/public/cbom.json")
    ap.add_argument("governance", type=Path, nargs="?",
                    default=ROOT / "shorsight/governance.beyond-shor.json",
                    help="governance.json — the human risk input (owner, security "
                         "objectives, economic damage, treatments)")
    ap.add_argument("-o", "--output", type=Path,
                    default=ROOT / "frontend/public/shorsight/inventory.html")
    ap.add_argument("--risk-out", type=Path, default=ROOT / "frontend/data/governance.json",
                    help="where the risk analysis for the small-screen rendering goes")
    ap.add_argument("--title", default="Crypto Inventory — beyond-shor.eu")
    args = ap.parse_args()

    cbom = json.loads(args.cbom.read_text("utf-8"))
    html = TEMPLATE

    # 1) two tabs instead of six
    html, n = re.subn(r"const TABS = \[.*?\];\n", TABS, html, count=1, flags=re.S)
    if n != 1:
        sys.exit("could not find the TABS declaration in the template")
    # 'howto' is in ALWAYS_TABS, which would re-add the tab that was just removed
    html, n = re.subn(r"const ALWAYS_TABS = new Set\(\[[^\]]*\]\);",
                      "const ALWAYS_TABS = new Set(['inventory']);", html, count=1)
    if n != 1:
        sys.exit("could not find ALWAYS_TABS in the template")

    # 2) the data. Governance is computed here, not in the browser: the page ships the
    #    verdicts, so it needs neither the engine nor a server.
    html = embed(html, "cbom-data", cbom)
    if args.governance:
        from shorsight.governance import GovernanceConfig, run   # noqa: PLC0415
        raw = json.loads(args.governance.read_text("utf-8"))
        # a key that matches no source is dropped by `govern` without a word, and every
        # impact silently falls back to 'provisional' — refuse instead
        unknown = set(raw.get("assets", {})) - source_labels(cbom)
        if unknown:
            sys.exit(f"governance asset key(s) {sorted(unknown)} match no source in the CBOM "
                     f"(known: {sorted(source_labels(cbom))}) — use the label without "
                     "the '(local)' kind suffix")
        cfg = GovernanceConfig.from_dict(raw)
        result = run(cbom, cfg).to_dict()
        html = embed(html, "governance-data", result)
        html = embed(html, "governance-config", raw)
        args.risk_out.write_text(json.dumps({"risk": result["risk"]}, ensure_ascii=False,
                                            indent=2) + "\n", encoding="utf-8")
        print(f"wrote {args.risk_out}")

    html = re.sub(r"<title>.*?</title>", f"<title>{args.title}</title>", html, count=1, flags=re.S)
    html = html.replace("</head>", EMBED + "</head>", 1)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html, encoding="utf-8")
    kb = len(html.encode()) / 1024
    print(f"wrote {args.output} ({kb:.0f} KiB, self-contained)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
