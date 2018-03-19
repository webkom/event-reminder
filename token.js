const express = require('express');
const FormData = require('form-data');
const fetch = require('node-fetch');
const open = require('open');
const querystring = require('querystring');
const crypto = require('crypto');
const { BASE_URL } = require('./config');

const { CLIENT_ID, CLIENT_SECRET } = process.env;
const REDIRECT_URI = 'http://localhost:3000/callback';
const AUTH_URL = `${BASE_URL}/authorization/oauth2/authorize/`;
const TOKEN_URL = `${BASE_URL}/authorization/oauth2/token/`;

const state = crypto.randomBytes(64).toString('hex');
const app = express();
app.disable('x-powered-by');

/**
 * Handles OAuth2 callbacks and retrieves access tokens
 * for any successful requests.
 */
app.get('/callback', async (req, res) => {
  if (req.query.state !== state) {
    return res.status(403).send('Invalid state');
  }

  try {
    await retrieveToken(req.query.code);
    res.send('Open your terminal to see the retrieved access token.');
    process.exit(0);
  } catch (e) {
    console.error('Failed retrieving token', e);
    process.exit(1);
  }
});

/**
 * Initiates the OAuth2 flow by opening a browser window pointing to AUTH_URL.
 */
function startOauth() {
  const qs = querystring.stringify({
    state,
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI
  });

  open(`${AUTH_URL}?${qs}`);
}

/**
 * POST to TOKEN_URL to retrieve an access and refresh token pair
 * for the given authorization code.
 */
async function retrieveToken(code) {
  const form = new FormData();
  form.append('grant_type', 'authorization_code');
  form.append('client_id', CLIENT_ID);
  form.append('client_secret', CLIENT_SECRET);
  form.append('code', code);
  form.append('redirect_uri', REDIRECT_URI);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: form,
    headers: form.getHeaders()
  });

  const { access_token, refresh_token } = await res.json();
  console.log(`ACCESS_TOKEN=${access_token}`);
  console.log(`REFRESH_TOKEN=${refresh_token}`);
}

app.listen(3000, startOauth);
