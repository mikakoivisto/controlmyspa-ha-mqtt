#!/usr/bin/with-contenv bashio

export MQTTHOST=$(bashio::services mqtt "host")
export MQTTPORT=$(bashio::services mqtt "port")
export MQTTUSER=$(bashio::services mqtt "username")
export MQTTPASS=$(bashio::services mqtt "password")
export CONTROLMYSPA_USER=$(bashio::config 'controlmyspa_user')
export CONTROLMYSPA_PASS=$(bashio::config 'controlmyspa_pass')
export CONTROLMYSPA_CELSIUS=$(bashio::config 'controlmyspa_celsius')
export HASSTOPIC=$(bashio::config 'hass_topic')
export DEBUG=$(bashio::config 'debug')

node app.js