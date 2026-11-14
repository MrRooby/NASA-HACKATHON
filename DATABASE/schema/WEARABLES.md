# Wearables

Wearables are a producer schema in `astro_wearables`; `astro_api.wearable_*`
views are read-only API projections. Each synthetic-Mars crew member has four
limb devices and one head EEG device. Telemetry is sampled every 10 seconds
only in W1–W4 scenario windows and the latest six hours; the complete mission
is represented by minute/hour aggregates and nightly EEG sleep sessions.

Scenarios: W1 is a left-leg circulation issue for C4, W2 is low battery and
disconnect, W3 is EVA link loss with buffering, and W4 is a sensor fault.
All demo rows use `source_flag=simulated`. The generator is deterministic:

```bash
python3 DATABASE/synthetic/wearables_generate.py --seed 7
python3 DATABASE/etl/load_wearables.py
```

The importer requires mission `SYN-MARS-HAB-600`, its four participating
subjects, and matching `astro_habitat` crew/location rows. It is idempotent
and refuses to load when those links are absent.
