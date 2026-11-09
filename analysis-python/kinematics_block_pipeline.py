#!/usr/bin/env python3
"""Validate and process one behavioural/kinematic block.

The script deliberately keeps processing decisions in one configuration object
and writes trial-level audit fields alongside the kinematic outcomes.  It is the
first, block-level stage of the patient-study kinematics pipeline.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.signal import butter, find_peaks, sosfiltfilt


PIPELINE_VERSION = "2026-08-09-coordinate-audit-v5"
PRIMARY_ONSET_RULE = "first_sustained_hybrid_run_reaching_logged_home_exit"
TARGET_ANGLES_DEG = np.arange(-40.0, 40.0 + 8.0, 8.0)


@dataclass(frozen=True)
class Config:
    resample_hz: float = 90.0
    filter_order: int = 2
    filter_cutoff_hz: float = 6.0
    onset_absolute_m_s: float = 0.02
    onset_relative_peak: float = 0.05
    onset_sustain_s: float = 0.05
    pre_target_baseline_s: float = 0.30
    filter_guard_s: float = 0.20
    maximum_gap_ms: float = 50.0
    maximum_raw_position_step_m: float = 0.10
    target_mapping_tolerance_deg: float = 0.50
    target_position_stability_tolerance_m: float = 0.005
    minimum_core_samples: int = 8
    peak_prominence_m_s: float = 0.02
    peak_minimum_separation_s: float = 0.15
    sparc_cutoff_hz: float = 10.0
    sparc_amplitude_threshold: float = 0.05
    sparc_padding_level: int = 4
    sparc_maximum_endpoint_speed_fraction: float = 0.10


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--behaviour", required=True, type=Path)
    parser.add_argument("--left", required=True, type=Path)
    parser.add_argument("--right", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--resample-hz", type=float, default=90.0)
    parser.add_argument("--filter-cutoff-hz", type=float, default=6.0)
    return parser.parse_args()


def load_inputs(behaviour_path: Path, left_path: Path, right_path: Path):
    behaviour = pd.read_csv(behaviour_path)
    left = pd.read_csv(left_path)
    right = pd.read_csv(right_path)

    required_behaviour = {
        "Trial", "Timestamp", "Target", "Hand", "DecisionTime",
        "TotalMovementTime",
    }
    required_kinematics = {
        "Timestamp", "HandX", "HandY", "HandZ",
        "HomeX", "HomeY", "HomeZ", "TargetX", "TargetY", "TargetZ",
    }
    missing_b = required_behaviour.difference(behaviour.columns)
    missing_l = required_kinematics.difference(left.columns)
    missing_r = required_kinematics.difference(right.columns)
    if missing_b or missing_l or missing_r:
        raise ValueError(
            f"Missing columns. behaviour={sorted(missing_b)}, "
            f"left={sorted(missing_l)}, right={sorted(missing_r)}"
        )

    behaviour = behaviour.sort_values("Trial").reset_index(drop=True)

    # Keep a record of timestamp problems before sorting or de-duplicating.  The
    # earlier implementation cleaned first, which meant the audit could not
    # reveal an out-of-order or duplicate timestamp even if one existed.
    original_timestamps = {}
    timestamp_audits = {}
    for label, frame in (("LEFT", left), ("RIGHT", right)):
        timestamp = pd.to_numeric(frame["Timestamp"], errors="coerce").to_numpy(float)
        position = (
            frame[["HandX", "HandY", "HandZ"]]
            .apply(pd.to_numeric, errors="coerce")
            .to_numpy(float)
        )
        original_timestamps[label] = timestamp.copy()
        finite_timestamp = timestamp[np.isfinite(timestamp)]
        original_intervals = np.diff(finite_timestamp)

        finite_rows = np.isfinite(timestamp) & np.all(np.isfinite(position), axis=1)
        audit_frame = pd.DataFrame(
            {
                "Timestamp": timestamp[finite_rows],
                "HandX": position[finite_rows, 0],
                "HandY": position[finite_rows, 1],
                "HandZ": position[finite_rows, 2],
            }
        )
        duplicate_value_count = 0
        duplicate_values_with_position_disagreement = 0
        maximum_duplicate_position_difference_m = 0.0
        for _, duplicate_group in audit_frame.groupby("Timestamp", sort=False):
            if len(duplicate_group) < 2:
                continue
            duplicate_value_count += 1
            duplicate_position = duplicate_group[["HandX", "HandY", "HandZ"]].to_numpy(float)
            pairwise_difference = duplicate_position[:, None, :] - duplicate_position[None, :, :]
            maximum_difference = float(
                np.max(np.linalg.norm(pairwise_difference, axis=2))
            )
            maximum_duplicate_position_difference_m = max(
                maximum_duplicate_position_difference_m,
                maximum_difference,
            )
            if maximum_difference > 1e-6:
                duplicate_values_with_position_disagreement += 1

        original_interval_all_rows = np.diff(timestamp)
        reversal_indices = np.flatnonzero(
            np.isfinite(original_interval_all_rows) & (original_interval_all_rows < 0)
        )
        if len(reversal_indices):
            reversal_position_steps = np.linalg.norm(
                position[reversal_indices + 1] - position[reversal_indices],
                axis=1,
            )
            maximum_reversal_ms = float(np.max(-original_interval_all_rows[reversal_indices]))
            maximum_reversal_position_step_m = float(
                np.nanmax(reversal_position_steps)
            )
        else:
            maximum_reversal_ms = 0.0
            maximum_reversal_position_step_m = 0.0
        timestamp_audits[label] = {
            "original_n_samples": int(len(frame)),
            "missing_timestamp_rows": int(np.sum(~np.isfinite(timestamp))),
            "duplicate_timestamps": int(pd.Series(finite_timestamp).duplicated().sum()),
            "duplicate_timestamp_values": int(duplicate_value_count),
            "duplicate_timestamp_values_with_position_disagreement": int(
                duplicate_values_with_position_disagreement
            ),
            "maximum_duplicate_position_difference_m": float(
                maximum_duplicate_position_difference_m
            ),
            "nonmonotonic_intervals": int(np.sum(original_intervals < 0)),
            "maximum_timestamp_reversal_ms": maximum_reversal_ms,
            "maximum_reversal_position_step_m": maximum_reversal_position_step_m,
            "nonpositive_intervals": int(np.sum(original_intervals <= 0)),
        }

    raw_timestamps_identical = bool(
        np.array_equal(
            original_timestamps["LEFT"],
            original_timestamps["RIGHT"],
            equal_nan=True,
        )
    )

    cleaned_by_hand = {}
    for label, frame in (("LEFT", left), ("RIGHT", right)):
        cleaned = frame.copy()
        cleaned["Timestamp"] = pd.to_numeric(cleaned["Timestamp"], errors="coerce")
        cleaned = (
            cleaned.loc[cleaned["Timestamp"].notna()]
            .sort_values("Timestamp", kind="stable")
            .drop_duplicates("Timestamp", keep="first")
            .reset_index(drop=True)
        )
        if len(cleaned) < 2:
            raise ValueError(f"{label} kinematics contain fewer than two usable timestamps")
        cleaned.attrs["timestamp_audit"] = timestamp_audits[label]
        cleaned.attrs["raw_left_right_timestamps_identical"] = raw_timestamps_identical
        cleaned_by_hand[label] = cleaned

    behaviour["Hand"] = behaviour["Hand"].astype(str).str.upper()
    return behaviour, cleaned_by_hand


def sampling_audit(frame: pd.DataFrame) -> dict[str, float | int]:
    timestamp = frame["Timestamp"].to_numpy(float)
    intervals = np.diff(timestamp)
    positive = intervals[intervals > 0]
    original = frame.attrs.get("timestamp_audit", {})
    return {
        "n_samples": int(len(frame)),
        "original_n_samples": int(original.get("original_n_samples", len(frame))),
        "missing_timestamp_rows": int(original.get("missing_timestamp_rows", 0)),
        "duplicate_timestamps": int(original.get("duplicate_timestamps", 0)),
        "duplicate_timestamp_values": int(
            original.get("duplicate_timestamp_values", 0)
        ),
        "duplicate_timestamp_values_with_position_disagreement": int(
            original.get("duplicate_timestamp_values_with_position_disagreement", 0)
        ),
        "maximum_duplicate_position_difference_m": float(
            original.get("maximum_duplicate_position_difference_m", 0.0)
        ),
        "nonmonotonic_intervals": int(original.get("nonmonotonic_intervals", 0)),
        "maximum_timestamp_reversal_ms": float(
            original.get("maximum_timestamp_reversal_ms", 0.0)
        ),
        "maximum_reversal_position_step_m": float(
            original.get("maximum_reversal_position_step_m", 0.0)
        ),
        "duration_s": float((timestamp[-1] - timestamp[0]) / 1000),
        "median_interval_ms": float(np.median(positive)),
        "median_rate_hz": float(1000 / np.median(positive)),
        "mean_interval_rate_hz": float(1000 / np.mean(positive)),
        "minimum_interval_ms": float(np.min(positive)),
        "maximum_interval_ms": float(np.max(positive)),
        "gaps_over_50_ms": int(np.sum(positive > 50)),
        "nonpositive_intervals": int(original.get("nonpositive_intervals", 0)),
        "processed_nonpositive_intervals": int(np.sum(intervals <= 0)),
    }


def make_uniform_signal(frame: pd.DataFrame, config: Config, cutoff_hz: float | None = None):
    cutoff = config.filter_cutoff_hz if cutoff_hz is None else cutoff_hz
    raw_time_s = frame["Timestamp"].to_numpy(float) / 1000
    raw_position = frame[["HandX", "HandY", "HandZ"]].to_numpy(float)
    step_s = 1 / config.resample_hz
    uniform_time_s = np.arange(raw_time_s[0], raw_time_s[-1] + step_s / 2, step_s)
    uniform_position = np.column_stack(
        [np.interp(uniform_time_s, raw_time_s, raw_position[:, axis]) for axis in range(3)]
    )
    sos = butter(
        config.filter_order,
        cutoff,
        btype="lowpass",
        fs=config.resample_hz,
        output="sos",
    )
    filtered_position = sosfiltfilt(sos, uniform_position, axis=0)
    velocity = np.gradient(filtered_position, uniform_time_s, axis=0)
    speed = np.linalg.norm(velocity, axis=1)
    return {
        "time_s": uniform_time_s,
        "position": filtered_position,
        "velocity": velocity,
        "speed": speed,
        "raw_time_s": raw_time_s,
        "raw_position": raw_position,
    }


def first_sustained_crossing(
    time_s: np.ndarray,
    speed: np.ndarray,
    search_start_s: float,
    search_end_s: float,
    threshold_m_s: float,
    sustain_s: float,
) -> float:
    mask = (time_s >= search_start_s) & (time_s <= search_end_s)
    indices = np.flatnonzero(mask)
    if len(indices) == 0:
        return np.nan
    above = speed[indices] >= threshold_m_s
    transitions = np.diff(np.r_[False, above, False].astype(int))
    starts = np.flatnonzero(transitions == 1)
    ends = np.flatnonzero(transitions == -1)  # exclusive
    for start, end in zip(starts, ends):
        # Duration is measured between the first and final samples in the run.
        # At 90 Hz, five samples span only 44.4 ms; six are needed to meet a
        # literal >=50-ms requirement.
        if end > start and time_s[indices[end - 1]] - time_s[indices[start]] >= sustain_s:
            return float(time_s[indices[start]])
    return np.nan


def first_sustained_crossing_reaching_anchor(
    time_s: np.ndarray,
    speed: np.ndarray,
    search_start_s: float,
    search_end_s: float,
    anchor_s: float,
    threshold_m_s: float,
    sustain_s: float,
) -> float:
    """Return the first sustained movement run associated with home departure.

    A trial can contain brief selected-hand motion inside the home area before
    the task's logged home-exit event.  Conversely, choosing the final
    threshold crossing before the largest speed peak can discard genuine early
    attempts in an intermittent reach.  This rule chooses the start of the
    first sustained above-threshold run whose end reaches or passes the logged
    home-exit time.  It therefore ignores completed pre-exit adjustments while
    retaining the full post-departure movement, pauses and corrections.
    """
    mask = (time_s >= search_start_s) & (time_s <= search_end_s)
    indices = np.flatnonzero(mask)
    if len(indices) == 0 or not np.isfinite(anchor_s):
        return np.nan
    above = speed[indices] >= threshold_m_s

    transitions = np.diff(np.r_[False, above, False].astype(int))
    starts = np.flatnonzero(transitions == 1)
    ends = np.flatnonzero(transitions == -1)  # exclusive
    anchor_s = float(np.clip(anchor_s, search_start_s, search_end_s))
    for start, end in zip(starts, ends):
        if end <= start:
            continue
        run_duration_s = time_s[indices[end - 1]] - time_s[indices[start]]
        if run_duration_s >= sustain_s and time_s[indices[end - 1]] >= anchor_s:
            return float(time_s[indices[start]])
    return np.nan


def backtracked_peak_onset(
    time_s: np.ndarray,
    speed: np.ndarray,
    search_start_s: float,
    search_end_s: float,
    threshold_m_s: float,
) -> float:
    """Find the final threshold crossing before the trial's main speed peak.

    Looking backwards from the main peak avoids labelling small movements inside
    the home area as the start of the reach.
    """
    indices = np.flatnonzero((time_s >= search_start_s) & (time_s <= search_end_s))
    if len(indices) < 2:
        return np.nan
    local_peak = int(np.argmax(speed[indices]))
    peak_index = int(indices[local_peak])
    before_peak = indices[indices <= peak_index]
    below = before_peak[speed[before_peak] < threshold_m_s]
    if len(below) == 0:
        return float(time_s[before_peak[0]])
    onset_index = int(below[-1] + 1)
    if onset_index > peak_index:
        return np.nan
    return float(time_s[onset_index])


def spectral_arc_length(
    speed: np.ndarray,
    sampling_rate_hz: float,
    padlevel: int = 4,
    cutoff_hz: float = 10.0,
    amplitude_threshold: float = 0.05,
) -> float:
    """Modified SPARC, following the authors' public reference implementation."""
    speed = np.asarray(speed, dtype=float)
    if len(speed) < 4 or not np.all(np.isfinite(speed)) or np.max(speed) <= 0:
        return np.nan
    nfft = int(2 ** (np.ceil(np.log2(len(speed))) + padlevel))
    magnitude = np.abs(np.fft.fft(speed, nfft))
    magnitude /= np.max(magnitude)
    frequency = np.arange(0, sampling_rate_hz, sampling_rate_hz / nfft)
    selected = frequency <= cutoff_hz
    frequency = frequency[selected]
    magnitude = magnitude[selected]
    above = np.flatnonzero(magnitude >= amplitude_threshold)
    if len(above) == 0:
        return np.nan
    first_index = int(above[0])
    final_index = int(min(len(frequency) - 1, above[-1]))
    frequency = frequency[first_index : final_index + 1]
    magnitude = magnitude[first_index : final_index + 1]
    if len(frequency) < 2 or frequency[-1] == frequency[0]:
        return np.nan
    return float(
        -np.sum(
            np.sqrt(
                (np.diff(frequency) / (frequency[-1] - frequency[0])) ** 2
                + np.diff(magnitude) ** 2
            )
        )
    )


