#!/usr/bin/with-contenv bashio

export MQTTHOST=${MQTTHOST:-$(bashio::config 'mqtt_host')}
export MQTTPORT=${MQTTPORT:-$(bashio::config 'mqtt_port')}
export MQTTUSER=${MQTTUSER:-$(bashio::config 'mqtt_user')}
export MQTTPASS=${MQTTPASS:-$(bashio::config 'mqtt_pass')}
export CONTROLMYSPA_USER=${CONTROLMYSPA_USER:-$(bashio::config 'controlmyspa_user')}
export CONTROLMYSPA_PASS=${CONTROLMYSPA_PASS:-$(bashio::config 'controlmyspa_pass')}
export CONTROLMYSPA_CELSIUS=${CONTROLMYSPA_CELSIUS:-$(bashio::config 'controlmyspa_celsius')}
export HASSTOPIC=${HASSTOPIC:-$(bashio::config 'hass_topic')}
export DEBUG=${DEBUG:-$(bashio::config 'debug')}
export REFRESH_SPA=${REFRESH_SPA:-$(bashio::config 'refresh_spa')}
export NODE_TLS_REJECT_UNAUTHORIZED=${NODE_TLS_REJECT_UNAUTHORIZED:-$(bashio::config 'tls_reject_unauthorized')}

node app.js