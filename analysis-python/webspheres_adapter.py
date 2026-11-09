import json
import sys
from pathlib import Path

import pandas as pd

import kinematics_batch_pipeline as batch
import kinematics_batch_pipeline_controls as controls


def record(block):
    return {
        "block_id": block["block_id"],
        "block_name": block["block_name"],
        "participant_id": block["participant_id"],
        "session": block["session"],
        "session_folder": block["session_folder"],
        "filename_participant_id": block["participant_id"],
        "behaviour_path": Path(block["behaviour"]),
        "left_path": Path(block["left"]),
        "right_path": Path(block["right"]),
    }


def missing_record(block):
    return {
        "block_id": block["block_id"],
        "block_name": block["block_name"],
        "participant_id": block["participant_id"],
        "session": block["session"],
        "session_folder": block["session_folder"],
        "filename_participant_id": block["participant_id"],
        "behaviour_path": "",
        "left_path": "",
        "right_path": "",
        "missing_files": block["missing"],
    }


def clear_study_rules(blocks):
    folders = sorted({block["session_folder"] for block in blocks})
    batch.SESSION_FOLDERS = {folder: folder for folder in folders}
    batch.EXCLUDED_PARTICIPANTS = {}
    batch.EXCLUDED_SESSIONS = {}
    batch.KNOWN_MISSING_SESSIONS = {}
    batch.IGNORED_BLOCK_TERMS = ()
    batch.MANUAL_ANALYSIS_EXCLUSIONS = ()


def use_recorded_handedness(dominant):
    ids = pd.DataFrame({"participant_id": pd.Series(list(dominant), dtype="string")})
    labels = {}
    for participant, padded in zip(dominant, controls.participant_ids(ids)):
        labels.setdefault(padded, set()).add(dominant[participant])
    unknown = {key for key, value in labels.items() if value not in ({"LEFT"}, {"RIGHT"})}
    controls.LEFT_HANDED_PARTICIPANTS = {key for key, value in labels.items() if value == {"LEFT"}}
    add_fields = controls.add_control_hand_fields

    def add_recorded_fields(frame):
        result = add_fields(frame)
        not_known = controls.participant_ids(result).isin(unknown)
        result.loc[not_known, ["dominant_hand", "non_dominant_hand"]] = pd.NA
        result.loc[not_known, "hand_role"] = "unknown"
        result.loc[not_known, "is_non_dominant_reach"] = False
        return result

    controls.add_control_hand_fields = add_recorded_fields


def has_rows(path):
    return path.exists() and len(path.read_text(encoding="utf-8").strip().splitlines()) > 1


def update_summary(output, manifest):
    path = output / "batch_summary.json"
    summary = json.loads(path.read_text(encoding="utf-8"))
    summary["input_directory"] = "WebSpheres Analysis page"
    summary["output_directory"] = "WebSpheres Analysis page"
    summary["session_folders"] = batch.SESSION_FOLDERS
    summary["patient_directories_discovered"] = len({block["participant_id"] for block in manifest["blocks"]})
    summary["group"] = manifest["group"]
    if manifest["group"] == "controls" and "handedness_rule" in summary:
        summary["handedness_rule"] = "Each participant's handedness is the DominantHand value recorded in their sessions. The hand of interest is the non-dominant hand."
        summary["left_handed_participants"] = sorted(key for key, value in manifest["dominant"].items() if value == "LEFT")
        summary["handedness_not_known"] = sorted(key for key, value in manifest["dominant"].items() if value not in ("LEFT", "RIGHT"))
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def run(manifest_path):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    blocks = manifest["blocks"]
    complete = [record(block) for block in blocks if not block.get("missing")]
    incomplete = [missing_record(block) for block in blocks if block.get("missing")]
    output = Path(manifest["output"])
    clear_study_rules(blocks)
    batch.discover_triplets = lambda _: (complete, incomplete, [], [])
    sys.argv = ["kinematics_batch_pipeline.py", "--input", manifest["input"], "--output", str(output)]
    batch.main()
    if manifest["group"] == "controls" and has_rows(output / "kinematics_all_valid_reaches_master.csv"):
        use_recorded_handedness(manifest["dominant"])
        controls.postprocess_control_outputs(output)
    update_summary(output, manifest)
