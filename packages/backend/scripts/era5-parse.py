#!/usr/bin/env python3
"""
Read an ERA5 file (GRIB or NetCDF) from CDS and emit NDJSON to stdout.
Usage: python3 era5-parse.py <path>
       python3 era5-parse.py --selftest   (sanity-checks the Bangkok-day bucketing logic)

Output — one JSON line per (date, lat, lng), where `date` is a Bangkok calendar day
(Asia/Bangkok, UTC+7, no DST) — matches weather_readings.date, not a UTC calendar day:
  {"date": "2025-01-15", "lat": 15.0, "lng": 100.25, "u10": 2.3, "v10": -1.1, "r": 75.0, "tp_mm": 2.5}

Variables expected:
  u10, v10      — 10m wind components (m/s) at 07:00 UTC
  t2m, d2m      — 2m temperature + dewpoint (K) → used to compute relative humidity
  tp            — total precipitation (m, accumulated from forecast run start)

Relative humidity is computed via the Magnus formula from t2m + d2m.
For NetCDF files that contain r/r2 directly and lack t2m/d2m, those are used as fallback.

GRIB support requires: pip install cfgrib eccodes
NetCDF support requires: pip install xarray netcdf4 numpy
"""
import sys
import json
from collections import defaultdict

import numpy as np


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_grib(path: str) -> bool:
    with open(path, 'rb') as f:
        return f.read(4) == b'GRIB'


def compute_rh(t2m_k: np.ndarray, d2m_k: np.ndarray) -> np.ndarray:
    """Relative humidity (%) from 2m temperature and dewpoint (Kelvin), Magnus formula."""
    T  = t2m_k - 273.15
    Td = d2m_k - 273.15
    rh = 100.0 * np.exp(17.625 * Td / (243.04 + Td)) / np.exp(17.625 * T / (243.04 + T))
    return np.clip(rh, 0.0, 100.0)


def extract_da(da):
    """
    Return (list[pd.Timestamp], ndarray shape (T, lat, lng)) from a cfgrib/xarray DataArray.
    Handles both 1-D valid_time and 2-D valid_time (time × step) structures.
    """
    import pandas as pd
    if 'valid_time' not in da.coords:
        raise ValueError(f"No valid_time coordinate on '{da.name}'. Coords: {list(da.coords)}")
    vt = da.coords['valid_time'].values
    times = [pd.Timestamp(t) for t in vt.flat]
    data  = da.values.reshape(-1, *da.shape[-2:])  # → (T, lat, lng)
    return times, data


# ---------------------------------------------------------------------------
# Format-specific loaders
# Each returns: (times_instant, times_tp, lats, lngs, u10, v10, rh, tp)
#   times_instant — list[Timestamp] length T_instant
#   times_tp      — list[Timestamp] length T_tp (may differ from T_instant)
#   lats, lngs    — 1-D float arrays
#   u10, v10, rh  — ndarray (T_instant, lat, lng)
#   tp            — ndarray (T_tp, lat, lng), accumulated metres
# ---------------------------------------------------------------------------

def load_grib(path: str):
    import cfgrib

    all_ds = cfgrib.open_datasets(path)

    found = {name: None for name in ('u10', 'v10', 't2m', 'd2m', 'tp')}
    for ds in all_ds:
        for name in found:
            if found[name] is None and name in ds:
                found[name] = ds[name]

    for name in ('u10', 'v10', 'tp'):
        if found[name] is None:
            print(f"[era5-parse] ERROR: variable '{name}' not found in GRIB file", file=sys.stderr)
            sys.exit(1)

    lats = found['u10'].latitude.values
    lngs = found['u10'].longitude.values

    times_instant, u10 = extract_da(found['u10'])
    _,              v10 = extract_da(found['v10'])
    times_tp,       tp  = extract_da(found['tp'])

    if found['t2m'] is not None and found['d2m'] is not None:
        _, t2m = extract_da(found['t2m'])
        _, d2m = extract_da(found['d2m'])
        rh = compute_rh(t2m, d2m)
    else:
        print("[era5-parse] WARNING: t2m/d2m not found — RH will be null", file=sys.stderr)
        rh = np.full_like(u10, np.nan)

    return times_instant, times_tp, lats, lngs, u10, v10, rh, tp


