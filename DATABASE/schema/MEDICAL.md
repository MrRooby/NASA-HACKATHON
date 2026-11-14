# Medical operations schema

`010_medical_core.sql` creates the write-side `astro_medical` database. It records
time-ordered medical events, explicitly synthetic drills, image metadata and
Earth-doctor review decisions. `transmission` is a durable store-and-forward
queue: records in the H13 solar-conjunction window are loaded as
`held_blackout` and retain their release sol. `alert` can point at an
`astro_core.observation`, HABITAT reading/event, or medical event; an
`escalation` makes the operational hand-off explicit.

`011_medical_api_views.sql` exposes only read views in `astro_api`:

* `medical_person_timeline`
* `medical_pending_reviews`
* `medical_transmission_queue`
* `medical_open_escalations`

## Synthetic demo

```bash
python3 DATABASE/synthetic/medical_generate.py
uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_medical.py
```

The generator is deterministic and targets `SYN-MARS-HAB-600`. It uses the
crew mapping C1=C `SYN-02`, C2=`SYN-01`, C3=`SYN-03`, C4=`SYN-04`, emits weekly
PMC reports, H1/H4/H5/H8 escalations, a sol-200 C3 SANS episode with
ultrasound/photo placeholders, and one clearly labelled AED drill. Reports in
sols 280–293 demonstrate H13 queueing. All values and media are synthetic.
