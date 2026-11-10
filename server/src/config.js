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

// Which proxies may tell us the real client address (X-Forwarded-For), as Express's
// 'trust proxy' setting. The default trusts only a proxy on this machine: the React dev
// server, or e.g. nginx in front of the API once deployed. The login rate limit needs
// the real address, or everyone behind the proxy would share one limit.
// Examples: loopback (default), false, 1 (one proxy hop), or a proxy's IP address.
function trustProxy(value = 'loopback') {
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

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
  trustProxy: trustProxy(process.env.TRUST_PROXY),
};

export default config;
