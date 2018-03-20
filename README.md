# event-reminder [![DroneCI](https://ci.abakus.no/api/badges/webkom/event-reminder/status.svg?branch=master)](https://ci.abakus.no/webkom/event-reminder)

> Posts events opening today to Slack. Built as an example application for the [LEGO API](https://https://github.com/webkom/lego).

![Slack Screenshot](https://i.imgur.com/87MGVzK.png)

## Installation

event-reminder needs at least version 7.6 of Node.js, and
[yarn](https://yarnpkg.com/en/) installed.

```bash
$ yarn
```

## Usage

You need an OAuth2 application to access the LEGO API, which can be created
through your [user profile](https://abakus.no/users/me/settings/oauth2). This
will give you a client ID, and a client secret. With that in hand, we can
retrieve our initial authorization token:

```bash
$ CLIENT_ID=... CLIENT_SECRET=... yarn token
$ # This should open a browser window where you can complete the OAuth2 sign-in
$ # process. After that is done you'll get an `ACCESS_TOKEN` and a `REFRESH_TOKEN`.
```

Following that, you'll need to create an incoming webhook for use with Slack.
This is what the application uses to post the daily reminders, and you can
create one in your Slack's [integration settings](https://my.slack.com/services/new/incoming-webhook/).

At this point you should have all the required environment variables:

* `ACCESS_TOKEN`
* `REFRESH_TOKEN`
* `CLIENT_ID`
* `CLIENT_SECRET`
* `WEBHOOK_URL`

The application can then be started with:

```bash
$ ACCESS_TOKEN=... REFRESH_TOKEN=... CLIENT_ID=... CLIENT_SECRET=... WEBHOOK_URL=... yarn start
$ # To run requests against the real API instead of
$ # the staging version, set NODE_ENV=production as well.
```
