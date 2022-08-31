FROM node:16
MAINTAINER Abakus <webkom@abakus.no>

ARG RELEASE

# Create app directory
RUN mkdir -p /app
WORKDIR /app

# Copy application
COPY yarn.lock yarn.lock
COPY package.json package.json
COPY *.js ./

# Build image
RUN yarn --production

ENV RELEASE $RELEASE
ENV NODE_ENV production
ENTRYPOINT ["yarn", "start"]
