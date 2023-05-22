ARG BUILD_FROM=ghcr.io/hassio-addons/base:13.0.0
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
