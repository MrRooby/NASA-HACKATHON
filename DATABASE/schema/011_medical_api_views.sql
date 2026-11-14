-- 011_medical_api_views.sql | read-only medical contract
USE astro_api;

CREATE OR REPLACE VIEW medical_person_timeline AS
SELECT me.id AS medical_event_id, m.code AS mission_code, s.code AS subject_code,
       me.event_code, me.event_type, me.report_kind, me.observed_at, me.sol,
       me.title, me.value_num, me.value_text, me.unit, me.severity, me.status,
       me.is_drill, me.details,
       COUNT(a.id) AS attachment_count
FROM astro_medical.medical_event me
JOIN astro_core.mission m ON m.id = me.mission_id
LEFT JOIN astro_core.subject s ON s.id = me.subject_id
LEFT JOIN astro_medical.attachment a ON a.medical_event_id = me.id
GROUP BY me.id, m.code, s.code;

CREATE OR REPLACE VIEW medical_pending_reviews AS
SELECT a.id AS attachment_id, a.attachment_code, a.file_name, a.relative_path,
       a.attachment_type, a.review_status, me.event_code, me.title,
       m.code AS mission_code, s.code AS subject_code,
       r.reviewer, r.status AS doctor_review_status, r.requested_at
FROM astro_medical.attachment a
JOIN astro_medical.medical_event me ON me.id = a.medical_event_id
JOIN astro_core.mission m ON m.id = me.mission_id
LEFT JOIN astro_core.subject s ON s.id = me.subject_id
LEFT JOIN astro_medical.earth_doctor_review r ON r.attachment_id = a.id
WHERE a.review_status IN ('pending','in_review')
   OR r.status IN ('requested','in_review');

CREATE OR REPLACE VIEW medical_transmission_queue AS
SELECT t.id, t.transmission_code, m.code AS mission_code, me.event_code,
       t.payload_type, t.priority, t.status, t.queued_at,
       t.blackout_start_sol, t.blackout_end_sol,
       CASE WHEN t.status = 'held_blackout' OR t.blackout_end_sol IS NOT NULL
            THEN 'blackout_wait' ELSE 'ready' END AS queue_state,
       CASE WHEN t.blackout_end_sol IS NOT NULL
            THEN GREATEST(0, t.blackout_end_sol - COALESCE(me.sol, 0))
            ELSE 0 END AS sols_waiting,
       t.available_at, t.sent_at, t.retry_count, t.notes
FROM astro_medical.transmission t
JOIN astro_core.mission m ON m.id = t.mission_id
LEFT JOIN astro_medical.medical_event me ON me.id = t.medical_event_id
WHERE t.status IN ('queued','held_blackout','failed');

CREATE OR REPLACE VIEW medical_open_escalations AS
SELECT e.id AS escalation_id, e.escalation_code, e.level, e.status,
       e.assigned_to, e.opened_at, a.alert_code, a.severity, a.title,
       a.message, m.code AS mission_code, s.code AS subject_code,
       a.source_kind, a.observation_id, a.habitat_reading_id,
       a.habitat_event_id, a.medical_event_id
FROM astro_medical.escalation e
JOIN astro_medical.alert a ON a.id = e.alert_id
JOIN astro_core.mission m ON m.id = a.mission_id
LEFT JOIN astro_core.subject s ON s.id = a.subject_id
WHERE e.status <> 'closed' AND a.status <> 'resolved';
