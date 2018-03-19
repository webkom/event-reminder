const querystring = require('querystring');
const fetch = require('node-fetch');
const dateFns = require('date-fns');
const { promisify } = require('util');
const { IncomingWebhook } = require('@slack/client');
const { API_URL, WEBAPP_URL } = require('./config');

// Fetch timeout in milliseconds:
const TIMEOUT = 2500;
const { ACCESS_TOKEN } = process.env;
const EVENT_COLORS = {
  company_presentation: '#A1C34A',
  lunch_presentation: '#A1C34A',
  course: '#52B0EC',
  party: '#FCD748',
  social: '#B11C11',
  event: '#B11C11',
  other: '#111111'
};

/**
 * Small wrapper around fetch that retries whenever a request exceeds TIMEOUT
 * ms, and throws an error for status codes above 400.
 */
async function callAPI(url) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      timeout: TIMEOUT
    });

    const body = await res.json();
    if (res.status >= 400) {
      throw new Error(`Failed retrieving ${url}: ${JSON.stringify(body)}`);
    }

    return body;
  } catch (e) {
    if (e.type === 'request-timeout') {
      console.warn('One of the requests timed out - retrying...');
      return callAPI(url);
    }

    throw e;
  }
}

/**
 * Checks if the given event has a pool that activates today.
 */
function opensToday(event) {
  return !!event.pools.find(({ activationDate }) =>
    dateFns.isToday(activationDate)
  );
}

/**
 * Retrieves a list of detailed events that
 * have at least one pool opening today.
 */
async function retrieveEvents() {
  const date = dateFns.format(new Date(), 'YYYY-MM-DD');
  const qs = querystring.stringify({ date_after: date, page_size: 5 });
  let res = await callAPI(`${API_URL}/events/?${qs}`);
  let events = res.results;
  while (res.next) {
    res = await callAPI(res.next);
    events = events.concat(res.results);
  }

  const allEvents = await Promise.all(
    events
      .filter(event => !event.isAbakomOnly)
      .map(({ id }) => callAPI(`${API_URL}/events/${id}/`))
  );

  return allEvents.filter(opensToday);
}

/**
 * Builds a Slack attachment for each event,
 * see https://api.slack.com/docs/message-attachments.
 */
function buildAttachments(events) {
  return events.map((event, i) => {
    const pretext = i === 0 ? 'Arrangementer med påmelding i dag:' : '';
    const fields = event.pools.map(pool => {
      const startTime = dateFns.format(pool.activationDate, 'H:mm');
      return {
        title: pool.name,
        value: `Åpner klokken ${startTime}`
      };
    });

    return {
      pretext,
      fields,
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
    const events = await retrieveEvents();
    if (events.length > 0) {
      await notifySlack(events);
    }
  } catch (e) {
    console.error('Error', e);
    process.exit(1);
  }
}

run();
