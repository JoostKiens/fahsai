-- fire_type is never populated: the FIRMS area API does not include the 'type'
-- column in its response. All rows have fire_type = NULL. Drop the column and
-- its index to remove dead weight.
drop index if exists fire_points_fire_type_idx;
alter table fire_points drop column if exists fire_type;