def raw_gap_within(frame: pd.DataFrame, start_ms: float, end_ms: float) -> tuple[int, float]:
    timestamp = frame["Timestamp"].to_numpy(float)
    selected = timestamp[(timestamp >= start_ms) & (timestamp <= end_ms)]
    if len(selected) < 2:
        return int(len(selected)), np.nan
    return int(len(selected)), float(np.max(np.diff(selected)))


def raw_movement_diagnostics(
    frame: pd.DataFrame,
    start_ms: float,
    end_ms: float,
) -> tuple[int, float, float]:
    timestamp = frame["Timestamp"].to_numpy(float)
    position = frame[["HandX", "HandY", "HandZ"]].to_numpy(float)
    within = (timestamp >= start_ms) & (timestamp <= end_ms)
    sample_count = int(np.sum(within))
    if len(timestamp) < 2:
        return sample_count, np.nan, np.nan

    # Include the raw sample pair that brackets each boundary.  Uniform samples
    # close to onset/contact can depend on those pairs, so a gap or jump crossing
    # a boundary must not be silently missed.
    pair_mask = (timestamp[:-1] <= end_ms) & (timestamp[1:] >= start_ms)
    if not np.any(pair_mask):
        return sample_count, np.nan, np.nan
    pair_intervals = np.diff(timestamp)[pair_mask]
    pair_steps = np.linalg.norm(np.diff(position, axis=0), axis=1)[pair_mask]
    return (
        sample_count,
        float(np.max(pair_intervals)),
        float(np.max(pair_steps)),
    )


