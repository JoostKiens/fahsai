alter table weather_readings
  drop column if exists temperature_2m_mean,
  drop column if exists temperature_2m_min,
  drop column if exists temperature_2m_max;
