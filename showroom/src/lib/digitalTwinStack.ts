export const DIGITAL_TWIN_POSITIONING = {
  headline: 'Operations Digital Twin',
  promise:
    'One asset, meter, line, room, or workflow becomes a live operating screen with current state, history, source evidence, owner, and next action.',
  customerPitch:
    'Start with a safe pilot: one machine, one meter, one process, or one recurring manager decision. Expand only after the first screen is useful.',
  safetyRule:
    'ESP32 is the prototype controller. Production metering needs certified sensing, isolation, calibration, enclosure, and qualified electrical review before touching mains power.',
} as const

export const ESP32_SMART_METER_PILOT = [
  {
    layer: 'Prototype controller',
    need: 'ESP32 DevKit or ESP32-S3, enclosure, power supply, device ID, OTA update plan',
    output: 'Publishes safe telemetry and heartbeat events.',
  },
  {
    layer: 'Sensing path',
    need: 'Non-invasive CT clamp or certified Modbus/RS485 smart meter; avoid direct mains experiments',
    output: 'Current, voltage, power, energy, or equipment state with calibration notes.',
  },
  {
    layer: 'Network path',
    need: 'Wi-Fi or Ethernet, MQTT over TLS, retained config topic, offline buffer, reconnect policy',
    output: 'Reliable device-to-cloud messages with timestamp, asset ID, and firmware version.',
  },
  {
    layer: 'Twin record',
    need: 'Asset registry, reading table, event table, alert rules, source files, and human review actions',
    output: 'A live workspace that shows what changed and who needs to act.',
  },
] as const

export const DIGITAL_TWIN_TECH_STACK = [
  {
    name: 'ESP-IDF + ESP-MQTT',
    role: 'Firmware and telemetry',
    use: 'Build serious ESP32 firmware with MQTT, TLS, OTA, device health, and structured telemetry.',
  },
  {
    name: 'ESP RainMaker or private MQTT',
    role: 'Device cloud path',
    use: 'Use RainMaker for fast ESP32 control/monitoring prototypes, or a private broker for client-controlled deployments.',
  },
  {
    name: 'Timescale/Postgres or InfluxDB',
    role: 'Time-series storage',
    use: 'Store meter readings, machine state, alerts, and KPI history without mixing it with ordinary app records.',
  },
  {
    name: 'ThingsBoard / Eclipse Ditto',
    role: 'Twin and rule-engine reference',
    use: 'Borrow the asset model, telemetry pipeline, rule engine, and digital-twin API patterns where they fit.',
  },
  {
    name: 'PWA app shell',
    role: 'Desktop and mobile access',
    use: 'Install from browser as an app; later package with Tauri/Electron only when a client needs offline device-local control.',
  },
] as const

export const DIGITAL_TWIN_FIRST_BUILDS = [
  'Energy meter lane: readings, trend, alert, cost estimate, and owner action.',
  'Machine state lane: running, stopped, fault, maintenance note, and downtime reason.',
  'Quality/operations lane: issue, evidence, CAPA draft, review owner, and closeout.',
  'Facility lane: temperature, humidity, power, water, security, and exception log.',
] as const