def logged_position_audit(
    frame: pd.DataFrame,
    columns: tuple[str, str, str],
    start_ms: float,
    end_ms: float,
) -> tuple[np.ndarray | None, int, float]:
    """Summarise a logged 3-D position and quantify within-trial stability."""
    timestamp = frame["Timestamp"].to_numpy(float)
    mask = (timestamp >= start_ms) & (timestamp <= end_ms)
    values = (
        frame.loc[mask, list(columns)]
        .apply(pd.to_numeric, errors="coerce")
        .dropna()
        .to_numpy(float)
    )
    if len(values) == 0:
        return None, 0, np.nan
    centre = np.median(values, axis=0)
    maximum_deviation_m = float(np.max(np.linalg.norm(values - centre, axis=1)))
    return centre, int(len(values)), maximum_deviation_m


def expected_target_angle_deg(target_number: int) -> float:
    if target_number < 1 or target_number > len(TARGET_ANGLES_DEG):
        return np.nan
    return float(TARGET_ANGLES_DEG[target_number - 1])


def angular_difference_deg(observed: float, expected: float) -> float:
    if not np.isfinite(observed) or not np.isfinite(expected):
        return np.nan
    return float((observed - expected + 180.0) % 360.0 - 180.0)


def raw_speed_for_plot(frame: pd.DataFrame, start_s: float, end_s: float):
    time_s = frame["Timestamp"].to_numpy(float) / 1000
    position = frame[["HandX", "HandY", "HandZ"]].to_numpy(float)
    mask = (time_s >= start_s) & (time_s <= end_s)
    time_s = time_s[mask]
    position = position[mask]
    if len(time_s) < 3:
        return time_s, np.full(len(time_s), np.nan)
    raw_velocity = np.gradient(position, time_s, axis=0)
    return time_s, np.linalg.norm(raw_velocity, axis=1)


