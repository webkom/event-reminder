const target = process.env.NODE_ENV === 'production' ? 'lego' : 'lego-staging';
const BASE_URL = `https://${target}.abakus.no`;

module.exports = {
  BASE_URL,
  API_URL: `${BASE_URL}/api/v1`
};