def load_netcdf(path: str):
    import pandas as pd
    import xarray as xr

    ds = xr.open_dataset(path)
    time_coord = 'valid_time' if 'valid_time' in ds.coords else 'time'

    lat_name = 'latitude' if 'latitude' in ds.coords else 'lat'
    lng_name = 'longitude' if 'longitude' in ds.coords else 'lon'
    lats = ds[lat_name].values
    lngs = ds[lng_name].values

    def get(name):
        if name not in ds:
            return None, None
        da   = ds[name]
        times = [pd.Timestamp(t) for t in da[time_coord].values]
        return times, da.values

    times_instant, u10 = get('u10')
    _,              v10 = get('v10')
    times_tp,       tp  = get('tp')

    for name, data in [('u10', u10), ('v10', v10), ('tp', tp)]:
        if data is None:
            print(f"[era5-parse] ERROR: variable '{name}' not found in NetCDF", file=sys.stderr)
            sys.exit(1)

    # RH: prefer computed from t2m+d2m; fall back to direct r/r2
    _, t2m = get('t2m')
    _, d2m = get('d2m')
    if t2m is not None and d2m is not None:
        rh = compute_rh(t2m, d2m)
    else:
        _, rh = get('r')
        if rh is None:
            _, rh = get('r2')
        if rh is None:
            print("[era5-parse] WARNING: no humidity variable found — RH will be null", file=sys.stderr)
            rh = np.full_like(u10, np.nan)

    return times_instant, times_tp, lats, lngs, u10, v10, rh, tp


# ---------------------------------------------------------------------------
# Bangkok-day bucketing
# ---------------------------------------------------------------------------

def bkk_date(t) -> str:
    """Bangkok calendar date (Asia/Bangkok, UTC+7, no DST) for a UTC pd.Timestamp."""
    import pandas as pd
    return (t + pd.Timedelta(hours=7)).strftime('%Y-%m-%d')


def compute_hourly_tp(sorted_tp_times: list, tp_idx: dict, tp) -> dict:
    """
    Per-timestamp 1-hour precipitation increment (metres), computed once globally in
    UTC run order. ERA5 tp is accumulated from the start of each 12-hour forecast run
    (resets at 00:00/12:00 UTC; the first step of each run, 01:00/13:00 UTC, already
    equals the 1-hour increment). Must run globally, not per-Bangkok-day-bucket — a
    Bangkok day (00:00-24:00 BKK = 17:00 UTC to 17:00 UTC) never starts on a run-reset
    boundary, so resetting the "previous step" tracker per bucket would corrupt the
    first hour of every Bangkok day.
    """
    hourly: dict = {}
    prev_tp = None
    prev_hour = None
    for t in sorted_tp_times:
        cur = tp[tp_idx[t]]
        if t.hour in (1, 13) or prev_hour is None:
            hourly[t] = np.where(cur >= 0, cur, 0.0)
        else:
            diff = cur - prev_tp
            hourly[t] = np.where(diff >= 0, diff, 0.0)
        prev_tp = cur
        prev_hour = t.hour
    return hourly


