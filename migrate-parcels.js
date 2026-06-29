const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'dev_password_only',
  database: process.env.DB_NAME || 'transporte_db',
});

async function run() {
  await client.connect();
  console.log('Conectado a PostgreSQL');

  const createTable = `
    CREATE TABLE IF NOT EXISTS parcels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      sender_name VARCHAR(150) NOT NULL,
      sender_doc VARCHAR(20) NOT NULL,
      receiver_name VARCHAR(150) NOT NULL,
      receiver_doc VARCHAR(20) NOT NULL,
      start_waypoint_id UUID REFERENCES route_waypoints(id),
      end_waypoint_id UUID REFERENCES route_waypoints(id),
      description TEXT,
      weight_kg DECIMAL(5,2),
      total_price DECIMAL(10,2) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
      payment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_CASH',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await client.query(createTable);
  console.log('Tabla parcels creada/verificada exitosamente');

  await client.query('CREATE INDEX IF NOT EXISTS idx_parcels_trip_id ON parcels(trip_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels(status)');
  console.log('Indices creados/verificados');

  await client.end();
  console.log('Migracion completada exitosamente.');
}

run().catch(err => {
  console.error('Error en migracion:', err.message);
  process.exit(1);
});
