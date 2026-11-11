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


def read_block_from_zips(load):
    archives = {}

    def member(entry):
        if entry["zip"] not in archives:
            archive = zipfile.ZipFile(entry["zip"])
            archives[entry["zip"]] = (archive, {item.header_offset: item for item in archive.infolist()})
        archive, by_offset = archives[entry["zip"]]
        return io.BytesIO(archive.read(by_offset[entry["offset"]]))

    return lambda behaviour, left, right: load(member(behaviour), member(left), member(right))


def clear_study_rules(blocks):
    folders = sorted({block["session_folder"] for block in blocks})
    batch.SESSION_FOLDERS = {folder: folder for folder in folders}
    batch.EXCLUDED_PARTICIPANTS = {}
    batch.EXCLUDED_SESSIONS = {}
    batch.KNOWN_MISSING_SESSIONS = {}
    batch.IGNORED_BLOCK_TERMS = ()
    batch.MANUAL_ANALYSIS_EXCLUSIONS = ()


def known_hands(recorded):
    return {participant: hand for participant, hand in recorded.items() if hand in ("LEFT", "RIGHT")}


def use_recorded_handedness(dominant):
    hands = known_hands(dominant)
    controls.LEFT_HANDED_PARTICIPANTS = {participant for participant, hand in hands.items() if hand == "LEFT"}
    add_fields = controls.add_control_hand_fields

    def add_recorded_fields(frame):
        frame = frame.copy()
        read_as_missing = frame["participant_id"].isna()
        frame.loc[read_as_missing, "participant_id"] = frame.loc[read_as_missing, "block_id"].astype("string").str.rsplit("/", n=2).str[0]
        result = add_fields(frame)
        own = result["participant_id"].map(lambda participant: hands.get(participant, ""))
        other = own.map(lambda hand: {"LEFT": "RIGHT", "RIGHT": "LEFT"}.get(hand, ""))
        known = own.ne("")
        reaching = result["hand"].astype("string").str.upper()
        hand_role = pd.Series("unknown", index=result.index, dtype="string")
        hand_role.loc[(known & reaching.eq(own)).fillna(False)] = "dominant"
        hand_role.loc[(known & reaching.eq(other)).fillna(False)] = "non_dominant"
        result["dominant_hand"] = own.where(known, pd.NA)
        result["non_dominant_hand"] = other.where(known, pd.NA)
        result["hand_role"] = hand_role
        result["is_non_dominant_reach"] = hand_role.eq("non_dominant")
        return result

    controls.add_control_hand_fields = add_recorded_fields


def add_affected_hand_fields(path, hands):
    frame = pd.read_csv(path, dtype=str, keep_default_na=False)
    less_affected = frame["participant_id"].map(lambda participant: hands.get(participant, ""))
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
    hands = known_hands(recorded)
    add_affected_hand_fields(output / "all_trial_metrics.csv", hands)
    add_affected_hand_fields(output / "kinematics_all_valid_reaches_master.csv", hands)


def has_rows(path):
    if not path.exists():
        return False
    with path.open(encoding="utf-8") as source:
        source.readline()
        return bool(source.readline().strip())


def master_participants(path):
    if not has_rows(path):
        return set()
    return set(pd.read_csv(path, dtype=str, keep_default_na=False, usecols=["participant_id"])["participant_id"])


def update_summary(output, manifest):
    path = output / "batch_summary.json"
    summary = json.loads(path.read_text(encoding="utf-8"))
    summary["input_directory"] = "WebSpheres Analysis page"
    summary["output_directory"] = "WebSpheres Analysis page"
    summary["session_folders"] = batch.SESSION_FOLDERS
    summary["patient_directories_discovered"] = len({block["participant_id"] for block in manifest["blocks"]})
    summary["group"] = manifest["group"]
    present = master_participants(output / "kinematics_all_valid_reaches_master.csv")
    hands = {participant: hand for participant, hand in manifest["dominant"].items() if participant in present}
    not_known = sorted(participant for participant, hand in hands.items() if hand not in ("LEFT", "RIGHT"))
    if manifest["group"] == "controls" and "handedness_rule" in summary:
        summary["handedness_rule"] = "Each participant's handedness is the DominantHand value recorded in their sessions. The hand of interest is the non-dominant hand."
        summary["left_handed_participants"] = sorted(participant for participant, hand in hands.items() if hand == "LEFT")
        summary["handedness_not_known"] = not_known
    if manifest["group"] == "patients" and present:
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
    update_summary(output, manifest)
