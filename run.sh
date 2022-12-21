#!/usr/bin/with-contenv bashio

MQTTHOST=$(bashio::config 'mqtt_host')
MQTTPORT=$(bashio::config 'mqtt_port')
MQTTUSER=$(bashio::config 'mqtt_user')
MQTTPASS=$(bashio::config 'mqtt_pass')
CONTROLMYSPA_USER=$(bashio::config 'controlmyspa_user')
CONTROLMYSPA_PASS=$(bashio::config 'controlmyspa_pass')
CONTROLMYSPA_CELSIUS=$(bashio::config 'controlmyspa_celsius')
HASSTOPIC=$(bashio::config 'hass_topic')
DEBUG=$(bashio::config 'debug')

node app.js