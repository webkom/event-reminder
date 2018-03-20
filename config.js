const isProduction = process.env.NODE_ENV === 'production';
const target = isProduction ? 'lego' : 'lego-staging';
const BASE_URL = `https://${target}.abakus.no`;

module.exports = {
  BASE_URL,
  API_URL: `${BASE_URL}/api/v1`,
  REDIRECT_URI: 'http://localhost:3000/callback',
  WEBAPP_URL: isProduction ? 'https://abakus.no' : 'https://webapp-staging.abakus.no'
};
