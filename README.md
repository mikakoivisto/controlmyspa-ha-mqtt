## ControlMySpa Home Assistant AddOn via MQTT

This provides sensors, switches and climate to control your ControlMySpa controlled spa via MQTT in Home Assitant. It support MQTT autodiscovery to automatically register sensors, switches and climate control to adjust and monitor the state of your spa.

## Building and testing locally

Create haconfig directory for homeassistant config directory

Build and run:

```bash
docker-compose up -d --build
```

## Running with Home Assistant

Simples way is to run it using docker-compose.yml. The latest versio is available direct from Docker Hub so no need to even build it locally.

```yml
version: "3.4"
services:
  mqtt:
    image: eclipse-mosquitto
    volumes:
      - ./mosquitto/config.conf:/mosquitto/config/mosquitto.conf
  controlmyspa-ha-mqtt:
    image: mikakoivisto/controlmyspa-ha-mqtt:latest
    links:
      - mqtt
    env_file: 
      - docker.env
```

## Configuration

Add following to docker.env file

```
MQTTHOST=mqtt
MQTTPORT=
MQTTUSER=
MQTTPASS=
CONTROLMYSPA_USER=
CONTROLMYSPA_PASS=
CONTROLMYSPA_CELSIUS=true
HASSTOPIC=homeassistant/status
DEBUG=app:info,*:error,spa:info
```

HASSTOPIC is important because mqtt discovery message is trigged by it. Default value should be fine. 

## Known limitations

This currently supports jets with HIGH and OFF state. If you have components the current implementation does not support I'll gladly discuss on how to add that support. 

Tested with Novitek spa with Balboa jets. Implementation is based on ControlMySpaJs library https://gitlab.com/VVlasy/controlmyspajs