def process_trials(
    behaviour: pd.DataFrame,
    raw_by_hand: dict[str, pd.DataFrame],
    signal_by_hand: dict[str, dict[str, np.ndarray]],
    config: Config,
) -> pd.DataFrame:
    rows: list[dict] = []
    for trial in behaviour.itertuples(index=False):
        hand = str(trial.Hand).upper()
        contact_s = float(trial.Timestamp) / 1000
        target_onset_s = (float(trial.Timestamp) - float(trial.TotalMovementTime)) / 1000
        logged_exit_s = target_onset_s + float(trial.DecisionTime) / 1000
        signal = signal_by_hand.get(hand)
        raw = raw_by_hand.get(hand)
        row = {
            "trial": int(trial.Trial),
            "target": int(trial.Target),
            "hand": hand,
            "target_onset_s": target_onset_s,
            "logged_home_exit_s": logged_exit_s,
            "contact_s": contact_s,
            "logged_exit_to_contact_s": contact_s - logged_exit_s,
        }
        if signal is None or raw is None:
            row.update({"qc_valid_core": False, "qc_reason": "invalid_hand_label"})
            rows.append(row)
            continue

        time_s = signal["time_s"]
        speed = signal["speed"]
        position = signal["position"]
        decision_mask = (time_s >= target_onset_s) & (time_s <= contact_s)
        trial_peak = float(np.max(speed[decision_mask])) if np.any(decision_mask) else np.nan
        baseline_mask = (
            (time_s >= target_onset_s - config.pre_target_baseline_s)
            & (time_s < target_onset_s)
        )
        baseline_speed = speed[baseline_mask]
        baseline_median = float(np.median(baseline_speed)) if len(baseline_speed) else np.nan
        baseline_p95 = float(np.quantile(baseline_speed, 0.95)) if len(baseline_speed) else np.nan

        thresholds = {
            "onset_abs20_50_s": config.onset_absolute_m_s,
            "onset_rel5_50_s": config.onset_relative_peak * trial_peak,
            "onset_hybrid_50_s": max(
                config.onset_absolute_m_s,
                config.onset_relative_peak * trial_peak,
            ),
            "onset_rel10_100_s": 0.10 * trial_peak,
        }
        onset_values = {}
        for label, threshold in thresholds.items():
            sustain = 0.10 if label == "onset_rel10_100_s" else config.onset_sustain_s
            onset_values[label] = first_sustained_crossing(
                time_s,
                speed,
                target_onset_s,
                contact_s,
                threshold,
                sustain,
            )
        onset_values["onset_rel5_backtrack_s"] = backtracked_peak_onset(
            time_s,
            speed,
            target_onset_s,
            contact_s,
            config.onset_relative_peak * trial_peak,
        )
        onset_values["onset_hybrid_backtrack_s"] = backtracked_peak_onset(
            time_s,
            speed,
            target_onset_s,
            contact_s,
            max(config.onset_absolute_m_s, config.onset_relative_peak * trial_peak),
        )
        onset_values["onset_hybrid_home_exit_anchored_s"] = (
            first_sustained_crossing_reaching_anchor(
                time_s,
                speed,
                target_onset_s,
                contact_s,
                logged_exit_s,
                max(config.onset_absolute_m_s, config.onset_relative_peak * trial_peak),
                config.onset_sustain_s,
            )
        )
        row.update(onset_values)
        # Anchor sustained movement to the logged home-exit event. This ignores
        # selected-hand adjustments that finish before home exit without using
        # the main speed peak to discard early attempts in intermittent reaches.
        # Both alternatives remain in the output as sensitivity fields.
        onset_s = onset_values["onset_hybrid_home_exit_anchored_s"]

        (
            target_window_raw_count,
            target_window_maximum_gap_ms,
            target_window_maximum_step_m,
        ) = raw_movement_diagnostics(
            raw,
            target_onset_s * 1000,
            contact_s * 1000,
        )
        target_position, target_position_samples, target_position_maximum_deviation_m = (
            logged_position_audit(
                raw,
                ("TargetX", "TargetY", "TargetZ"),
                target_onset_s * 1000,
                contact_s * 1000,
            )
        )
        home_position, home_position_samples, home_position_maximum_deviation_m = (
            logged_position_audit(
                raw,
                ("HomeX", "HomeY", "HomeZ"),
                target_onset_s * 1000,
                contact_s * 1000,
            )
        )
        expected_angle_deg = expected_target_angle_deg(int(trial.Target))
        if target_position is not None:
            observed_angle_deg = float(
                np.degrees(np.arctan2(target_position[0], -target_position[2]))
            )
            target_radius_m = float(np.hypot(target_position[0], target_position[2]))
            target_angle_error_deg = angular_difference_deg(
                observed_angle_deg,
                expected_angle_deg,
            )
            closest_target_number = int(
                np.argmin(np.abs(TARGET_ANGLES_DEG - observed_angle_deg)) + 1
            )
        else:
            observed_angle_deg = np.nan
            target_radius_m = np.nan
            target_angle_error_deg = np.nan
            closest_target_number = np.nan
        row.update(
            {
                "trial_peak_over_target_window_m_s": trial_peak,
                "pre_target_speed_median_m_s": baseline_median,
                "pre_target_speed_p95_m_s": baseline_p95,
                "raw_samples_target_to_contact": target_window_raw_count,
                "maximum_raw_gap_target_to_contact_ms": target_window_maximum_gap_ms,
                "maximum_raw_position_step_target_to_contact_m": target_window_maximum_step_m,
                "logged_target_samples": target_position_samples,
                "logged_target_x_m": target_position[0] if target_position is not None else np.nan,
                "logged_target_y_m": target_position[1] if target_position is not None else np.nan,
                "logged_target_z_m": target_position[2] if target_position is not None else np.nan,
                "logged_target_radius_m": target_radius_m,
                "logged_target_angle_deg": observed_angle_deg,
                "expected_target_angle_deg": expected_angle_deg,
                "target_angle_error_deg": target_angle_error_deg,
                "logged_target_number_from_angle": closest_target_number,
                "maximum_logged_target_deviation_m": target_position_maximum_deviation_m,
                "logged_home_samples": home_position_samples,
                "logged_home_x_m": home_position[0] if home_position is not None else np.nan,
                "logged_home_y_m": home_position[1] if home_position is not None else np.nan,
                "logged_home_z_m": home_position[2] if home_position is not None else np.nan,
                "maximum_logged_home_deviation_m": home_position_maximum_deviation_m,
            }
        )

        reasons = []
        if not np.isfinite(onset_s):
            reasons.append("onset_not_detected")
        if not (time_s[0] <= target_onset_s < contact_s <= time_s[-1]):
            reasons.append("event_outside_kinematics")
        if target_window_raw_count < 2:
            reasons.append("insufficient_raw_samples")
        if not np.isfinite(expected_angle_deg):
            reasons.append("target_number_out_of_range")
        if target_position is None:
            reasons.append("target_geometry_unavailable")
        else:
            if (
                np.isfinite(target_position_maximum_deviation_m)
                and target_position_maximum_deviation_m
                > config.target_position_stability_tolerance_m
            ):
                reasons.append("target_coordinate_unstable")
            if (
                np.isfinite(target_angle_error_deg)
                and abs(target_angle_error_deg) > config.target_mapping_tolerance_deg
            ):
                reasons.append("target_number_coordinate_mismatch")
        if (
            np.isfinite(target_window_maximum_step_m)
            and target_window_maximum_step_m > config.maximum_raw_position_step_m
        ):
            # Onset detection and the relative threshold use the complete
            # target-onset-to-contact signal. A tracking jump anywhere in that
            # window can therefore bias the selected movement interval.
            reasons.append("raw_position_jump_in_target_window")

        if np.isfinite(onset_s) and time_s[0] <= onset_s < contact_s <= time_s[-1]:
            movement_raw_count, maximum_gap_ms, maximum_step_m = raw_movement_diagnostics(
                raw,
                onset_s * 1000,
                contact_s * 1000,
            )
            guard_start_s = max(target_onset_s, onset_s - config.filter_guard_s)
            (
                guard_raw_count,
                guard_maximum_gap_ms,
                guard_maximum_step_m,
            ) = raw_movement_diagnostics(
                raw,
                guard_start_s * 1000,
                contact_s * 1000,
            )
            row.update(
                {
                    "raw_samples_onset_to_contact": movement_raw_count,
                    "maximum_raw_gap_onset_to_contact_ms": maximum_gap_ms,
                    "maximum_raw_position_step_onset_to_contact_m": maximum_step_m,
                    "filter_guard_start_s": guard_start_s,
                    "raw_samples_filter_guard_to_contact": guard_raw_count,
                    "maximum_raw_gap_filter_guard_to_contact_ms": guard_maximum_gap_ms,
                    "maximum_raw_position_step_filter_guard_to_contact_m": guard_maximum_step_m,
                }
            )
            if (
                np.isfinite(guard_maximum_gap_ms)
                and guard_maximum_gap_ms > config.maximum_gap_ms
            ):
                reasons.append("sampling_gap_within_filter_guard")
            if movement_raw_count < 2:
                reasons.append("insufficient_movement_samples")

        if not reasons:
            movement_mask = (time_s >= onset_s) & (time_s <= contact_s)
            movement_indices = np.flatnonzero(movement_mask)
            movement_time = time_s[movement_mask]
            movement_speed = speed[movement_mask]
            movement_position = position[movement_mask]
            if len(movement_time) < config.minimum_core_samples:
                reasons.append("insufficient_processed_samples")
            else:
                displacement = float(np.linalg.norm(movement_position[-1] - movement_position[0]))
                path_length = float(np.sum(np.linalg.norm(np.diff(movement_position, axis=0), axis=1)))
                if not np.isfinite(path_length) or path_length <= 0:
                    reasons.append("invalid_path_length")
                peak_indices, _ = find_peaks(
                    movement_speed,
                    prominence=config.peak_prominence_m_s,
                    distance=max(1, round(config.peak_minimum_separation_s * config.resample_hz)),
                )
                relative_peak_indices, _ = find_peaks(
                    movement_speed,
                    prominence=0.10 * float(np.max(movement_speed)),
                    distance=max(1, round(0.10 * config.resample_hz)),
                )
                # Use the final processed sample at or before behavioural contact.
                # The nearest uniform sample can fall just after contact and can
                # therefore produce a logically impossible fraction above 1.0.
                endpoint_index = int(movement_indices[-1])
                peak_index_within_movement = int(np.argmax(movement_speed))
                endpoint_speed_fraction = float(
                    movement_speed[-1] / np.max(movement_speed)
                )
                sparc_unvalidated = spectral_arc_length(
                    movement_speed,
                    config.resample_hz,
                    config.sparc_padding_level,
                    config.sparc_cutoff_hz,
                    config.sparc_amplitude_threshold,
                )
                sparc_endpoint_valid = (
                    endpoint_speed_fraction <= config.sparc_maximum_endpoint_speed_fraction
                )
                row.update(
                    {
                        "kinematic_onset_s": onset_s,
                        "movement_duration_s": contact_s - onset_s,
                        "processed_samples": int(len(movement_time)),
                        "peak_velocity_m_s": float(np.max(movement_speed)),
                        "straight_displacement_m": displacement,
                        "path_length_m": path_length,
                        "path_efficiency": displacement / path_length if path_length > 0 else np.nan,
                        "sparc_unvalidated": sparc_unvalidated,
                        "sparc_endpoint_valid": sparc_endpoint_valid,
                        "sparc": sparc_unvalidated if sparc_endpoint_valid else np.nan,
                        "velocity_peak_count_abs20_sep150": int(len(peak_indices)),
                        "velocity_peak_count_rel10_sep100": int(len(relative_peak_indices)),
                        "speed_at_contact_m_s": float(speed[endpoint_index]),
                        "contact_speed_fraction_of_peak": endpoint_speed_fraction,
                        "final_processed_sample_s": float(movement_time[-1]),
                        "final_sample_before_contact_ms": float(
                            (contact_s - movement_time[-1]) * 1000
                        ),
                        "peak_at_final_processed_sample": bool(
                            peak_index_within_movement == len(movement_speed) - 1
                        ),
                        "peak_time_before_contact_s": float(
                            contact_s - movement_time[peak_index_within_movement]
                        ),
                        "kinematic_onset_minus_logged_exit_s": onset_s - logged_exit_s,
                        "fingertip_endpoint_to_target_distance_m": float(
                            np.linalg.norm(movement_position[-1] - target_position)
                        ),
                    }
                )

        row["qc_valid_core"] = not reasons
        row["qc_reason"] = ";".join(reasons) if reasons else "valid"
        rows.append(row)
    return pd.DataFrame(rows)


