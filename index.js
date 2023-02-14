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
  alternative_presentation: '#8A2BE2',
  course: '#52B0EC',
  breakfast_talk: '#86D1D0',
  party: '#FCD748',
  social: '#B11C11',
  event: '#B11C11',
  other: '#111111',
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
        refresh: process.env.REFRESH_TOKEN,
      };
    }

    throw e;
  }
}

function createEventLink(id) {
  return `${WEBAPP_URL}/events/${id}/?source=slack&utm_campaign=event-reminder`;
}

function createJobLink(id) {
  return `${WEBAPP_URL}/joblistings/${id}/?source=slack&utm_campaign=event-reminder`;
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
      .filter((event) => !event.isAbakomOnly)
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

function getJobType(jobType) {
  switch (jobType) {
    case 'full_time':
      return 'Fulltid';
    case 'summer_job':
      return 'Sommerjobb';
    case 'part_time':
      return 'Deltid';
      return 'Sommerjobb';
    default:
      return jobType;
  }
}

function getJobYears(fromYear, toYear) {
  return fromYear === toYear ? `${fromYear}. Klasse` : `${fromYear}. - ${toYear}. Klasse`;
}

async function retrieveJoblistings() {
  const today = new Date();
  const yesterday = new Date().setDate(today.getDate() - 1);
  const date = dateFns.format(yesterday, 'YYYY-MM-DD');
  const qs = querystring.stringify({ created_after: date });
  const res = await callAPI(`${API_URL}/joblistings/?${qs}`, accessToken);
  return res.results;
}

/**
 * Builds a Slack attachment for each event,
 * see https://api.slack.com/docs/message-attachments.
 */
function buildAttachments(events) {
  return events.map((event, i) => {
    const pretext = i === 0 ? 'Arrangementer med påmelding i dag:' : '';
    const fields = event.pools.map((pool) => {
      return {
        title: pool.name,
        value: getActiveFrom(pool),
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
      title_link: createEventLink(event.id),
      author_name: 'Abakus',
      author_icon: 'https://abakus.no/icon-48x48.png',
      text: event.description,
      thumb_url: event.cover,
    };
  });
}

function buildJoblistingBlocks(joblistings) {
  const blocks = joblistings.flatMap((joblisting, i) => {
    const deadline = dateFns.format(joblisting.deadline, 'D. MMMM YYYY HH:mm', { locale: nb });

    return [
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*<${createJobLink(joblisting.id)}|${joblisting.title}>*`,
          },
          {
            type: 'mrkdwn',
            text: `*Type:* ${getJobType(joblisting.jobType)}`,
          },
          {
            type: 'mrkdwn',
            text: `${joblisting.company.name}`,
          },
          {
            type: 'mrkdwn',
            text: `*Sted*: ${joblisting.workplaces.map((w) => w.town).join(', ') || '_ukjent_'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Årstrinn*: ${getJobYears(joblisting.fromYear, joblisting.toYear)}`,
          },
        ],
        accessory: {
          type: 'image',
          image_url: joblisting.company.thumbnail,
          alt_text: `${joblisting.company.name} logo`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            text: `Søknadsfrist ${deadline}`,
          },
        ],
      },
      {
        type: 'divider',
      },
    ];
  });

  const header = {
    type: 'header',
    text: {
      type: 'plain_text',
      text: 'Nye jobbanonser i dag:',
    },
  };

  return [header, ...blocks];
}

/**
 * Posts the given events to Slack through an incoming webhook,
 * see https://api.slack.com/incoming-webhooks.
 */
async function notifySlack(events) {
  const webhook = new IncomingWebhook(process.env.WEBHOOK_URL, {
    username: 'Abakus',
    icon_url: 'https://abakus.no/icon-512x512.png',
  });

  webhook.send = promisify(webhook.send);
  const attachments = buildAttachments(events);
  await webhook.send({ attachments });
}

async function notifySlackJoblistings(joblistings) {
  const webhook = new IncomingWebhook(process.env.WEBHOOK_URL_JOBLISTINGS, {
    username: 'Abakus',
    icon_url: 'https://abakus.no/icon-512x512.png',
  });

  webhook.send = promisify(webhook.send);
  const blocks = buildJoblistingBlocks(joblistings);
  await webhook.send({ text: 'Nye jobbanonser i dag', blocks });
}

async function run() {
  try {
    if (CLIENT_SECRET) {
      accessToken = await initializeTokens();
    }
    const events = await retrieveEvents();
    if (events.length > 0) {
      events.forEach((event) => console.log(` - ${event.title} `));
      await notifySlack(events);
    }

    const joblistings = await retrieveJoblistings();
    if (joblistings.length > 0) {
      joblistings.forEach((joblisting) =>
        console.log(` - ${joblisting.company.name}: ${joblisting.title}`)
      );
      await notifySlackJoblistings(joblistings);
    }
  } catch (e) {
    console.error('Error', e);
    process.exit(1);
  }
}

run();
