#!/usr/bin/env python3
"""Find which Beach Noir source track appears under an authored teaser."""

from __future__ import annotations

import argparse
import glob
import os
import subprocess

import numpy as np


RATE = 2000


def decode(path: str) -> np.ndarray:
    raw = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            path,
            "-map",
            "0:a:0",
            "-ac",
            "1",
            "-ar",
            str(RATE),
            "-f",
            "f32le",
            "pipe:1",
        ]
    )
    signal = np.frombuffer(raw, dtype="<f4").astype(np.float64)
    # A first difference removes DC and most slow gain changes while preserving the
    # exact musical waveform strongly enough to survive AAC/MP3 transcoding.
    signal = np.diff(signal)
    peak = np.max(np.abs(signal)) or 1.0
    return signal / peak


def best_match(track: np.ndarray, query: np.ndarray) -> tuple[float, int]:
    if len(track) < len(query):
        return 0.0, 0

    q = query - np.mean(query)
    q_norm = np.linalg.norm(q) or 1.0
    size = len(track) + len(q) - 1
    nfft = 1 << (size - 1).bit_length()
    corr = np.fft.irfft(
        np.fft.rfft(track, nfft) * np.fft.rfft(q[::-1], nfft), nfft
    )
    dots = corr[len(q) - 1 : len(track)]

    sums = np.concatenate(([0.0], np.cumsum(track)))
    sums2 = np.concatenate(([0.0], np.cumsum(track * track)))
    window_sum = sums[len(q) :] - sums[: -len(q)]
    window_sum2 = sums2[len(q) :] - sums2[: -len(q)]
    variance = np.maximum(window_sum2 - (window_sum * window_sum) / len(q), 1e-12)
    scores = np.abs(dots) / (q_norm * np.sqrt(variance))
    index = int(np.argmax(scores))
    return float(scores[index]), index


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("teaser")
    parser.add_argument("music_dir")
    args = parser.parse_args()

    query = decode(args.teaser)
    results = []
    for path in sorted(glob.glob(os.path.join(args.music_dir, "*.mp3"))):
        score, index = best_match(decode(path), query)
        results.append((score, index / RATE, path))

    for score, offset, path in sorted(results, reverse=True)[:10]:
        print(f"{score:.6f}\t{offset:8.3f}s\t{os.path.basename(path)}")


if __name__ == "__main__":
    main()
