#!/usr/bin/env python3
"""Upstream fidelity check for pi-pstack.

Pairs every upstream pstack markdown file with its port, splits both into
sentences, and classifies each upstream sentence:
  kept      best match in the port >= KEEP
  reworded  best match >= REWORD
  dropped   anything lower
Dropped/reworded sentences that mention Cursor-only things are "expected
substitutions"; everything else is a fidelity loss to review.

Usage:
  python3 upstream-fidelity.py [PKG_ROOT] [--out report.md] [--json out.json]
                               [--keep 0.85] [--reword 0.55] [--only playbooks]
PKG_ROOT defaults to cwd; expects PKG_ROOT/upstream/pstack and PKG_ROOT/{skills,agents}.
Exit code 1 if any flagged file is not listed in --allow (one relative path per line,
'#' comments allowed; use it for documented substitutes), or if overall kept < --min-overall.
"""
import argparse, difflib, json, os, re, sys

CURSOR_RE = re.compile(r"""(?ix)
  cursor | \bgrok\b | composer | \bTask\s+tool | \bTask\(| subagent_type |
  cursor-team-kit | /deslop | \.cursor/ | bugbot | \bbenny\b | automations? |
  custom\s+mode | plan\s+mode | \bask\s+mode | background\s+agent | \bMCP\b |
  gpt-5 | claude-[0-9] | opus | sonnet | xhigh | -fast\b | \bslack\b | linear\.app
""")

def sentences(text):
    text = re.sub(r"```.*?```", " ", text, flags=re.S)          # drop code blocks
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)     # drop front matter
    out = []
    for line in text.splitlines():
        line = re.sub(r"^\s*(#+|[-*+]|\d+[.)])\s*", "", line)   # headings, bullets, numbers
        line = re.sub(r"[*_`]", "", line)
        line = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", line)    # links -> text
        for s in re.split(r"(?<=[.!?:;])\s+", line):
            s = re.sub(r"\s+", " ", s).strip()
            if len(s) >= 25:
                out.append(s)
    return out

def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower())

def best(s, cands):
    n = norm(s); b = 0.0
    sm = difflib.SequenceMatcher(None, n, "", autojunk=False)
    for c in cands:
        if abs(len(c) - len(n)) > max(len(n), 40):
            continue
        sm.set_seq2(c)
        if sm.real_quick_ratio() <= b or sm.quick_ratio() <= b:
            continue
        r = sm.ratio()
        if r > b:
            b = r
            if b >= 0.99: break
    return b

def pair_files(root):
    up = os.path.join(root, "upstream", "pstack")
    pairs = []
    for d, _, fs in os.walk(up):
        for f in fs:
            if not f.endswith(".md"): continue
            u = os.path.join(d, f); rel = os.path.relpath(u, up)
            if not rel.startswith(("skills/", "agents/")): continue
            p = os.path.join(root, rel)
            pairs.append((rel, u, p if os.path.exists(p) else None))
    return sorted(pairs)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default=".")
    ap.add_argument("--out"); ap.add_argument("--json")
    ap.add_argument("--keep", type=float, default=0.85)
    ap.add_argument("--reword", type=float, default=0.55)
    ap.add_argument("--only", help="substring filter on relative path")
    ap.add_argument("--flag-kept", type=float, default=0.70, help="flag if kept share below this")
    ap.add_argument("--flag-lost", type=int, default=3, help="flag if non-Cursor dropped sentences exceed this")
    ap.add_argument("--min-overall", type=float, default=0.0, help="fail if overall kept share below this (e.g. 0.85)")
    ap.add_argument("--allow", help="file of relative paths allowed to be flagged (documented substitutes)")
    a = ap.parse_args()
    allow = set()
    if a.allow and os.path.exists(a.allow):
        for ln in open(a.allow, encoding="utf-8"):
            ln = ln.split("#", 1)[0].strip()
            if ln: allow.add(ln)

    results = []
    for rel, u, p in pair_files(a.root):
        if a.only and a.only not in rel: continue
        us = sentences(open(u, encoding="utf-8").read())
        if not us: continue
        if p is None:
            results.append(dict(file=rel, missing=True, upstream=len(us), kept=0, reworded=0,
                                dropped=len(us), lost=[s for s in us if not CURSOR_RE.search(s)],
                                subst=sum(1 for s in us if CURSOR_RE.search(s)), added=0, flagged=True))
            continue
        ps = sentences(open(p, encoding="utf-8").read())
        pn = [norm(s) for s in ps]
        kept = rew = 0; lost = []; reworded = []; subst = 0
        for s in us:
            r = best(s, pn)
            if r >= a.keep: kept += 1; continue
            if CURSOR_RE.search(s): subst += 1; continue
            if r >= a.reword: rew += 1; reworded.append((round(r, 2), s))
            else: lost.append(s)
        un = [norm(s) for s in us]
        added = sum(1 for s in ps if best(s, un) < a.reword)
        nonsub = len(us) - subst
        kept_share = kept / nonsub if nonsub else 1.0
        flagged = kept_share < a.flag_kept or len(lost) > a.flag_lost
        results.append(dict(file=rel, missing=False, upstream=len(us), kept=kept, reworded=rew,
                            dropped=len(lost), subst=subst, added=added, kept_share=round(kept_share, 3),
                            lost=lost, reworded_list=reworded, flagged=flagged))

    tot_u = sum(r["upstream"] - r["subst"] for r in results)
    tot_k = sum(r["kept"] for r in results)
    lines = ["# pi-pstack upstream fidelity", "",
             f"Files: {len(results)}  flagged: {sum(r['flagged'] for r in results)}  "
             f"overall kept (excluding Cursor substitutions): {tot_k}/{tot_u} = {tot_k/max(tot_u,1):.0%}", "",
             f"Thresholds: kept >= {a.keep}, reworded >= {a.reword}; flag if kept < {a.flag_kept:.0%} or lost > {a.flag_lost}", "",
             "| File | Upstream | Kept | Reworded | Lost | Cursor subst | Port-only | Kept % | Flag |",
             "|---|---|---|---|---|---|---|---|---|"]
    order = sorted(results, key=lambda r: (not r["flagged"], r.get("kept_share", 0)))
    for r in order:
        ks = "MISSING" if r["missing"] else f"{r['kept_share']:.0%}"
        lines.append(f"| {r['file']} | {r['upstream']} | {r['kept']} | {r['reworded']} | {r['dropped']} | "
                     f"{r['subst']} | {r['added']} | {ks} | {'!' if r['flagged'] else ''} |")
    lines += ["", "## Lost upstream sentences (not Cursor-specific)", ""]
    for r in order:
        if not r["lost"]: continue
        lines.append(f"### {r['file']}" + (" (port file missing)" if r["missing"] else ""))
        lines += [f"- {s}" for s in r["lost"]]
        lines.append("")
    rep = "\n".join(lines)
    if a.out: open(a.out, "w", encoding="utf-8").write(rep)
    else: print(rep)
    if a.json: json.dump(results, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    overall = tot_k / max(tot_u, 1)
    bad = [r["file"] for r in results if r["flagged"] and r["file"] not in allow]
    if bad: print("FAIL flagged (not allowlisted): " + ", ".join(bad), file=sys.stderr)
    if overall < a.min_overall: print(f"FAIL overall {overall:.1%} < {a.min_overall:.0%}", file=sys.stderr)
    sys.exit(1 if bad or overall < a.min_overall else 0)

if __name__ == "__main__":
    main()
