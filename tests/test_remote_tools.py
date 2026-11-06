import importlib.util
import unittest
from pathlib import Path


SERVER_PATH = Path(__file__).parents[1] / "dashboard" / "server.py"
SPEC = importlib.util.spec_from_file_location("macaudit_dashboard", SERVER_PATH)
SERVER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(SERVER)


class NizloRemoteToolTests(unittest.TestCase):
    def test_matches_published_agent_and_remote_client_paths(self):
        samples = (
            "/Library/PrivilegedHelperTools/com.nizlo.agent/Nizlo.Agent.Mac --workspace example",
            "/Applications/NizloRemote.app/Contents/MacOS/NizloRemote --config example",
        )
        for sample in samples:
            with self.subTest(sample=sample):
                self.assertTrue(
                    any(SERVER.re.search(pattern, sample, SERVER.re.IGNORECASE)
                        for pattern in SERVER.REMOTE_TOOLS["Nizlo"])
                )

    def test_does_not_match_unrelated_nizlo_text(self):
        sample = "/usr/bin/curl https://nizlo.com/"
        self.assertFalse(
            any(SERVER.re.search(pattern, sample, SERVER.re.IGNORECASE)
                for pattern in SERVER.REMOTE_TOOLS["Nizlo"])
        )

    def test_remote_app_is_classified_as_security_remote(self):
        self.assertEqual(
            SERVER.application_role(
                "NizloRemote",
                "/Applications/NizloRemote.app",
                "root",
            ),
            "security_remote",
        )


if __name__ == "__main__":
    unittest.main()