def choose_plot_trials(metrics: pd.DataFrame, maximum: int = 12) -> list[int]:
    valid = metrics[metrics["qc_valid_core"]].copy()
    if len(valid) <= maximum:
        return valid["trial"].astype(int).tolist()
    disagreement_size = pd.concat(
        [
            (valid["onset_hybrid_backtrack_s"] - valid["kinematic_onset_s"]).abs(),
            (valid["onset_hybrid_50_s"] - valid["kinematic_onset_s"]).abs(),
        ],
        axis=1,
    ).max(axis=1)
    disagreement = valid[disagreement_size > 0.05]
    selected = disagreement["trial"].astype(int).tolist()
    valid["target_zone"] = pd.cut(
        valid["target"], bins=[0, 3, 8, 11], labels=["left", "central", "right"]
    )
    valid["duration_band"] = pd.qcut(
        valid["movement_duration_s"], q=3, labels=["short", "typical", "long"], duplicates="drop"
    )
    for _, group in valid.groupby(["hand", "target_zone", "duration_band"], observed=True):
        middle = group.iloc[len(group) // 2]
        candidate = int(middle["trial"])
        if candidate not in selected:
            selected.append(candidate)
    if len(selected) < maximum:
        remaining = valid[~valid["trial"].isin(selected)]
        evenly_spaced = np.linspace(0, len(remaining) - 1, maximum - len(selected)).round().astype(int)
        selected.extend(remaining.iloc[evenly_spaced]["trial"].astype(int).tolist())
    return selected[:maximum]


def plot_speed_profiles(
    metrics: pd.DataFrame,
    behaviour: pd.DataFrame,
    raw_by_hand: dict[str, pd.DataFrame],
    signal_by_hand: dict[str, dict[str, np.ndarray]],
    output_path: Path,
):
    selected = choose_plot_trials(metrics)
    columns = 3
    rows = int(math.ceil(len(selected) / columns))
    fig, axes = plt.subplots(rows, columns, figsize=(14, 3.5 * rows), squeeze=False)
    for axis, trial_number in zip(axes.flat, selected):
        metric = metrics.loc[metrics["trial"] == trial_number].iloc[0]
        hand = metric["hand"]
        signal = signal_by_hand[hand]
        display_start = metric["target_onset_s"] - 0.20
        display_end = metric["contact_s"] + 0.08
        mask = (signal["time_s"] >= display_start) & (signal["time_s"] <= display_end)
        raw_time, raw_speed = raw_speed_for_plot(raw_by_hand[hand], display_start, display_end)
        relative_raw_time = raw_time - metric["target_onset_s"]
        relative_time = signal["time_s"][mask] - metric["target_onset_s"]
        axis.plot(relative_raw_time, raw_speed, color="0.75", linewidth=0.8, label="Raw speed")
        axis.plot(relative_time, signal["speed"][mask], color="#1f77b4", linewidth=1.8, label="Filtered speed")
        axis.axvline(0, color="black", linestyle=":", linewidth=1, label="Target onset")
        axis.axvline(
            metric["logged_home_exit_s"] - metric["target_onset_s"],
            color="#ff7f0e",
            linestyle="--",
            linewidth=1.2,
            label="Logged home exit",
        )
        if np.isfinite(metric.get("kinematic_onset_s", np.nan)):
            axis.axvline(
                metric["kinematic_onset_s"] - metric["target_onset_s"],
                color="#2ca02c",
                linestyle="--",
                linewidth=1.2,
                label="Kinematic onset",
            )
        for column, color, label in (
            (
                "onset_hybrid_50_s",
                "#8c564b",
                "First sustained from target (sensitivity)",
            ),
            (
                "onset_hybrid_backtrack_s",
                "#9467bd",
                "Main-peak onset (sensitivity)",
            ),
        ):
            candidate = pd.to_numeric(metric.get(column), errors="coerce")
            if (
                np.isfinite(candidate)
                and np.isfinite(metric.get("kinematic_onset_s", np.nan))
                and abs(candidate - metric["kinematic_onset_s"]) > 1 / 90
            ):
                axis.axvline(
                    candidate - metric["target_onset_s"],
                    color=color,
                    linestyle=":",
                    linewidth=1.0,
                    label=label,
                )
        axis.axvline(
            metric["contact_s"] - metric["target_onset_s"],
            color="#d62728",
            linestyle="-.",
            linewidth=1.2,
            label="Contact",
        )
        axis.set_title(
            f"Trial {trial_number}: {hand}, target {int(metric['target'])}\n"
            f"duration={metric.get('movement_duration_s', np.nan):.3f} s"
        )
        axis.set_xlabel("Time from target onset (s)")
        axis.set_ylabel("Resultant speed (m/s)")
        axis.set_ylim(bottom=0)
    for axis in axes.flat[len(selected):]:
        axis.axis("off")
    handles, labels = axes.flat[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", ncol=6, frameon=False)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    fig.savefig(output_path, dpi=180)
    plt.close(fig)


def sensitivity_analysis(
    behaviour: pd.DataFrame,
    raw_by_hand: dict[str, pd.DataFrame],
    base_config: Config,
) -> pd.DataFrame:
    frames = []
    for resample_hz in (80.0, 90.0, 100.0):
        for cutoff_hz in (4.0, 6.0, 8.0):
            config = Config(**{**asdict(base_config), "resample_hz": resample_hz, "filter_cutoff_hz": cutoff_hz})
            signals = {
                hand: make_uniform_signal(frame, config)
                for hand, frame in raw_by_hand.items()
            }
            trial_metrics = process_trials(behaviour, raw_by_hand, signals, config)
            trial_metrics.insert(0, "filter_cutoff_hz", cutoff_hz)
            trial_metrics.insert(0, "resample_hz", resample_hz)
            frames.append(trial_metrics)
    return pd.concat(frames, ignore_index=True)


def summary_from_metrics(metrics: pd.DataFrame) -> dict:
    valid = metrics[metrics["qc_valid_core"]]
    onset_columns = [
        "onset_abs20_50_s", "onset_rel5_50_s", "onset_hybrid_50_s", "onset_rel10_100_s",
        "onset_rel5_backtrack_s", "onset_hybrid_backtrack_s",
        "onset_hybrid_home_exit_anchored_s",
    ]
    onset_summary = {}
    for column in onset_columns:
        detected = metrics[column].notna()
        onset_summary[column] = {
            "detected_n": int(detected.sum()),
            "median_minus_logged_exit_ms": float(
                np.nanmedian((metrics[column] - metrics["logged_home_exit_s"]) * 1000)
            ),
            "median_after_target_onset_ms": float(
                np.nanmedian((metrics[column] - metrics["target_onset_s"]) * 1000)
            ),
        }
    return {
        "trials_total": int(len(metrics)),
        "trials_valid_core": int(len(valid)),
        "trials_invalid_core": int(len(metrics) - len(valid)),
        "qc_reason_counts": metrics["qc_reason"].value_counts(dropna=False).to_dict(),
        "hands": metrics["hand"].value_counts().to_dict(),
        "onset_candidates": onset_summary,
        "primary_metric_medians": {
            column: float(valid[column].median())
            for column in [
                "movement_duration_s", "peak_velocity_m_s", "path_efficiency",
                "sparc_unvalidated",
                "velocity_peak_count_abs20_sep150", "speed_at_contact_m_s",
                "contact_speed_fraction_of_peak",
            ]
            if column in valid
        },
        "target_mapping": {
            "failure_n": int(
                metrics["qc_reason"].str.contains(
                    "target_number_coordinate_mismatch|target_coordinate_unstable|target_geometry_unavailable",
                    regex=True,
                    na=False,
                ).sum()
            ),
            "maximum_absolute_angle_error_deg": float(
                pd.to_numeric(metrics["target_angle_error_deg"], errors="coerce")
                .abs()
                .max()
            ),
            "maximum_logged_target_deviation_m": float(
                pd.to_numeric(
                    metrics["maximum_logged_target_deviation_m"],
                    errors="coerce",
                ).max()
            ),
        },
        "median_fingertip_endpoint_to_target_distance_m": float(
            pd.to_numeric(
                valid.get(
                    "fingertip_endpoint_to_target_distance_m",
                    pd.Series(dtype=float),
                ),
                errors="coerce",
            ).median()
        ),
        "sparc_endpoint_valid_n": int(valid.get("sparc_endpoint_valid", pd.Series(dtype=bool)).sum()),
    }


def main():
    args = parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    config = Config(resample_hz=args.resample_hz, filter_cutoff_hz=args.filter_cutoff_hz)
    behaviour, raw_by_hand = load_inputs(args.behaviour, args.left, args.right)
    signals = {hand: make_uniform_signal(frame, config) for hand, frame in raw_by_hand.items()}
    metrics = process_trials(behaviour, raw_by_hand, signals, config)
    sensitivity = sensitivity_analysis(behaviour, raw_by_hand, config)
    metrics.insert(0, "pipeline_version", PIPELINE_VERSION)
    sensitivity.insert(0, "pipeline_version", PIPELINE_VERSION)

    metrics.to_csv(args.output / "trial_metrics_primary.csv", index=False)
    sensitivity.to_csv(args.output / "trial_metrics_sensitivity.csv", index=False)
    plot_speed_profiles(
        metrics,
        behaviour,
        raw_by_hand,
        signals,
        args.output / "representative_speed_profiles.png",
    )

    audit = {
        "pipeline_version": PIPELINE_VERSION,
        "primary_onset_rule": PRIMARY_ONSET_RULE,
        "configuration": asdict(config),
        "sampling": {hand: sampling_audit(frame) for hand, frame in raw_by_hand.items()},
        "left_right_timestamps_identical": bool(
            np.array_equal(raw_by_hand["LEFT"]["Timestamp"], raw_by_hand["RIGHT"]["Timestamp"])
        ),
        "left_right_raw_timestamps_identical": bool(
            raw_by_hand["LEFT"].attrs.get("raw_left_right_timestamps_identical", False)
        ),
        "metrics": summary_from_metrics(metrics),
    }
    (args.output / "block_audit.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
