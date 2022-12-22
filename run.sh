#!/usr/bin/with-contenv bashio

MQTTHOST=$(bashio::services mqtt "host")
MQTTPORT=$(bashio::services mqtt "port")
MQTTUSER=$(bashio::services mqtt "username")
MQTTPASS=$(bashio::services mqtt "password")
CONTROLMYSPA_USER=$(bashio::config 'controlmyspa_user')
CONTROLMYSPA_PASS=$(bashio::config 'controlmyspa_pass')
CONTROLMYSPA_CELSIUS=$(bashio::config 'controlmyspa_celsius')
HASSTOPIC=$(bashio::config 'hass_topic')
DEBUG=$(bashio::config 'debug')

node app.js