def _selftest() -> None:
    """Assertion-based sanity check for compute_hourly_tp + bkk_date. No fixtures,
    no external files — run with: python3 era5-parse.py --selftest"""
    import pandas as pd

    # Synthetic single-run ERA5 tp series (metres, cumulative within the run), one
    # 1x1 grid cell, straddling a Bangkok midnight (17:00 UTC) that is NOT a run-reset
    # boundary (the run started at 13:00 UTC, so 17:00 UTC is 4 hours into the run).
    hours = [13, 14, 15, 16, 17, 18, 19]
    cum_m = [0.0015, 0.0030, 0.0045, 0.0060, 0.0075, 0.0090, 0.0105]
    times = [pd.Timestamp(f'2025-01-15T{h:02d}:00:00') for h in hours]
    tp = np.array([[[v]] for v in cum_m])  # shape (T, 1, 1)
    tp_idx = {t: i for i, t in enumerate(times)}

    hourly = compute_hourly_tp(sorted(times), tp_idx, tp)

    # Every real increment is 0.0015 m — including hour 17, the first hour of the
    # Bangkok day starting at 17:00 UTC, which is NOT a run-reset boundary. A naive
    # per-Bangkok-day reset would instead read hour 17's raw cumulative value (0.0075 m)
    # as if it were a fresh 1-hour increment — 5x too high.
    for t in times:
        assert abs(float(hourly[t][0][0]) - 0.0015) < 1e-9, f'{t}: {hourly[t]}'

    # Bangkok-day bucketing: hours 13-16 UTC fall in BKK day 2025-01-15 (14:00-23:00 BKK);
    # hours 17-19 UTC fall in BKK day 2025-01-16 (00:00-02:00 BKK, next day).
    assert bkk_date(pd.Timestamp('2025-01-15T16:00:00')) == '2025-01-15'
    assert bkk_date(pd.Timestamp('2025-01-15T17:00:00')) == '2025-01-16'

    # Sum this synthetic slice's contribution to BKK day 2025-01-16 (hours 17-19 only,
    # not the full day) — correct total is 3 * 0.0015 = 0.0045 m, not the ~0.010 m a
    # naive per-bucket-reset implementation would produce.
    bkk_day_2 = [t for t in times if bkk_date(t) == '2025-01-16']
    total = sum(float(hourly[t][0][0]) for t in bkk_day_2)
    assert abs(total - 0.0045) < 1e-9, total

    print('[era5-parse] selftest OK', file=sys.stderr)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: era5-parse.py <path> | era5-parse.py --selftest", file=sys.stderr)
        sys.exit(1)

    if sys.argv[1] == '--selftest':
        _selftest()
        return

    path = sys.argv[1]
    fmt  = 'GRIB' if is_grib(path) else 'NetCDF'
    print(f"[era5-parse] Detected format: {fmt}", file=sys.stderr)

    loader = load_grib if fmt == 'GRIB' else load_netcdf
    times_instant, times_tp, lats, lngs, u10, v10, rh, tp = loader(path)

    print(f"[era5-parse] {len(times_instant)} instant steps, {len(times_tp)} tp steps, "
          f"{len(lats)}×{len(lngs)} grid", file=sys.stderr)

    # Index arrays by valid_time for O(1) lookup
    instant_idx = {t: i for i, t in enumerate(times_instant)}
    tp_idx      = {t: i for i, t in enumerate(times_tp)}

    sorted_tp_times = sorted(t for t in times_tp if t in tp_idx)
    hourly_tp = compute_hourly_tp(sorted_tp_times, tp_idx, tp)

    # Group all timestamps by Bangkok calendar date — matches weather_readings.date.
    all_times = sorted(set(times_instant) | set(times_tp))
    date_to_times: dict[str, list] = defaultdict(list)
    for t in all_times:
        date_to_times[bkk_date(t)].append(t)

    total_records = 0

    for date_str in sorted(date_to_times.keys()):
        day_times = date_to_times[date_str]

        # --- Wind and humidity at 07:00 UTC (= 14:00 BKK) ---
        t07 = next((t for t in day_times if t.hour == 7 and t in instant_idx), None)
        if t07 is None:
            print(f"[era5-parse] WARNING: no 07:00 UTC instant data for {date_str} — skipping",
                  file=sys.stderr)
            continue

        idx07  = instant_idx[t07]
        u10_07 = u10[idx07]                                   # (lat, lng)
        v10_07 = v10[idx07]
        rh_07  = rh[idx07] if rh.shape[0] > idx07 else np.full_like(u10_07, np.nan)

        # --- Daily precipitation: sum this Bangkok day's already-computed hourly increments ---
        tp_daily = np.zeros((len(lats), len(lngs)))
        for t in day_times:
            if t in hourly_tp:
                tp_daily += hourly_tp[t]

        tp_mm = tp_daily * 1000.0  # metres → mm

        # --- Emit NDJSON ---
        def _v(x: float):
            f = float(x)
            return None if f != f else f  # NaN → null

        for i, lat in enumerate(lats):
            for j, lng in enumerate(lngs):
                print(json.dumps({
                    "date":  date_str,
                    "lat":   float(lat),
                    "lng":   float(lng),
                    "u10":   _v(u10_07[i, j]),
                    "v10":   _v(v10_07[i, j]),
                    "r":     _v(rh_07[i, j]),
                    "tp_mm": _v(tp_mm[i, j]),
                }), flush=False)
                total_records += 1

    sys.stdout.flush()
    print(f"[era5-parse] Emitted {total_records} records", file=sys.stderr)


main()
