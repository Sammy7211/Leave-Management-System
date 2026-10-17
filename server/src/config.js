// server/src/config.js
// All settings come from environment variables (see .env.example).

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

const env = process.env.NODE_ENV || 'development';

// "Today" for leave rules (e.g. no leave starting in the past) is Kenyan time,
// even if the server runs elsewhere, such as a cloud host set to UTC
process.env.TZ ||= 'Africa/Nairobi';

const config = {
  env,
  isProduction: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required('DATABASE_URL'),
  sessionHours: Number(process.env.SESSION_HOURS) || 8,
};

export default config;
