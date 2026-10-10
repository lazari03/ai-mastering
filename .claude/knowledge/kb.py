#!/usr/bin/env python3
"""Auralith shared-knowledge CLI (stdlib only).

Focused retrieval and structured, append-only updates for the agent team, so
no agent has to load whole knowledge files or rewrite them.

  kb.py component <id>                      component + open issues + recent handoffs + staleness
  kb.py issues [--component C] [--status S] [--grep W] [--all]
  kb.py issue <id>                          one issue (open or resolved), full record
  kb.py issue-add --domain D --title T --component C --severity P --owner A [--repro R] [--evidence E] [--tests a,b] [--root-cause X] [--status S]
  kb.py issue-update <id> --agent A [--status S] [--note N] [--set key=value ...]
  kb.py issue-resolve <id> --agent A --solution S --commit C --tests a,b [--qa V] [--audit V]
  kb.py handoff-add --task T --agent A --status S --summary X --next N [--files a,b] [--tests a,b] [--results a,b] [--risks a,b] [--evidence path]
  kb.py handoffs [--to A] [--task T] [--last N]
  kb.py stale                               components/knowledge whose sources changed since validated_commit
  kb.py codehash                            hash of the effective DSP code + pinned deps (QA cache key)
  kb.py baseline [--case ID]                latest QA baseline records
  kb.py access-log [--clear]                retrieval log (what each agent queried)

Every call is appended to test-results/runs/kb_access.log (git-ignored) with
the caller from $KB_AGENT, which is how retrieval is measured.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path

KB = Path(__file__).resolve().parent
ROOT = KB.parents[1]
LOG = ROOT / "test-results" / "runs" / "kb_access.log"

# What "effective processing code" means for cache invalidation of audio results.
DSP_HASH_GLOBS = [
    "backend/ai_mastering/**/*.py", "backend/params.py", "backend/adaptive_mastering.py",
    "backend/mixing_presets.json", "backend/app/**/*.py", "backend/benchmark/metrics.py",
    "backend/benchmark/qa_corpus.py", "backend/tests/synthetic.py", "backend/requirements-test.txt",
]


def _load(name: str) -> dict:
    return json.loads((KB / name).read_text())


def _save(name: str, data: dict) -> None:
    tmp = KB / f".{name}.tmp"
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(KB / name)


def _today() -> str:
    return dt.date.today().isoformat()


def _git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


def _head() -> str:
    return _git("rev-parse", "--short", "HEAD") or "unknown"


def _csv(v: str | None) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()] if v else []


def _log(argv: list[str]) -> None:
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a") as f:
            f.write(json.dumps({"ts": dt.datetime.now().isoformat(timespec="seconds"), "agent": os.environ.get("KB_AGENT", "unknown"), "cmd": argv}) + "\n")
    except OSError:
        pass


def _print(obj) -> None:
    print(json.dumps(obj, indent=1, ensure_ascii=False))


# ---- issues -----------------------------------------------------------------

def _find_issue(issue_id: str) -> tuple[str, dict, dict] | None:
    for name in ("KNOWN_ISSUES.json", "RESOLVED_ISSUES.json"):
        data = _load(name)
        for it in data["issues"]:
            if it["id"] == issue_id:
                return name, data, it
    return None


def cmd_issues(a) -> None:
    data = _load("KNOWN_ISSUES.json")["issues"]
    if a.all:
        data = data + _load("RESOLVED_ISSUES.json")["issues"]
    out = []
    for it in data:
        if a.component and not it.get("component", "").startswith(a.component):
            continue
        if a.status and it.get("status") != a.status:
            continue
        if a.grep and a.grep.lower() not in json.dumps(it).lower():
            continue
        out.append({k: it.get(k) for k in ("id", "severity", "status", "component", "owner", "title")})
    _print(out)


def cmd_issue(a) -> None:
    hit = _find_issue(a.id)
    if not hit:
        sys.exit(f"no issue {a.id}")
    _print({"file": hit[0], **hit[2]})


def cmd_issue_add(a) -> None:
    data = _load("KNOWN_ISSUES.json")
    dom = a.domain.upper()
    n = data["next_ids"].get(dom, 1)
    issue_id = f"AURALITH-{dom}-{n:03d}"
    data["next_ids"][dom] = n + 1
    data["issues"].append({
        "id": issue_id, "title": a.title, "component": a.component, "severity": a.severity,
        "status": a.status, "owner": a.owner, "root_cause": a.root_cause, "repro": a.repro,
        "evidence": a.evidence, "tests": _csv(a.tests), "source": a.evidence or "",
        "validated_commit": _head(),
        "history": [{"date": _today(), "agent": os.environ.get("KB_AGENT", a.owner), "note": f"Created ({a.status})."}],
    })
    _save("KNOWN_ISSUES.json", data)
    print(issue_id)


def cmd_issue_update(a) -> None:
    data = _load("KNOWN_ISSUES.json")
    it = next((i for i in data["issues"] if i["id"] == a.id), None)
    if not it:
        sys.exit(f"{a.id} is not open (resolved issues are append-only)")
    if a.status:
        it["status"] = a.status
    for kv in a.set or []:
        k, _, v = kv.partition("=")
        it[k] = v
    it["validated_commit"] = _head()
    it["history"].append({"date": _today(), "agent": a.agent, "status": it["status"], "note": a.note or ""})
    _save("KNOWN_ISSUES.json", data)
    print(f"{a.id} -> {it['status']}")


def cmd_issue_resolve(a) -> None:
    known = _load("KNOWN_ISSUES.json")
    it = next((i for i in known["issues"] if i["id"] == a.id), None)
    if not it:
        sys.exit(f"{a.id} is not open")
    if not (a.qa and a.audit):
        sys.exit("Definition of Done: --qa and --audit verdicts are both required to resolve")
    known["issues"].remove(it)
    it.update({"status": "DONE", "solution": a.solution, "fix_commit": a.commit, "regression_tests": _csv(a.tests),
               "qa_verdict": a.qa, "audit_verdict": a.audit, "resolved_date": _today()})
    it["history"].append({"date": _today(), "agent": a.agent, "status": "DONE", "note": "Resolved."})
    resolved = _load("RESOLVED_ISSUES.json")
    resolved["issues"].append(it)
    _save("RESOLVED_ISSUES.json", resolved)
    _save("KNOWN_ISSUES.json", known)
    print(f"{a.id} resolved")


# ---- handoffs ---------------------------------------------------------------

def cmd_handoff_add(a) -> None:
    if len(a.summary) > 300:
        sys.exit("summary must be <= 300 chars; put detail in an --evidence file")
    data = _load("AGENT_HANDOFFS.json")
    hid = f"H-{len(data['handoffs']) + 1:04d}"
    data["handoffs"].append({
        "handoff_id": hid, "task_id": a.task, "agent": a.agent, "status": a.status, "summary": a.summary,
        "files_changed": _csv(a.files), "tests_executed": _csv(a.tests), "results": _csv(a.results),
        "risks": _csv(a.risks), "evidence": a.evidence, "next_agent": a.next, "commit": _head(),
        "date": dt.datetime.now().isoformat(timespec="seconds"),
    })
    _save("AGENT_HANDOFFS.json", data)
    print(hid)


def cmd_handoffs(a) -> None:
    hs = _load("AGENT_HANDOFFS.json")["handoffs"]
    if a.to:
        hs = [h for h in hs if h.get("next_agent") == a.to]
    if a.task:
        hs = [h for h in hs if h.get("task_id") == a.task]
    _print(hs[-a.last:])


# ---- components / staleness -------------------------------------------------

def _changed_since(commit: str, patterns: list[str]) -> list[str]:
    changed = set(_git("diff", "--name-only", commit, "--").splitlines())  # commit..worktree
    changed |= set(_git("ls-files", "--others", "--exclude-standard").splitlines())
    return sorted(p for p in changed if any(fnmatch(p, pat) or p == pat for pat in patterns))


def cmd_component(a) -> None:
    comps = _load("COMPONENTS.json")
    c = comps["components"].get(a.id)
    if not c:
        sys.exit(f"unknown component {a.id}; known: {', '.join(comps['components'])}")
    since = comps.get("validated_commit", "HEAD")
    issues = [{k: i.get(k) for k in ("id", "severity", "status", "title")} for i in _load("KNOWN_ISSUES.json")["issues"] if i.get("component") == a.id]
    hand = [h for h in _load("AGENT_HANDOFFS.json")["handoffs"] if any(i["id"] == h["task_id"] for i in issues)][-3:]
    _print({"id": a.id, **c, "open_issues": issues, "recent_handoffs": hand,
            "changed_since_validated": _changed_since(since, c.get("paths", []))})


def cmd_stale(_a) -> None:
    comps = _load("COMPONENTS.json")
    since = comps.get("validated_commit", "HEAD")
    out = {}
    for cid, c in comps["components"].items():
        ch = _changed_since(since, c.get("paths", []))
        if ch:
            out[cid] = ch
    _print({"validated_commit": since, "head": _head(), "stale_components": out})


def codehash() -> str:
    h = hashlib.sha256()
    files = sorted({p for g in DSP_HASH_GLOBS for p in ROOT.glob(g) if p.is_file()})
    for p in files:
        h.update(str(p.relative_to(ROOT)).encode())
        h.update(p.read_bytes())
    return h.hexdigest()[:16]


def cmd_codehash(_a) -> None:
    print(codehash())


def cmd_baseline(a) -> None:
    data = _load("TEST_BASELINES.json")
    if a.case:
        run = data.get("api_qa", {})
        _print({"run": {k: v for k, v in run.items() if k != "cases"}, "case": run.get("cases", {}).get(a.case)})
    else:
        _print({k: ({kk: vv for kk, vv in v.items() if kk != "cases"} if isinstance(v, dict) else v) for k, v in data.items()})


def cmd_access_log(a) -> None:
    if a.clear:
        LOG.unlink(missing_ok=True)
        print("cleared")
    elif LOG.exists():
        print(LOG.read_text(), end="")


def main(argv: list[str]) -> None:
    p = argparse.ArgumentParser(prog="kb.py")
    sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("component"); s.add_argument("id"); s.set_defaults(f=cmd_component)
    s = sp.add_parser("issues"); s.add_argument("--component"); s.add_argument("--status"); s.add_argument("--grep"); s.add_argument("--all", action="store_true"); s.set_defaults(f=cmd_issues)
    s = sp.add_parser("issue"); s.add_argument("id"); s.set_defaults(f=cmd_issue)
    s = sp.add_parser("issue-add")
    for k in ("--domain", "--title", "--component", "--severity", "--owner"):
        s.add_argument(k, required=True)
    for k in ("--repro", "--evidence", "--tests", "--root-cause"):
        s.add_argument(k)
    s.add_argument("--status", default="OPEN"); s.set_defaults(f=cmd_issue_add)
    s = sp.add_parser("issue-update"); s.add_argument("id"); s.add_argument("--agent", required=True); s.add_argument("--status"); s.add_argument("--note"); s.add_argument("--set", nargs="*"); s.set_defaults(f=cmd_issue_update)
    s = sp.add_parser("issue-resolve"); s.add_argument("id")
    for k in ("--agent", "--solution", "--commit", "--tests"):
        s.add_argument(k, required=True)
    s.add_argument("--qa"); s.add_argument("--audit"); s.set_defaults(f=cmd_issue_resolve)
    s = sp.add_parser("handoff-add")
    for k in ("--task", "--agent", "--status", "--summary", "--next"):
        s.add_argument(k, required=True)
    for k in ("--files", "--tests", "--results", "--risks", "--evidence"):
        s.add_argument(k)
    s.set_defaults(f=cmd_handoff_add)
    s = sp.add_parser("handoffs"); s.add_argument("--to"); s.add_argument("--task"); s.add_argument("--last", type=int, default=10); s.set_defaults(f=cmd_handoffs)
    s = sp.add_parser("stale"); s.set_defaults(f=cmd_stale)
    s = sp.add_parser("codehash"); s.set_defaults(f=cmd_codehash)
    s = sp.add_parser("baseline"); s.add_argument("--case"); s.set_defaults(f=cmd_baseline)
    s = sp.add_parser("access-log"); s.add_argument("--clear", action="store_true"); s.set_defaults(f=cmd_access_log)
    a = p.parse_args(argv)
    if a.cmd != "access-log":
        _log(argv)
    a.f(a)


if __name__ == "__main__":
    main(sys.argv[1:])
