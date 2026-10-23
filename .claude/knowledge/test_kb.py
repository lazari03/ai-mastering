"""Guards of the shared-knowledge CLI. Run: python3 .claude/knowledge/test_kb.py

Each test runs kb.py against a scratch copy of the knowledge base, so the
real files are never touched."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


class KbGuards(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        kb_dir = self.root / ".claude" / "knowledge"
        shutil.copytree(HERE, kb_dir, ignore=shutil.ignore_patterns("__pycache__", "test_kb.py"))
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        (self.root / "real.py").write_text("x = 1\n")
        self.kb = kb_dir / "kb.py"
        self.issue = self.kb_ok("issue-add", "--domain", "QA", "--title", "t", "--component", "c", "--severity", "P3", "--owner", "o").strip()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def run_kb(self, *args):
        return subprocess.run([sys.executable, str(self.kb), *args], cwd=self.root, capture_output=True, text=True, env={"KB_AGENT": "test", "PATH": "/usr/bin:/bin"})

    def kb_ok(self, *args):
        r = self.run_kb(*args)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout

    def refused(self, *args):
        self.assertNotEqual(self.run_kb(*args).returncode, 0, f"accepted: {args}")

    def test_terminal_status_only_through_resolve(self):
        for status in ("DONE", "done", " DONE", "DONE ", "DONE.", "Resolved.", "ＤＯＮＥ", "FIXED", "COMPLETE", "WONTFIX", "VERIFIED", "CLOSED"):
            self.refused("issue-update", self.issue, "--agent", "a", "--status", status)
            self.refused("issue-add", "--domain", "QA", "--title", "t", "--component", "c", "--severity", "P3", "--owner", "o", "--status", status)
        self.kb_ok("issue-update", self.issue, "--agent", "a", "--status", "READY_FOR_QA")

    def test_resolve_requires_approved_audit_and_qa(self):
        base = ["issue-resolve", self.issue, "--agent", "a", "--solution", "s", "--commit", "c", "--tests", "t"]
        self.refused(*base)
        self.refused(*base, "--qa", "APPROVED", "--audit", "REJECTED")
        self.refused(*base, "--qa", "nope", "--audit", "APPROVED")
        self.kb_ok(*base, "--qa", "APPROVED", "--audit", "APPROVED H-1")
        resolved = json.loads((self.kb.parent / "RESOLVED_ISSUES.json").read_text())["issues"]
        self.assertEqual(resolved[-1]["id"], self.issue)

    def test_set_cannot_touch_protected_or_shadow_fields(self):
        for kv in ("status=DONE", "Status=DONE", " status=DONE", "history=[]", "id=X", "audit_verdict=APPROVED", "qa_verdict=APPROVED", "Owner=x", "bad key=1"):
            self.refused("issue-update", self.issue, "--agent", "a", "--set", kv)
        self.kb_ok("issue-update", self.issue, "--agent", "a", "--set", "owner=someone")

    def test_handoff_files_must_be_real_repo_relative_paths(self):
        common = ["handoff-add", "--task", self.issue, "--agent", "a", "--status", "INFO", "--summary", "s", "--next", "n", "--files"]
        for f in ("/etc/passwd", "../x", "deleted:../x", "deleted:/etc/passwd", "missing.py"):
            self.refused(*common, f)
        self.kb_ok(*common, "real.py,deleted:gone.py,(embargoed)")

    def test_ids_never_collide(self):
        second = self.kb_ok("issue-add", "--domain", "QA", "--title", "t2", "--component", "c", "--severity", "P3", "--owner", "o").strip()
        ids = [i["id"] for f in ("KNOWN_ISSUES.json", "RESOLVED_ISSUES.json") for i in json.loads((self.kb.parent / f).read_text())["issues"]]
        self.assertNotEqual(self.issue, second)
        self.assertEqual(len(ids), len(set(ids)))


if __name__ == "__main__":
    unittest.main()
