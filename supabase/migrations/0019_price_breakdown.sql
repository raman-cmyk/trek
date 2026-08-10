-- 0019 — Experience price breakdown (Feature Pack v3 §0).
--
-- An experience is a packaged product with its OWN price, expressed as line
-- items. The total is DERIVED from the breakdown (sum), never stored separately,
-- so the two can't disagree. Guide fee is per-trip (amortises across the group);
-- permits/porters/logistics are per-person; trek + fund are percentages.
alter table offerings add column price_breakdown jsonb;
