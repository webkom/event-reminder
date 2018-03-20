const express = require('express');
const FormData = require('form-data');
const open = require('open');
const querystring = require('querystring');
const crypto = require('crypto');
const { retrieveTokens } = require('./utils');
const { BASE_URL, REDIRECT_URI } = require('./config');

const { CLIENT_ID } = process.env;
const AUTH_URL = `${BASE_URL}/authorization/oauth2/authorize/`;

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
    await retrieveInitialTokens(req.query.code);
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
async function retrieveInitialTokens(code) {
  const { access, refresh } = await retrieveTokens(code);
  console.log(`ACCESS_TOKEN=${access}`);
  console.log(`REFRESH_TOKEN=${refresh}`);
}

app.listen(3000, startOauth);
