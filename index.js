const querystring = require('querystring');
const fetch = require('node-fetch');
const dateFns = require('date-fns');
const { API_URL } = require('./config');

// Fetch timeout in milliseconds:
const TIMEOUT = 2500;
const { ACCESS_TOKEN } = process.env;

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

function opensToday(event) {
  return !!event.pools.find(({ activationDate }) =>
    dateFns.isToday(activationDate)
  );
}

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
    events.map(({ id }) => callAPI(`${API_URL}/events/${id}/`))
  );

  return allEvents.filter(opensToday);
}

async function run() {
  try {
    const events = await retrieveEvents();
    console.log(events.map(e => e.pools));
  } catch (e) {
    console.error('Error', e);
    process.exit(1);
  }
}

run();
