create table if not exists station_climatology (
  station_id   text     not null references stations(id),
  month        smallint not null check (month between 1 and 12),
  day          smallint not null check (day between 1 and 31),
  median_pm25  real     not null,
  p25_pm25     real     not null,
  p75_pm25     real     not null,
  n            integer  not null,
  primary key (station_id, month, day)
);

grant select, insert, update, delete on station_climatology to service_role;
