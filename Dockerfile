ARG BUILD_FROM
FROM $BUILD_FROM

# Install requirements for add-on
RUN \
  apk add --no-cache \
    python3 nodejs npm

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN chmod a+x /usr/src/app/run.sh

CMD [ "/usr/src/app/run.sh" ]
