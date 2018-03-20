const fetch = require('node-fetch');
const FormData = require('form-data');
const { BASE_URL, REDIRECT_URI } = require('./config');

const { CLIENT_ID, CLIENT_SECRET } = process.env;
const TOKEN_URL = `${BASE_URL}/authorization/oauth2/token/`;

// Fetch timeout in milliseconds:
const TIMEOUT = 2500;

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (res.status >= 400) {
    throw new Error(`Request to ${url} failed: ${JSON.stringify(body)}`);
  }

  return body;
}

/**
 * Small wrapper around fetch that retries whenever a request exceeds TIMEOUT
 * ms, and throws an error for status codes above 400.
 */
exports.callAPI = async function callAPI(url, accessToken, options) {
  try {
    const allOptions = Object.assign({}, options, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: TIMEOUT
    });

    return await fetchJson(url, allOptions);
  } catch (e) {
    if (e.type === 'request-timeout') {
      console.warn('One of the requests timed out - retrying...');
      return callAPI(url, accessToken, options);
    }

    throw e;
  }
};

function getTokenForm() {
  const form = new FormData();
  form.append('client_id', CLIENT_ID);
  form.append('client_secret', CLIENT_SECRET);
  form.append('redirect_uri', REDIRECT_URI);
  return form;
}

/**
 * Posts to the OAuth2 token endpoint to retrieve an access and refresh token
 * pair.
 */
exports.retrieveTokens = async function retrieveTokens(code) {
  const form = getTokenForm();
  form.append('grant_type', 'authorization_code');
  form.append('code', code);

  const body = await fetchJson(TOKEN_URL, {
    method: 'POST',
    body: form,
    headers: form.getHeaders()
  });

  return { access: body.access_token, refresh: body.refresh_token };
};

/**
 * Posts to the OAuth2 token endpoint to refresh an existing token pair.
 */
exports.refreshTokens = async function refreshTokens(access, refresh) {
  const form = getTokenForm();
  form.append('grant_type', 'refresh_token');
  form.append('refresh_token', refresh);

  const body = await fetchJson(TOKEN_URL, {
    method: 'POST',
    body: form,
    headers: Object.assign({}, form.getHeaders(), {
      Authorization: `Bearer ${access}`
    })
  });

  return { access: body.access_token, refresh: body.refresh_token };
};
