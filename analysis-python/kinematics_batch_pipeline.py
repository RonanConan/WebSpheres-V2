#!/usr/bin/env python3
"""Run the audited block-level kinematic extraction across the patient folders."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from kinematics_block_pipeline import (
    Config,
    PIPELINE_VERSION,
    PRIMARY_ONSET_RULE,
    load_inputs,
    make_uniform_signal,
    process_trials,
    sampling_audit,
)


# Study-level inclusion rules. These are applied before any CSV is opened.
SESSION_FOLDERS = {
    "p1+s1": "s1",
    "s2": "s2",
    "s3": "s3",
}
EXCLUDED_PARTICIPANTS = {
    "002": "screened_but_not_in_final_patient_sample",
    "011": "screened_but_not_in_final_patient_sample",
}
EXCLUDED_SESSIONS = {}
KNOWN_MISSING_SESSIONS = {
    ("012", "s3"): "session_3_not_completed_due_to_discharge",
}
IGNORED_BLOCK_TERMS = ("fatigue",)
MANUAL_ANALYSIS_EXCLUSIONS = (
    {
        "participant_id": "010",
        "session": "s3",
        "block_id": "010/s3/s010-baseline-1",
        "trial": 6,
        "reason": "late_truncated_onset_identified_during_visual_qc",
    },
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    script_directory = Path(__file__).resolve().parent
    parser.add_argument(
        "--input",
        type=Path,
        default=script_directory.parent,
        help=(
            "C(Patients) directory. By default this is the parent of the folder "
            "containing this script."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=script_directory / "output",
        help="Output directory. Defaults to kinematics/output.",
    )
    parser.add_argument("--resample-hz", type=float, default=90.0)
    parser.add_argument("--filter-cutoff-hz", type=float, default=6.0)
    return parser.parse_args()


def participant_from_name(block_name: str) -> str:
    match = re.match(r"^s?(\d{3})(?:[-_]|$)", block_name, flags=re.IGNORECASE)
    return match.group(1) if match else "unknown"


def block_name_from_csv(path: Path) -> str:
    if path.name.endswith("-KL.csv") or path.name.endswith("-KR.csv"):
        return path.name[:-7]
    return path.stem


def discover_triplets(input_directory: Path):
    complete = []
    incomplete = []
    skipped = []
    directory_rows = []

    patient_directories = sorted(
        path
        for path in input_directory.iterdir()
        if path.is_dir() and re.fullmatch(r"\d{3}", path.name)
    )
    if not patient_directories:
        raise FileNotFoundError(
            f"No three-digit patient folders were found in: {input_directory}"
        )

    for patient_directory in patient_directories:
        participant_id = patient_directory.name
        if participant_id in EXCLUDED_PARTICIPANTS:
            # Do not inspect any files or session folders for these IDs.
            skipped.append(
                {
                    "block_id": participant_id,
                    "participant_id": participant_id,
                    "session": "all",
                    "reason": EXCLUDED_PARTICIPANTS[participant_id],
                }
            )
            continue

        for folder_name, session in SESSION_FOLDERS.items():
            session_directory = patient_directory / folder_name
            session_key = (participant_id, session)
            if session_key in EXCLUDED_SESSIONS:
                skipped.append(
                    {
                        "block_id": f"{participant_id}/{folder_name}",
                        "participant_id": participant_id,
                        "session": session,
                        "reason": EXCLUDED_SESSIONS[session_key],
                    }
                )
                directory_rows.append(
                    {
                        "participant_id": participant_id,
                        "session": session,
                        "folder": folder_name,
                        "status": "excluded",
                        "reason": EXCLUDED_SESSIONS[session_key],
                    }
                )
                continue

            if not session_directory.is_dir():
                reason = KNOWN_MISSING_SESSIONS.get(
                    session_key, "expected_session_folder_not_found"
                )
                status = (
                    "known_absent"
                    if session_key in KNOWN_MISSING_SESSIONS
                    else "missing"
                )
                directory_rows.append(
                    {
                        "participant_id": participant_id,
                        "session": session,
                        "folder": folder_name,
                        "status": status,
                        "reason": reason,
                    }
                )
                continue

            directory_rows.append(
                {
                    "participant_id": participant_id,
                    "session": session,
                    "folder": folder_name,
                    "status": "included",
                    "reason": "",
                }
            )
            block_names = sorted(
                {block_name_from_csv(path) for path in session_directory.glob("*.csv")}
            )
            for block_name in block_names:
                block_id = f"{participant_id}/{folder_name}/{block_name}"
                if any(term in block_name.lower() for term in IGNORED_BLOCK_TERMS):
                    skipped.append(
                        {
                            "block_id": block_id,
                            "participant_id": participant_id,
                            "session": session,
                            "reason": "session_1_fatigue_block_excluded",
                        }
                    )
                    continue

                behaviour_path = session_directory / f"{block_name}.csv"
                left_path = session_directory / f"{block_name}-KL.csv"
                right_path = session_directory / f"{block_name}-KR.csv"
                missing = [
                    str(path)
                    for path in (behaviour_path, left_path, right_path)
                    if not path.exists()
                ]
                record = {
                    "block_id": block_id,
                    "block_name": block_name,
                    "participant_id": participant_id,
                    "session": session,
                    "session_folder": folder_name,
                    "filename_participant_id": participant_from_name(block_name),
                    "behaviour_path": behaviour_path,
                    "left_path": left_path,
                    "right_path": right_path,
                }
                if missing:
                    incomplete.append({**record, "missing_files": ";".join(missing)})
                else:
                    complete.append(record)
    return complete, incomplete, skipped, directory_rows


def scalar_summary(values: pd.Series, prefix: str) -> dict[str, float]:
    clean = pd.to_numeric(values, errors="coerce").dropna()
    if clean.empty:
        return {
            f"{prefix}_minimum": np.nan,
            f"{prefix}_median": np.nan,
            f"{prefix}_maximum": np.nan,
        }
    return {
        f"{prefix}_minimum": float(clean.min()),
        f"{prefix}_median": float(clean.median()),
        f"{prefix}_maximum": float(clean.max()),
    }


def main():
    args = parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    config = Config(
        resample_hz=args.resample_hz,
        filter_cutoff_hz=args.filter_cutoff_hz,
    )
    complete, incomplete, skipped_rows, directory_rows = discover_triplets(args.input)

    trial_frames = []
    block_rows = []
    error_rows = []

    for index, record in enumerate(complete, start=1):
        participant_id = record["participant_id"]
        print(f"[{index}/{len(complete)}] {record['block_id']}")
        try:
            behaviour, raw_by_hand = load_inputs(
                record["behaviour_path"],
                record["left_path"],
                record["right_path"],
            )
            signals = {
                hand: make_uniform_signal(frame, config)
                for hand, frame in raw_by_hand.items()
            }
            metrics = process_trials(behaviour, raw_by_hand, signals, config)
            metrics.insert(0, "session_folder", record["session_folder"])
            metrics.insert(0, "session", record["session"])
            metrics.insert(0, "participant_id", participant_id)
            metrics.insert(0, "block_id", record["block_id"])
            metrics.insert(1, "pipeline_version", PIPELINE_VERSION)
            trial_frames.append(metrics)

            left_audit = sampling_audit(raw_by_hand["LEFT"])
            right_audit = sampling_audit(raw_by_hand["RIGHT"])
            valid = metrics[metrics["qc_valid_core"]]
            block_rows.append(
                {
                    "block_id": record["block_id"],
                    "participant_id": participant_id,
                    "session": record["session"],
                    "session_folder": record["session_folder"],
                    "filename_participant_id": record["filename_participant_id"],
                    "behaviour_trials": int(len(behaviour)),
                    "valid_core_trials": int(metrics["qc_valid_core"].sum()),
                    "invalid_core_trials": int((~metrics["qc_valid_core"]).sum()),
                    "sparc_endpoint_valid_trials": int(
                        valid.get("sparc_endpoint_valid", pd.Series(dtype=bool)).sum()
                    ),
                    "peak_at_final_processed_sample_trials": int(
                        valid.get(
                            "peak_at_final_processed_sample",
                            pd.Series(dtype=bool),
                        ).sum()
                    ),
                    "zero_internal_velocity_peak_trials": int(
                        (
                            valid.get(
                                "velocity_peak_count_abs20_sep150",
                                pd.Series(dtype=float),
                            ) == 0
                        ).sum()
                    ),
                    "target_mapping_failure_trials": int(
                        metrics["qc_reason"].str.contains(
                            "target_number_coordinate_mismatch|target_coordinate_unstable|target_geometry_unavailable",
                            regex=True,
                            na=False,
                        ).sum()
                    ),
                    "left_right_timestamps_identical": bool(
                        np.array_equal(
                            raw_by_hand["LEFT"]["Timestamp"],
                            raw_by_hand["RIGHT"]["Timestamp"],
                        )
                    ),
                    "left_right_raw_timestamps_identical": bool(
                        raw_by_hand["LEFT"].attrs.get(
                            "raw_left_right_timestamps_identical", False
                        )
                    ),
                    "left_samples": left_audit["n_samples"],
                    "right_samples": right_audit["n_samples"],
                    "left_original_samples": left_audit["original_n_samples"],
                    "right_original_samples": right_audit["original_n_samples"],
                    "left_missing_timestamp_rows": left_audit["missing_timestamp_rows"],
                    "right_missing_timestamp_rows": right_audit["missing_timestamp_rows"],
                    "left_duplicate_timestamps": left_audit["duplicate_timestamps"],
                    "right_duplicate_timestamps": right_audit["duplicate_timestamps"],
                    "left_duplicate_timestamp_values": left_audit[
                        "duplicate_timestamp_values"
                    ],
                    "right_duplicate_timestamp_values": right_audit[
                        "duplicate_timestamp_values"
                    ],
                    "left_duplicate_timestamp_values_with_position_disagreement": left_audit[
                        "duplicate_timestamp_values_with_position_disagreement"
                    ],
                    "right_duplicate_timestamp_values_with_position_disagreement": right_audit[
                        "duplicate_timestamp_values_with_position_disagreement"
                    ],
                    "left_maximum_duplicate_position_difference_m": left_audit[
                        "maximum_duplicate_position_difference_m"
                    ],
                    "right_maximum_duplicate_position_difference_m": right_audit[
                        "maximum_duplicate_position_difference_m"
                    ],
                    "left_nonmonotonic_intervals": left_audit["nonmonotonic_intervals"],
                    "right_nonmonotonic_intervals": right_audit["nonmonotonic_intervals"],
                    "left_maximum_timestamp_reversal_ms": left_audit[
                        "maximum_timestamp_reversal_ms"
                    ],
                    "right_maximum_timestamp_reversal_ms": right_audit[
                        "maximum_timestamp_reversal_ms"
                    ],
                    "left_maximum_reversal_position_step_m": left_audit[
                        "maximum_reversal_position_step_m"
                    ],
                    "right_maximum_reversal_position_step_m": right_audit[
                        "maximum_reversal_position_step_m"
                    ],
                    "left_median_rate_hz": left_audit["median_rate_hz"],
                    "right_median_rate_hz": right_audit["median_rate_hz"],
                    "left_maximum_interval_ms": left_audit["maximum_interval_ms"],
                    "right_maximum_interval_ms": right_audit["maximum_interval_ms"],
                    **scalar_summary(
                        metrics["maximum_raw_gap_onset_to_contact_ms"],
                        "trial_maximum_gap_ms",
                    ),
                    **scalar_summary(
                        metrics["maximum_raw_position_step_onset_to_contact_m"],
                        "trial_maximum_position_step_m",
                    ),
                    **scalar_summary(
                        metrics["maximum_raw_gap_filter_guard_to_contact_ms"],
                        "filter_guard_maximum_gap_ms",
                    ),
                    **scalar_summary(
                        metrics["maximum_raw_position_step_target_to_contact_m"],
                        "target_window_maximum_position_step_m",
                    ),
                    **scalar_summary(
                        metrics["target_angle_error_deg"].abs(),
                        "absolute_target_angle_error_deg",
                    ),
                    **scalar_summary(valid["movement_duration_s"], "movement_duration_s"),
                    **scalar_summary(valid["peak_velocity_m_s"], "peak_velocity_m_s"),
                    **scalar_summary(valid["path_efficiency"], "path_efficiency"),
                    **scalar_summary(
                        valid["contact_speed_fraction_of_peak"],
                        "contact_speed_fraction_of_peak",
                    ),
                    **scalar_summary(
                        valid["fingertip_endpoint_to_target_distance_m"],
                        "fingertip_endpoint_to_target_distance_m",
                    ),
                }
            )
        except Exception as error:  # Continue so one bad block cannot hide the others.
            error_rows.append(
                {
                    "block_id": record["block_id"],
                    "participant_id": participant_id,
                    "session": record["session"],
                    "session_folder": record["session_folder"],
                    "error_type": type(error).__name__,
                    "error": str(error),
                }
            )

    all_trials = pd.concat(trial_frames, ignore_index=True) if trial_frames else pd.DataFrame()
    all_blocks = pd.DataFrame(block_rows)
    errors = pd.DataFrame(
        error_rows,
        columns=[
            "block_id", "participant_id", "session", "session_folder",
            "error_type", "error",
        ],
    )
    skipped = pd.DataFrame(
        skipped_rows,
        columns=["block_id", "participant_id", "session", "reason"],
    )
    directory_audit = pd.DataFrame(
        directory_rows,
        columns=["participant_id", "session", "folder", "status", "reason"],
    )
    incomplete_frame = pd.DataFrame(
        incomplete,
        columns=[
            "block_id", "block_name", "participant_id", "session",
            "session_folder", "filename_participant_id", "behaviour_path",
            "left_path", "right_path", "missing_files",
        ],
    )

    if not all_trials.empty:
        analysis_master = all_trials.loc[
            all_trials["qc_valid_core"].fillna(False).astype(bool)
        ].copy()
        manual_exclusion_mask = pd.Series(False, index=analysis_master.index)
        for exclusion in MANUAL_ANALYSIS_EXCLUSIONS:
            manual_exclusion_mask |= (
                analysis_master["participant_id"].astype(str).str.zfill(3).eq(
                    exclusion["participant_id"]
                )
                & analysis_master["session"].astype(str).eq(exclusion["session"])
                & analysis_master["block_id"].astype(str).eq(exclusion["block_id"])
                & pd.to_numeric(analysis_master["trial"], errors="coerce").eq(
                    exclusion["trial"]
                )
            )
        manual_analysis_exclusions_found = int(manual_exclusion_mask.sum())
        analysis_master = analysis_master.loc[~manual_exclusion_mask].copy()
    else:
        analysis_master = all_trials.copy()
        manual_analysis_exclusions_found = 0

    all_trials.to_csv(args.output / "all_trial_metrics.csv", index=False)
    analysis_master.to_csv(
        args.output / "kinematics_all_valid_reaches_master.csv",
        index=False,
    )
    all_blocks.to_csv(args.output / "all_block_audit.csv", index=False)
    if not all_blocks.empty:
        timestamp_anomalies = all_blocks[
            (
                all_blocks[
                    [
                        "left_duplicate_timestamps",
                        "right_duplicate_timestamps",
                        "left_nonmonotonic_intervals",
                        "right_nonmonotonic_intervals",
                    ]
                ]
                > 0
            ).any(axis=1)
        ].copy()
    else:
        timestamp_anomalies = all_blocks.copy()
    timestamp_anomalies.to_csv(
        args.output / "timestamp_anomaly_blocks.csv",
        index=False,
    )
    errors.to_csv(args.output / "processing_errors.csv", index=False)
    skipped.to_csv(args.output / "skipped_blocks.csv", index=False)
    directory_audit.to_csv(args.output / "patient_directory_audit.csv", index=False)
    if not incomplete_frame.empty:
        printable_incomplete = incomplete_frame.drop(
            columns=["behaviour_path", "left_path", "right_path"], errors="ignore"
        )
    else:
        printable_incomplete = incomplete_frame
    printable_incomplete.to_csv(args.output / "incomplete_file_triplets.csv", index=False)

    if not all_trials.empty:
        reason_counts = (
            all_trials.groupby(["qc_reason"], dropna=False)
            .size()
            .rename("trials")
            .reset_index()
            .sort_values("trials", ascending=False)
        )
    else:
        reason_counts = pd.DataFrame(columns=["qc_reason", "trials"])
    reason_counts.to_csv(args.output / "qc_reason_counts.csv", index=False)

    summary = {
        "pipeline_version": PIPELINE_VERSION,
        "primary_onset_rule": PRIMARY_ONSET_RULE,
        "configuration": asdict(config),
        "input_directory": str(args.input.resolve()),
        "output_directory": str(args.output.resolve()),
        "session_folders": SESSION_FOLDERS,
        "excluded_participants": EXCLUDED_PARTICIPANTS,
        "excluded_sessions": {
            f"{participant}_{session}": reason
            for (participant, session), reason in EXCLUDED_SESSIONS.items()
        },
        "known_missing_sessions": {
            f"{participant}_{session}": reason
            for (participant, session), reason in KNOWN_MISSING_SESSIONS.items()
        },
        "ignored_block_terms": list(IGNORED_BLOCK_TERMS),
        "patient_directories_discovered": len(
            [
                path
                for path in args.input.iterdir()
                if path.is_dir() and re.fullmatch(r"\d{3}", path.name)
            ]
        ),
        "discovered_complete_triplets": len(complete),
        "processed_blocks": len(all_blocks),
        "processing_error_blocks": len(errors),
        "incomplete_triplets": len(incomplete_frame),
        "skipped_blocks": len(skipped),
        "trials_total": int(len(all_trials)),
        "trials_valid_core": int(all_trials.get("qc_valid_core", pd.Series(dtype=bool)).sum()),
        "manual_analysis_exclusions": list(MANUAL_ANALYSIS_EXCLUSIONS),
        "manual_analysis_exclusions_found": manual_analysis_exclusions_found,
        "analysis_master_rows": int(len(analysis_master)),
        "blocks_with_identical_raw_left_right_timestamps": int(
            all_blocks.get(
                "left_right_raw_timestamps_identical",
                pd.Series(dtype=bool),
            ).sum()
        ),
        "missing_timestamp_rows_total": int(
            all_blocks.get("left_missing_timestamp_rows", pd.Series(dtype=float)).sum()
            + all_blocks.get("right_missing_timestamp_rows", pd.Series(dtype=float)).sum()
        ),
        "duplicate_timestamps_total": int(
            all_blocks.get("left_duplicate_timestamps", pd.Series(dtype=float)).sum()
            + all_blocks.get("right_duplicate_timestamps", pd.Series(dtype=float)).sum()
        ),
        "nonmonotonic_intervals_total": int(
            all_blocks.get("left_nonmonotonic_intervals", pd.Series(dtype=float)).sum()
            + all_blocks.get("right_nonmonotonic_intervals", pd.Series(dtype=float)).sum()
        ),
        "timestamp_anomaly_blocks": int(len(timestamp_anomalies)),
        "peak_at_final_processed_sample_trials": int(
            all_trials.loc[
                all_trials.get("qc_valid_core", pd.Series(False, index=all_trials.index)),
                "peak_at_final_processed_sample",
            ].sum()
        ) if "peak_at_final_processed_sample" in all_trials else 0,
        "zero_internal_velocity_peak_trials": int(
            (
                all_trials.loc[
                    all_trials.get("qc_valid_core", pd.Series(False, index=all_trials.index)),
                    "velocity_peak_count_abs20_sep150",
                ] == 0
            ).sum()
        ) if "velocity_peak_count_abs20_sep150" in all_trials else 0,
        "sparc_endpoint_valid_trials": int(
            all_trials.get("sparc_endpoint_valid", pd.Series(dtype=bool)).sum()
        ),
        "target_mapping_failure_trials": int(
            all_trials.get("qc_reason", pd.Series(dtype=str)).str.contains(
                "target_number_coordinate_mismatch|target_coordinate_unstable|target_geometry_unavailable",
                regex=True,
                na=False,
            ).sum()
        ),
        "maximum_absolute_target_angle_error_deg": float(
            pd.to_numeric(
                all_trials.get("target_angle_error_deg", pd.Series(dtype=float)),
                errors="coerce",
            ).abs().max()
        ) if "target_angle_error_deg" in all_trials else np.nan,
    }
    (args.output / "batch_summary.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
