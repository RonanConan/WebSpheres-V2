import io
import json
import sys
import zipfile
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
        "behaviour_path": block["behaviour"],
        "left_path": block["left"],
        "right_path": block["right"],
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


def zip_member(entry):
    with zipfile.ZipFile(entry["zip"]) as archive:
        info = next(item for item in archive.infolist() if item.header_offset == entry["offset"])
        return io.BytesIO(archive.read(info))


def read_block_from_zips(load):
    return lambda behaviour, left, right: load(zip_member(behaviour), zip_member(left), zip_member(right))


def clear_study_rules(blocks):
    folders = sorted({block["session_folder"] for block in blocks})
    batch.SESSION_FOLDERS = {folder: folder for folder in folders}
    batch.EXCLUDED_PARTICIPANTS = {}
    batch.EXCLUDED_SESSIONS = {}
    batch.KNOWN_MISSING_SESSIONS = {}
    batch.IGNORED_BLOCK_TERMS = ()
    batch.MANUAL_ANALYSIS_EXCLUSIONS = ()


def padded_ids(recorded):
    ids = pd.DataFrame({"participant_id": pd.Series(list(recorded), dtype="string")})
    return list(controls.participant_ids(ids))


def recorded_hands(recorded):
    labels = {}
    for participant, padded in zip(recorded, padded_ids(recorded)):
        labels.setdefault(padded, set()).add(recorded[participant])
    return {key: next(iter(value)) if value in ({"LEFT"}, {"RIGHT"}) else "" for key, value in labels.items()}


def hands_by_recorded_id(recorded):
    hands = recorded_hands(recorded)
    return {participant: hands[padded] for participant, padded in zip(recorded, padded_ids(recorded))}


def use_recorded_handedness(dominant):
    hands = recorded_hands(dominant)
    unknown = {key for key, value in hands.items() if not value}
    controls.LEFT_HANDED_PARTICIPANTS = {key for key, value in hands.items() if value == "LEFT"}
    add_fields = controls.add_control_hand_fields

    def add_recorded_fields(frame):
        result = add_fields(frame)
        not_known = controls.participant_ids(result).isin(unknown)
        result.loc[not_known, ["dominant_hand", "non_dominant_hand"]] = pd.NA
        result.loc[not_known, "hand_role"] = "unknown"
        result.loc[not_known, "is_non_dominant_reach"] = False
        return result

    controls.add_control_hand_fields = add_recorded_fields


def add_affected_hand_fields(path, hands):
    frame = pd.read_csv(path, dtype=str, keep_default_na=False)
    less_affected = controls.participant_ids(frame).map(lambda participant: hands.get(participant, ""))
    more_affected = less_affected.map(lambda hand: {"LEFT": "RIGHT", "RIGHT": "LEFT"}.get(hand, ""))
    reaching_hand = frame["hand"].str.upper()
    hand_role = pd.Series("unknown", index=frame.index, dtype="string")
    hand_role.loc[less_affected.ne("") & reaching_hand.eq(less_affected)] = "less_affected"
    hand_role.loc[more_affected.ne("") & reaching_hand.eq(more_affected)] = "more_affected"
    frame["less_affected_hand"] = less_affected
    frame["more_affected_hand"] = more_affected
    frame["hand_role"] = hand_role
    frame["is_more_affected_reach"] = hand_role.eq("more_affected")
    frame.to_csv(path, index=False)


def postprocess_patient_outputs(output, recorded):
    hands = recorded_hands(recorded)
    add_affected_hand_fields(output / "all_trial_metrics.csv", hands)
    add_affected_hand_fields(output / "kinematics_all_valid_reaches_master.csv", hands)


def has_rows(path):
    if not path.exists():
        return False
    with path.open(encoding="utf-8") as source:
        source.readline()
        return bool(source.readline().strip())


def update_summary(output, manifest, master_has_rows):
    path = output / "batch_summary.json"
    summary = json.loads(path.read_text(encoding="utf-8"))
    summary["input_directory"] = "WebSpheres Analysis page"
    summary["output_directory"] = "WebSpheres Analysis page"
    summary["session_folders"] = batch.SESSION_FOLDERS
    summary["patient_directories_discovered"] = len({block["participant_id"] for block in manifest["blocks"]})
    summary["group"] = manifest["group"]
    hands = hands_by_recorded_id(manifest["dominant"]) if master_has_rows else {}
    not_known = sorted(key for key, value in hands.items() if not value)
    if manifest["group"] == "controls" and "handedness_rule" in summary:
        summary["handedness_rule"] = "Each participant's handedness is the DominantHand value recorded in their sessions. The hand of interest is the non-dominant hand."
        summary["left_handed_participants"] = sorted(key for key, value in hands.items() if value == "LEFT")
        summary["handedness_not_known"] = not_known
    if manifest["group"] == "patients" and master_has_rows:
        summary["affected_hand_rule"] = "Each participant's less affected hand is the DominantHand value recorded in their sessions. The more affected hand is the other hand."
        summary["less_affected_hand_not_known"] = not_known
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def run(manifest_path):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    blocks = manifest["blocks"]
    complete = [record(block) for block in blocks if not block.get("missing")]
    incomplete = [missing_record(block) for block in blocks if block.get("missing")]
    output = Path(manifest["output"])
    clear_study_rules(blocks)
    batch.discover_triplets = lambda _: (complete, incomplete, [], [])
    batch.load_inputs = read_block_from_zips(batch.load_inputs)
    sys.argv = ["kinematics_batch_pipeline.py", "--input", manifest["input"], "--output", str(output)]
    batch.main()
    master_has_rows = has_rows(output / "kinematics_all_valid_reaches_master.csv")
    if manifest["group"] == "controls" and master_has_rows:
        use_recorded_handedness(manifest["dominant"])
        controls.postprocess_control_outputs(output)
    if manifest["group"] == "patients" and master_has_rows:
        postprocess_patient_outputs(output, manifest["dominant"])
    update_summary(output, manifest, master_has_rows)
