#!/usr/bin/with-contenv bashio

export MQTTHOST=$(bashio::config 'mqtt_host')
export MQTTPORT=$(bashio::config 'mqtt_port')
export MQTTUSER=$(bashio::config 'mqtt_user')
export MQTTPASS=$(bashio::config 'mqtt_pass')
export CONTROLMYSPA_USER=$(bashio::config 'controlmyspa_user')
export CONTROLMYSPA_PASS=$(bashio::config 'controlmyspa_pass')
export CONTROLMYSPA_CELSIUS=$(bashio::config 'controlmyspa_celsius')
export HASSTOPIC=$(bashio::config 'hass_topic')
export DEBUG=$(bashio::config 'debug')

node app.js