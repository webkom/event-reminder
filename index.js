const fs = require('fs');
const querystring = require('querystring');
const FormData = require('form-data');
const fetch = require('node-fetch');
const dateFns = require('date-fns');
const nb = require('date-fns/locale/nb');
const { promisify } = require('util');
const { IncomingWebhook } = require('@slack/client');
const { API_URL, WEBAPP_URL } = require('./config');
const { CLIENT_SECRET } = process.env;
const { callAPI, refreshTokens } = require('./utils');

// Filename where the latest refresh token will be stored locally:
const TOKEN_FILE = 'tokens.json';

const EVENT_COLORS = {
  company_presentation: '#A1C34A',
  lunch_presentation: '#A1C34A',
  course: '#52B0EC',
  party: '#FCD748',
  social: '#B11C11',
  event: '#B11C11',
  other: '#111111'
};

// Stores the access token retrieved by refreshAccessToken:
let accessToken;

/**
 * Attempts to read an earlier persisted refresh token from TOKEN_FILE,
 * and falls back to process.env.REFRESH_TOKEN if that doesn't exist.
 */
function getInitialTokens() {
  try {
    return require(`./${TOKEN_FILE}`);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      return {
        access: process.env.ACCESS_TOKEN,
        refresh: process.env.REFRESH_TOKEN
      };
    }

    throw e;
  }
}

/**
 * Refreshes the current access token to avoid expiration.
 */
async function initializeTokens() {
  const initial = getInitialTokens();
  const tokens = await refreshTokens(initial.access, initial.refresh);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens));
  return tokens.access;
}

/**
 * Checks if the given event has a pool that activates today.
 */
function opensToday(event) {
  return !!event.pools.find(({ activationDate }) => dateFns.isToday(activationDate));
}

/**
 * Retrieves a list of detailed events that
 * have at least one pool opening today.
 */
async function retrieveEvents() {
  const date = dateFns.format(new Date(), 'YYYY-MM-DD');
  const qs = querystring.stringify({ date_after: date, page_size: 5 });
  let res = await callAPI(`${API_URL}/events/?${qs}`, accessToken);
  let events = res.results;
  while (res.next) {
    res = await callAPI(res.next, accessToken);
    events = events.concat(res.results);
  }

  const allEvents = await Promise.all(
    events
      .filter(event => !event.isAbakomOnly)
      .map(({ id }) => callAPI(`${API_URL}/events/${id}/`, accessToken))
  );

  return allEvents.filter(opensToday);
}

function getActiveFrom(pool) {
  const time = dateFns.format(pool.activationDate, 'H:mm');
  const fullDate = dateFns.format(pool.activationDate, 'D. MMMM YYYY HH:mm');
  if (dateFns.isToday(pool.activationDate)) {
    return `Åpner klokken ${time}`;
  }
  if (dateFns.isFuture(pool.activationDate)) {
    return `Åpner ${fullDate}`;
  }

  return `Allerede åpen!`;
}

/**
 * Builds a Slack attachment for each event,
 * see https://api.slack.com/docs/message-attachments.
 */
function buildAttachments(events) {
  return events.map((event, i) => {
    const pretext = i === 0 ? 'Arrangementer med påmelding i dag:' : '';
    const fields = event.pools.map(pool => {
      return {
        title: pool.name,
        value: getActiveFrom(pool)
      };
    });

    const startTime = dateFns.format(event.startTime, 'D. MMMM YYYY HH:mm', { locale: nb });
    const footer = `${startTime} • ${event.location}`;
    return {
      pretext,
      fields,
      footer,
      color: EVENT_COLORS[event.eventType],
      title: event.title,
      title_link: `${WEBAPP_URL}/events/${event.id}`,
      author_name: 'Abakus',
      author_icon: 'https://abakus.no/icon-48x48.png',
      text: event.description,
      thumb_url: event.cover
    };
  });
}

/**
 * Posts the given events to Slack through an incoming webhook,
 * see https://api.slack.com/incoming-webhooks.
 */
async function notifySlack(events) {
  const webhook = new IncomingWebhook(process.env.WEBHOOK_URL, {
    username: 'Abakus',
    icon_url: 'https://abakus.no/icon-512x512.png'
  });

  webhook.send = promisify(webhook.send);
  const attachments = buildAttachments(events);
  await webhook.send({ attachments });
}

async function run() {
  try {
    if (CLIENT_SECRET) {
      accessToken = await initializeTokens();
    }
    const events = await retrieveEvents();
    if (events.length > 0) {
      events.forEach(event => console.log(` - ${event.title} `));
      await notifySlack(events);
    }
  } catch (e) {
    console.error('Error', e);
    process.exit(1);
  }
}

run();
