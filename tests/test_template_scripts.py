"""Tests for the template's helper scripts in scripts/.

Run: python -m unittest discover -s tests
"""
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# -X warn_default_encoding + -W error::EncodingWarning turns every open() that
# relies on the locale's default encoding into a hard error, on ANY OS. That
# reproduces the Windows/GBK crash on macOS/Linux CI without a Windows box.
# (-X utf8=0 keeps the check honest when PYTHONUTF8=1 is set in the shell.)
STRICT_ENCODING = ["-X", "utf8=0", "-X", "warn_default_encoding", "-W", "error::EncodingWarning"]


class RegressionTests(unittest.TestCase):
    """Regression: registry readers crashed on Windows with a non-UTF-8 locale.

    Bug: docs/inbox/agent-sessions.json holds UTF-8 text (em-dashes, arrows),
    but groups-lookup.py and registry_lib.py opened it with the locale default.
    On a Chinese-locale Windows 11 machine (cp936/GBK, Python 3.13) `just gate`
    died with: UnicodeDecodeError: 'gbk' codec can't decode byte 0x92 in
    position 32 — the 3rd byte of the UTF-8 arrow "→" (E2 86 92).
    Fix: pass encoding="utf-8" to both opens (upstream issue #3).
    """

    def _run(self, code_or_args):
        return subprocess.run(
            [sys.executable, *STRICT_ENCODING, *code_or_args],
            cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8",
        )

    def test_groups_lookup_validate_reads_registry_as_utf8(self):
        # The exact command `just gate` runs.
        result = self._run(["scripts/groups-lookup.py", "--validate"])
        self.assertNotIn("EncodingWarning", result.stderr)
        self.assertNotIn("UnicodeDecodeError", result.stderr)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_registry_lib_load_config_reads_registry_as_utf8(self):
        # registry_lib backs blame.py and refresh-terminals.py.
        result = self._run([
            "-c",
            "import sys; sys.path.insert(0, 'scripts'); "
            "import registry_lib; registry_lib.load_config()",
        ])
        self.assertNotIn("EncodingWarning", result.stderr)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
