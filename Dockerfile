ARG BUILD_FROM=ghcr.io/hassio-addons/base:14.0.2
FROM $BUILD_FROM

# Install requirements for add-on
RUN \
  apk add --no-cache \
    python3 nodejs npm

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN chmod a+x run.sh

CMD [ "/usr/src/app/run.sh" ]
