from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_COMPETITION = ROOT / "scripts" / "competition"
if str(SCRIPTS_COMPETITION) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_COMPETITION))

CLI_SPEC = importlib.util.spec_from_file_location(
    "competition_cli",
    SCRIPTS_COMPETITION / "competition_cli.py",
)
if CLI_SPEC is None or CLI_SPEC.loader is None:
    raise RuntimeError("failed to load competition_cli module")
cli = importlib.util.module_from_spec(CLI_SPEC)
CLI_SPEC.loader.exec_module(cli)


FIXTURES_DIR = ROOT / "tests" / "fixtures" / "competition"


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def build_valid_manifest() -> dict:
    return {
        "run_id": "contract-test-run",
        "model": "claude-opus-4-6",
        "monitoring_mode": "passive-monitoring",
        "execution_mode": "mock-first",
        "lanes": ["control", "writer-a", "writer-b", "writer-c", "verifier"],
        "freeze_windows": {
            "feature_freeze": "T+225m",
            "integration_freeze": "T+255m",
            "evidence_only": "T+285m",
        },
        "allowed_operator_actions": ["launch-before-t0", "observe-status"],
        "evidence_root": ".sisyphus/evidence",
        "failure_taxonomy": [
            "lane-local",
            "shared-integration",
            "environment",
            "control-plane",
        ],
    }


def seed_minimal_run_dir(run_dir: Path) -> None:
    (run_dir / "interfaces").mkdir(parents=True, exist_ok=True)
    (run_dir / "lane-status").mkdir(parents=True, exist_ok=True)
    (run_dir / "handoffs").mkdir(parents=True, exist_ok=True)
    (run_dir / "verification").mkdir(parents=True, exist_ok=True)
    (run_dir / "run-charter.md").write_text(
        "# Current Run Charter\n\n"
        "- Run type: grand-plan-control-plane\n"
        "- Execution: grand-plan task-board driven\n"
    )
    (run_dir / "incidents.log").write_text("\n")
    write_json(run_dir / "run-manifest.json", build_valid_manifest())
    write_json(
        run_dir / "task-board.json",
        {
            "tasks": [
                {
                    "id": "T1",
                    "title": "프로젝트 Scaffold",
                    "state": "queued",
                    "owner": None,
                    "dependencies": [],
                }
            ]
        },
    )


