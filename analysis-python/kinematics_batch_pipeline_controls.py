#!/usr/bin/env python3
"""Run the locked v5 kinematic extraction across healthy-control folders."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

import kinematics_batch_pipeline as shared_batch


COHORT = "healthy_control"
LEFT_HANDED_PARTICIPANTS = {"002"}


def participant_ids(frame: pd.DataFrame) -> pd.Series:
    """Return zero-padded three-digit participant identifiers."""
    return (
        frame["participant_id"]
        .astype("string")
        .str.replace(r"\.0$", "", regex=True)
        .str.zfill(3)
    )


def add_control_hand_fields(frame: pd.DataFrame) -> pd.DataFrame:
    """Label dominant and non-dominant hands without removing either hand."""
    result = frame.copy()
    ids = participant_ids(result)
    dominant_hand = ids.map(
        lambda participant: (
            "LEFT" if participant in LEFT_HANDED_PARTICIPANTS else "RIGHT"
        )
    )
    non_dominant_hand = dominant_hand.map({"LEFT": "RIGHT", "RIGHT": "LEFT"})
    recorded_hand = result["hand"].astype("string").str.upper()

    hand_role = pd.Series("unknown", index=result.index, dtype="string")
    hand_role.loc[recorded_hand.eq(dominant_hand)] = "dominant"
    hand_role.loc[recorded_hand.eq(non_dominant_hand)] = "non_dominant"

    result["cohort"] = COHORT
    result["dominant_hand"] = dominant_hand
    result["non_dominant_hand"] = non_dominant_hand
    result["hand_role"] = hand_role
    result["is_non_dominant_reach"] = hand_role.eq("non_dominant")
    return result


def add_cohort_field(path: Path) -> None:
    """Add the cohort label to a generated audit CSV."""
    if not path.exists():
        return
    frame = pd.read_csv(path)
    if "cohort" not in frame.columns:
        frame["cohort"] = COHORT
    frame.to_csv(path, index=False)


def postprocess_control_outputs(output_directory: Path) -> None:
    """Add handedness labels and create the non-dominant analysis subset."""
    trial_path = output_directory / "all_trial_metrics.csv"
    master_path = output_directory / "kinematics_all_valid_reaches_master.csv"

    all_trials = pd.read_csv(trial_path, dtype={"participant_id": "string"})
    all_trials = add_control_hand_fields(all_trials)
    all_trials.to_csv(trial_path, index=False)

    analysis_master = pd.read_csv(
        master_path,
        dtype={"participant_id": "string"},
    )
    analysis_master = add_control_hand_fields(analysis_master)
    analysis_master.to_csv(master_path, index=False)

    non_dominant = analysis_master.loc[
        analysis_master["is_non_dominant_reach"]
    ].copy()
    non_dominant.to_csv(
        output_directory / "kinematics_non_dominant_valid_reaches.csv",
        index=False,
    )

    for filename in (
        "all_block_audit.csv",
        "processing_errors.csv",
        "timestamp_anomaly_blocks.csv",
        "skipped_blocks.csv",
        "patient_directory_audit.csv",
        "incomplete_file_triplets.csv",
        "qc_reason_counts.csv",
    ):
        add_cohort_field(output_directory / filename)

    summary_path = output_directory / "batch_summary.json"
    with summary_path.open("r", encoding="utf-8") as source:
        summary = json.load(source)
    summary.update(
        {
            "cohort": COHORT,
            "session_folders": {"s2": "s2", "s3": "s3"},
            "handedness_rule": (
                "Participant 002 is left-handed; all other controls are "
                "right-handed. The hand of interest is the non-dominant hand."
            ),
            "left_handed_participants": sorted(LEFT_HANDED_PARTICIPANTS),
            "analysis_master_scope": "all QC-passing reaches from both hands",
            "non_dominant_valid_reaches": int(len(non_dominant)),
        }
    )
    with summary_path.open("w", encoding="utf-8") as destination:
        json.dump(summary, destination, indent=2)
        destination.write("\n")


def main() -> None:
    # Reuse the locked patient batch implementation with control-specific
    # discovery rules. No processing or QC calculation is changed.
    parsed_args = shared_batch.parse_args()
    original_parse_args = shared_batch.parse_args
    shared_batch.parse_args = lambda: parsed_args
    shared_batch.SESSION_FOLDERS = {"s2": "s2", "s3": "s3"}
    shared_batch.EXCLUDED_PARTICIPANTS = {}
    shared_batch.EXCLUDED_SESSIONS = {}
    shared_batch.KNOWN_MISSING_SESSIONS = {}
    shared_batch.IGNORED_BLOCK_TERMS = ()
    shared_batch.MANUAL_ANALYSIS_EXCLUSIONS = ()

    try:
        shared_batch.main()
    finally:
        shared_batch.parse_args = original_parse_args

    postprocess_control_outputs(parsed_args.output)


if __name__ == "__main__":
    main()