class GrandPlanBoardContractTests(unittest.TestCase):
    def test_grand_plan_task_board_generation_from_tasks_doc(self) -> None:
        board = cli.build_task_board_from_grand_plan(ROOT / "docs" / "TASKS.md")
        self.assertEqual(len(board["tasks"]), 30)

        task_by_id = {task["id"]: task for task in board["tasks"]}
        self.assertIn("T1", task_by_id)
        self.assertIn("T26", task_by_id)
        self.assertIn("F4", task_by_id)
        self.assertEqual(task_by_id["T7"]["dependencies"], ["T2", "T4"])
        self.assertEqual(task_by_id["T15"]["dependencies"], ["T11", "T12", "T13"])
        self.assertEqual(task_by_id["F2"]["dependencies"], [])
        self.assertTrue(all(task["state"] == "queued" for task in board["tasks"]))

    def test_runtime_board_migrates_legacy_setup_queue(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            board_path = Path(tmp) / "task-board.json"
            write_json(
                board_path,
                {
                    "tasks": [
                        {
                            "id": "T-001",
                            "title": "legacy setup queue",
                            "state": "queued",
                            "owner": None,
                            "dependencies": [],
                        }
                    ]
                },
            )

            board = cli.ensure_runtime_task_board(
                board_path,
                tasks_doc_path=ROOT / "docs" / "TASKS.md",
            )
            ids = [task["id"] for task in board["tasks"]]
            self.assertIn("T1", ids)
            self.assertIn("F4", ids)
            self.assertFalse(any(task_id.startswith("T-") for task_id in ids))


class TaskBoardTransitionContractTests(unittest.TestCase):
    def test_verifying_then_done_transition_is_allowed(self) -> None:
        task = {"id": "T10", "state": "in_progress", "owner": "writer-a"}
        cli.transition_task(task, "verifying")
        self.assertEqual(task["state"], "verifying")
        cli.transition_task(task, "done")
        self.assertEqual(task["state"], "done")

    def test_in_progress_to_done_direct_transition_rejected(self) -> None:
        task = {"id": "T10", "state": "in_progress", "owner": "writer-a"}
        with self.assertRaises(cli.CliError):
            cli.transition_task(task, "done")


class ArtifactSurfaceContractTests(unittest.TestCase):
    def test_artifact_surface_contracts_pass_with_index_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            seed_minimal_run_dir(run_dir)
            write_json(
                run_dir / "interfaces" / "index.json",
                {"version": "1", "interfaces": []},
            )
            write_json(
                run_dir / "handoffs" / "index.json",
                {"version": "1", "handoffs": []},
            )
            write_json(
                run_dir / "verification" / "index.json",
                {"version": "1", "verifications": []},
            )

            args = argparse.Namespace(path=str(run_dir), all=True)
            cli.cmd_validate_artifacts(args)

    def test_artifact_surface_contracts_fail_with_placeholders_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            seed_minimal_run_dir(run_dir)
            (run_dir / "interfaces" / "README.md").write_text("placeholder\n")
            (run_dir / "handoffs" / "README.md").write_text("placeholder\n")
            (run_dir / "verification" / "README.md").write_text("placeholder\n")

            args = argparse.Namespace(path=str(run_dir), all=True)
            with self.assertRaises(cli.CliError):
                cli.cmd_validate_artifacts(args)


class FixtureAndLiveBlockerContractTests(unittest.TestCase):
    def test_manifest_fixture_missing_freeze_windows_is_detected(self) -> None:
        payload = json.loads(
            (FIXTURES_DIR / "run-manifest-missing-freeze.json").read_text()
        )
        issues = cli.validate_manifest_data(payload)
        self.assertIn("missing freeze window: integration_freeze", issues)
        self.assertIn("missing freeze window: evidence_only", issues)

    def test_shared_build_fixture_classifies_shared_integration(self) -> None:
        payload = json.loads((FIXTURES_DIR / "failure-shared-build.json").read_text())
        kind = cli.classify_failure_payload(payload)
        self.assertEqual(kind, "shared-integration")

    def test_live_blocker_provider_issue_is_gated_in_mock_mode(self) -> None:
        payload = {
            "kind": "environment",
            "symptom": "provider request failed",
            "signature": "invalid_api_key",
        }
        result = cli.classify_live_blocker(
            payload,
            env={
                "COMPETITION_PROVIDER_SMOKE_MODE": "mock",
                "COMPETITION_LAUNCH_MODE": "mock",
                "COMPETITION_INPUT_MODE": "local-video",
            },
        )
        self.assertFalse(result["live_blocker"])
        self.assertEqual(result["gate"], "mock")

    def test_live_blocker_provider_issue_blocks_in_live_mode(self) -> None:
        payload = {
            "kind": "environment",
            "symptom": "provider request failed",
            "signature": "invalid_api_key",
        }
        result = cli.classify_live_blocker(
            payload,
            env={
                "COMPETITION_PROVIDER_SMOKE_MODE": "live",
                "COMPETITION_LAUNCH_MODE": "live",
                "COMPETITION_INPUT_MODE": "live-capture",
            },
        )
        self.assertTrue(result["live_blocker"])
        self.assertEqual(result["gate"], "live")

    def test_live_blocker_permissions_not_blocking_on_local_video_path(self) -> None:
        payload = {
            "kind": "environment",
            "symptom": "missing_permissions on screen recording",
        }
        result = cli.classify_live_blocker(
            payload,
            env={
                "COMPETITION_PROVIDER_SMOKE_MODE": "live",
                "COMPETITION_LAUNCH_MODE": "live",
                "COMPETITION_INPUT_MODE": "local-video",
            },
        )
        self.assertFalse(result["live_blocker"])


if __name__ == "__main__":
    unittest.main()
