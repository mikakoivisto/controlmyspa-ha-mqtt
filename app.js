const ControlMySpa = require('controlmyspajs')
const EventEmitter = require('events');
const mqttApi = require('mqtt');
const Spa = require('./lib/spa');
const logDebug = require('debug')('app:debug');
const logError = require('debug')('app:error');
const logInfo = require('debug')('app:info');

logInfo.log = console.log.bind(console);

const config = {
  mqttHost: process.env.MQTTHOST || 'localhost',
  mqttPort: process.env.MQTTPORT || '1883',
  mqttUser: process.env.MQTTUSER,
  mqttPass: process.env.MQTTPASS,
  hassTopic: process.env.HASSTOPIC || 'homeassistant/status',
  spaUser: process.env.CONTROLMYSPA_USER,
  spaPassword: process.env.CONTROLMYSPA_PASS,
  useCelsius: process.env.CONTROLMYSPA_CELSIUS || true,
  refreshSpa: process.env.REFRESH_SPA || 10
}

logDebug(JSON.stringify(config));

class App extends EventEmitter {
  mqtt;
  spa;
  config;
  constructor(config) {
    super();

    console.log(config)

    this.mqtt = mqttApi.connect({
      host: config.mqttHost,
      port: config.mqttPort,
      username: config.mqttUser,
      password: config.mqttPass
    });

    this.config = config;
    let spaClient = new ControlMySpa(config.spaUser, config.spaPassword, config.useCelsius);
    this.spa = new Spa(spaClient, config);
    this.registerEventListeners();
    this.spa.init();

    if (this.mqtt.connected) {
      this.mqttConnected();
    }
    this.startPollers();
  }

  startPollers() {
    let self = this;
    // Update status
    setInterval(() => {
       self.spa.updateSpa();
    }, 60 * 1000 * self.config.refreshSpa);
  }

  mqttConnected() {
    logInfo('MQTT connection established');
    this.mqtt.subscribe(config.hassTopic);
  }

  registerEventListeners() { 
    let self = this;   
    self.mqtt.on('connect', () => {
      self.mqttConnected();
    });

    self.mqtt.on('reconnect', () => { 
      logInfo('Attempting to reconnect to MQTT broker');
    });

    self.mqtt.on('error', (error) => {
      logError('Unable to connect to MQTT broker.', error.message);
    });

    self.mqtt.on('message', (topic, message) => {
      logDebug('Message received on ' + topic);
      self.handleMessage(topic, message.toString());
    });

    self.spa.on('initialized', () => {
      logInfo("Spa initialized")
      self.setupSubscriptions();
      self.discovery();
    });

    self.spa.on('status_updated', () => {
      logDebug("Spa updated")
      self.publishSpaState();
    });
  }

  setupSubscriptions() {
    let self = this;
    let topicPrefix = `controlmyspa/${self.spa.getSpaId()}`;
    self.mqtt.subscribe(`${topicPrefix}/refresh`);
    self.mqtt.subscribe(`${topicPrefix}/heaterMode`);
    self.mqtt.subscribe(`${topicPrefix}/tempRange`);
    self.mqtt.subscribe(`${topicPrefix}/temp`);
    self.mqtt.subscribe(`${topicPrefix}/panelLock`);
    self.spa.getLights().forEach(light => {
      self.mqtt.subscribe(`${topicPrefix}/light/${light.port}/set`);
    });
    self.spa.getBlowers().forEach(blower => {
      self.mqtt.subscribe(`${topicPrefix}/blower/${blower.port}/set`);
    });
    self.spa.getPumps().forEach(pump => {
      self.mqtt.subscribe(`${topicPrefix}/pump/${pump.port}/set`);
    });
  }

  publishSpaState() {
    let self = this;
    let topicPrefix = `controlmyspa/${self.spa.getSpaId()}`;
    let state = {
      spaId: self.spa.getSpaId(),
      currentTemp: self.spa.getCurrentTemp(),
      desiredTemp: self.spa.getDesiredTemp(),
      targetDesiredTemp: self.spa.getTargetDesiredTemp(),
      tempRange: self.spa.getTempRange(),
      heaterMode: self.spa.getHeaterMode(),
      online: self.spa.isOnline(),
      panelLocked: self.spa.isPanelLocked(),
      minTemp: self.spa.getRangeLowTemp(),
      maxTemp: self.spa.getRangeHighTemp(),
      device: self.spa.getDeviceInfo(),
      owner: self.spa.getOwnerInfo()
    };
    logDebug(`Publishing spa state: ${JSON.stringify(state)}`);
    self.mqtt.publish(`${topicPrefix}/spa`, JSON.stringify(state), { retain: true });
    self.spa.getLights().forEach(light => {
      logDebug(`Publishing light state: ${JSON.stringify(light)}`);
      self.mqtt.publish(`${topicPrefix}/light/${light.port}`, JSON.stringify(light), { retain: true });
    });
    self.spa.getBlowers().forEach(blower => {
      logDebug(`Publishing blower state: ${JSON.stringify(blower)}`);
      self.mqtt.publish(`${topicPrefix}/blower/${blower.port}`, JSON.stringify(blower), { retain: true });
    });
    self.spa.getPumps().forEach(pump => {
      logDebug(`Publishing pump state: ${JSON.stringify(pump)}`);
      self.mqtt.publish(`${topicPrefix}/pump/${pump.port}`, JSON.stringify(pump), { retain: true });
    });
    self.spa.getCirculationPumps().forEach(pump => {
      logDebug(`Publishing circulation pump state: ${JSON.stringify(pump)}`);
      self.mqtt.publish(`${topicPrefix}/circulation_pump`, JSON.stringify(pump), { retain: true });
    });
    self.spa.getOzone().forEach(ozone => {
      logDebug(`Publishing ozone state: ${JSON.stringify(ozone)}`);
      self.mqtt.publish(`${topicPrefix}/ozone`, JSON.stringify(ozone), { retain: true });
    });
    self.spa.getHeaters().forEach(heater => {
      logDebug(`Publishing heater state: ${JSON.stringify(heater)}`);
      self.mqtt.publish(`${topicPrefix}/heater/${heater.port}`, JSON.stringify(heater), { retain: true });
    });
    self.spa.getFilters().forEach(filter => {
      logDebug(`Publishing filter state: ${JSON.stringify(filter)}`);
      self.mqtt.publish(`${topicPrefix}/filter/${filter.port}`, JSON.stringify(filter), { retain: true });
    });
  }

  discovery() {
    let self = this;
    logInfo("Starting mqtt discovery");
    self.spaSensorDiscovery(self.spa);
    self.sensorsDiscovery(self.spa);
    self.climateDiscovery(self.spa);
    self.panelLockDiscovery(self.spa);
    self.spa.getLights().forEach(light => {
      self.componentSwitchDiscovery(self.spa, light, "light", "mdi:lightbulb");
      self.componentBinarySensorDiscovery(self.spa, light, "light", "mdi:lightbulb", "HIGH");
    });
    self.spa.getBlowers().forEach(blower => {
      self.componentSwitchDiscovery(self.spa, blower, "blower", "mdi:weather-windy");
      self.componentBinarySensorDiscovery(self.spa, blower, "blower", "mdi:weather-windy", "HIGH");
    });
    self.spa.getPumps().forEach(pump => {
      self.componentSwitchDiscovery(self.spa, pump, "pump", "mdi:fan");
      self.componentBinarySensorDiscovery(self.spa, pump, "pump", "mdi:fan", "HIGH");
    });
    self.spa.getCirculationPumps().forEach(pump => {
      self.componentBinarySensorDiscovery(self.spa, pump, "circulation_pump", "mdi:sync", "HIGH");
    });
    self.spa.getOzone().forEach(ozone => {
      self.componentBinarySensorDiscovery(self.spa, ozone, "ozone", "mdi:air-filter", "ON");
    });
    self.spa.getHeaters().forEach(heater => {
      self.componentBinarySensorDiscovery(self.spa, heater, "heater", "mdi:radiator", "ON");
    });
    self.spa.getFilters().forEach(filter => {
      self.componentSensorDiscovery(self.spa, filter, "filter", "mdi:air-filter", "ON", "OFF", "DISABLED");
    });
    logInfo("Ending mqtt discovery");
  }

  componentSwitchDiscovery(spa, component, type, icon) {
    let self = this;
    let spaId = spa.getSpaId();
    let name = `${type.charAt(0).toUpperCase()}${type.slice(1)}`.replace('_', ' ');
    let topicPrefix = `controlmyspa/${spaId}`;
    let componentTopic = `${topicPrefix}/${type}`;
    let objectId = `controlmyspa_${spaId}_${type}`;
    if ("port" in component) {
      componentTopic += "/" + component.port;
      objectId += "_" + component.port;
      name += " " +  (parseInt(component.port) + 1)
    }
    let uniqueId = `${objectId}_switch`;

    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": name,
      "icon": icon,
      "state_topic": componentTopic,
      "state_on": "HIGH",
      "payload_on": "HIGH",
      "value_template": "{{ value_json.value }}",
      "command_topic": componentTopic+ "/set",
      "availability": self.getAvailabilityDiscovery(spa),
      "device": self.getDeviceDiscovery(spa)
    };
    logDebug(`Send discover config for switch ${type} ${component.port}: ${JSON.stringify(config)}`);
    self.mqtt.publish("homeassistant/switch/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  componentBinarySensorDiscovery(spa, component, type, icon, onValue) {
    let self = this;
    let spaId = spa.getSpaId();
    let name = `${type.charAt(0).toUpperCase()}${type.slice(1)}`.replace('_', ' ');
    let topicPrefix = `controlmyspa/${spaId}`;
    let stateTopic = `${topicPrefix}/${type}`;
    let objectId = `controlmyspa_${spaId}_${type}`;
    if ("port" in component) {
      stateTopic += "/" + component.port;
      objectId += "_" + component.port;
      name += " " +  (parseInt(component.port) + 1)
    }
    let uniqueId = `${objectId}_binary_sensor`;

    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": name,
      "icon": icon,
      "state_topic": stateTopic,
      "state_on": onValue,
      "payload_on": onValue,
      "value_template": `{% if value_json.value == '${onValue}' %}{{ value_json.value }}{% else %}OFF{% endif %}`,
      "availability": self.getAvailabilityDiscovery(spa),
      "device": self.getDeviceDiscovery(spa)
    };
    logDebug(`Send discover config for binary sensor ${type} ${component.port}: ${JSON.stringify(config)}`);
    self.mqtt.publish("homeassistant/binary_sensor/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  componentSensorDiscovery(spa, component, type, icon, mode1, mode2, mode3) {
    let self = this;
    let spaId = spa.getSpaId();
    let mode1Capitalized = mode1.charAt(0).toUpperCase()+mode1.slice(1).toLowerCase();
    let mode2Capitalized = mode2.charAt(0).toUpperCase()+mode2.slice(1).toLowerCase();
    let mode3Capitalized = mode3.charAt(0).toUpperCase()+mode3.slice(1).toLowerCase();
    let name = `${type.charAt(0).toUpperCase()}${type.slice(1)}`.replace('_', ' ');
    let topicPrefix = `controlmyspa/${spaId}`;
    let stateTopic = `${topicPrefix}/${type}`;
    let objectId = `controlmyspa_${spaId}_${type}`;
    if ("port" in component) {
      stateTopic += "/" + component.port;
      objectId += "_" + component.port;
      name += " " +  (parseInt(component.port) + 1)
    }
    let uniqueId = `${objectId}_sensor`;
    let valueTemplate = `{% if value_json.value == "${mode1}"%}${mode1Capitalized}{% elif value_json.value == "${mode2}" %}${mode2Capitalized}{% elif value_json.value == "${mode3}" %}${mode3Capitalized}{% else %}unknown{% endif %}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": name,
      "icon": icon,
      "state_topic": stateTopic,
      "value_template": valueTemplate,
      "availability": self.getAvailabilityDiscovery(spa),
      "device": self.getDeviceDiscovery(spa)
    };
    self.mqtt.publish("homeassistant/sensor/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }
 
  spaSensorDiscovery(spa) {
    let self = this;
    let spaId = spa.getSpaId();
    let name = 'Spa';
    let topicPrefix = `controlmyspa/${spaId}`;
    let stateTopic = `${topicPrefix}/spa`;
    let objectId = `controlmyspa_${spaId}_spa`;
    let uniqueId = `${objectId}_sensor`;

    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": name,
      "icon": "mdi:hot-tub",
      "state_topic": stateTopic,
      "value_template": "{% if value_json.online is defined and value_json.online %} Online {% else %} Offline {% endif %}",
      "json_attributes_topic": stateTopic,
      "availability": self.getAvailabilityDiscovery(spa),
      "device": self.getDeviceDiscovery(spa)
    };
    logDebug(`Send discover config for spa sensor: ${JSON.stringify(config)}`);
    self.mqtt.publish("homeassistant/sensor/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  sensorsDiscovery(spa) {
    let self = this;
    let celsius = spa.useCelsius();
    self.temperatureSensorDiscovery(spa, "Current Temperature", "currentTemp", celsius);
    self.temperatureSensorDiscovery(spa, "Target Temperature", "targetDesiredTemp", celsius);
    self.temperatureSensorDiscovery(spa, "Desired Temperature", "desiredTemp", celsius);
    self.modeSensorDiscovery(spa, "Heater Mode", "mdi:radiator", "heaterMode", "REST", "READY");
    self.modeSensorDiscovery(spa, "Temperature Range", "mdi:thermometer-lines", "tempRange", "HIGH", "LOW");
    self.buttonDiscovery(spa, "Toggle Heater Mode", "mdi:radiator", "heaterMode", "TOGGLE");
    self.buttonDiscovery(spa, "Refresh", "mdi:sync", "refresh", "REFRESH");
  }

  panelLockDiscovery(spa) {
    let self = this;
    let spaId = spa.getSpaId();
    let stateTopic = `controlmyspa/${spaId}/spa`;
    let commandTopic = `controlmyspa/${spaId}/panelLock`;
    let objectId = `controlmyspa_${spaId}_panel_lock`;
    let uniqueId = `${objectId}_lock`;

    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": "Panel",
      "state_topic": stateTopic,
      "command_topic": commandTopic,
      "payload_lock": "LOCK",
      "payload_unlock": "UNLOCK",
      "state_locked": "LOCK",
      "state_unlocked": "UNLOCK",
      "value_template": "{% if value_json.panelLocked %}LOCK{% else %}UNLOCK{%endif%}",
      "qos": 1,
      "availability": self.getAvailabilityDiscovery(spa),
      "device": self.getDeviceDiscovery(spa)
    };
    self.mqtt.publish("homeassistant/lock/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  temperatureSensorDiscovery(spa, name, attribute, celsius) {
    let self = this;
    let spaId = spa.getSpaId();
    let tempUnit = celsius ? "C" : "F";
    let attrSnakeCase = attribute.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    let stateTopic = `controlmyspa/${spaId}/spa`;
    let objectId = `controlmyspa_${spaId}_${attrSnakeCase}`;
    let uniqueId = `${objectId}_sensor`;
    let valueTemplate = `{% if value_json.${attribute} is defined %}{{ value_json.${attribute} }}{% else %}unknown{% endif %}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": name,
      "icon": "mdi:thermometer",
      "device_class": "temperature",
      "state_class": "measurement",
      "unit_of_measurement": tempUnit,
      "state_topic": stateTopic,
      "value_template": valueTemplate,
      "availability": self.getAvailabilityDiscovery(spa),
      "device": self.getDeviceDiscovery(spa)
    };
    self.mqtt.publish("homeassistant/sensor/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  modeSensorDiscovery(spa, name, icon, attribute, mode1, mode2) {
    let self = this;
    let spaId = spa.getSpaId();
    let attrSnakeCase = attribute.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    let mode1Capitalized = mode1.charAt(0).toUpperCase()+mode1.slice(1).toLowerCase();
    let mode2Capitalized = mode2.charAt(0).toUpperCase()+mode2.slice(1).toLowerCase();
    let stateTopic = `controlmyspa/${spaId}/spa`;
    let objectId = `controlmyspa_${spaId}_${attrSnakeCase}`;
    let uniqueId = `${objectId}_sensor`;
    let valueTemplate = `{% if value_json.${attribute} is defined and value_json.${attribute} == "${mode1}"%}${mode1Capitalized}{% elif value_json.${attribute} is defined and value_json.${attribute} == "${mode2}" %}${mode2Capitalized}{% else %}unknown{% endif %}`
    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": name,
      "icon": icon,
      "state_topic": stateTopic,
      "value_template": valueTemplate,
      "availability": self.getAvailabilityDiscovery(spa),
      "device": self.getDeviceDiscovery(spa)
    };
    self.mqtt.publish("homeassistant/sensor/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  buttonDiscovery(spa, name, icon, attribute, payload) {
    let self = this;
    let spaId = spa.getSpaId();
    let attrSnakeCase = attribute.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    let commandTopic = `controlmyspa/${spaId}/${attribute}`;
    let objectId = `controlmyspa_${spaId}_${attrSnakeCase}`;
    let uniqueId = `${objectId}_sensor`;

    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": name,
      "icon": icon,
      "command_topic": commandTopic,
      "payload_press": payload,
      "availability": self.getAvailabilityDiscovery(spa),
      "device": self.getDeviceDiscovery(spa)
    };
    self.mqtt.publish("homeassistant/button/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  getDeviceDiscovery(spa) {
    let deviceInfo = spa.getDeviceInfo();
    let spaId = spa.getSpaId();
    let device = {
      "manufacturer": deviceInfo.dealerName,
      "model": deviceInfo.model,
      "identifiers": [deviceInfo.serialNumber, spaId],
      "name": "ControlMySpa",
      "suggested_area": "Spa"
    };
    return device;
  }

  getAvailabilityDiscovery(spa) {
    let spaId = spa.getSpaId();
    let topicPrefix = `controlmyspa/${spaId}`;
    let availability = {
      "topic": topicPrefix + "/spa",
      "value_template": "{% if value_json.online is defined and value_json.online %} Online {% else %} Offline {% endif %}",
      "payload_available": "Online",
      "payload_not_available": "Offline"
    };
    return availability;
  }

  climateDiscovery(spa) {
    let self = this;
    let spaId = spa.getSpaId();
    let useCelsius = spa.useCelsius();
    let name = 'ControlMySpa';
    let topicPrefix = `controlmyspa/${spaId}`;
    let stateTopic = `${topicPrefix}/spa`;
    let modeCommandTopic = `${topicPrefix}/heaterMode`;
    let tempCommandTopic = `${topicPrefix}/temp`;
    let actionTopic = `${topicPrefix}/heating/0`;
    let objectId = `controlmyspa_${spaId}`;
    let uniqueId = `${objectId}_climate`;
    let modes = ["off", "heat"];
    let tempStep = useCelsius ? 0.5 : 1;
    let precision = useCelsius ? 0.5 : 1;
    let tempUnit = useCelsius ? "C" : "F";
    let minTemp = spa.getRangeLowTemp();
    let maxTemp = spa.getRangeHighTemp();

    let config = {
      "unique_id": uniqueId,
      "object_id": objectId,
      "name": name,
      "icon": "mdi:hot-tub",
      "modes": modes,
      "mode_command_topic": modeCommandTopic,
      "mode_state_topic": stateTopic,
      "mode_state_template": "{% if value_json.heaterMode == \"REST\" %}off{% else %}heat{% endif %}",
      "temperature_command_topic": tempCommandTopic,
      "temperature_state_topic": stateTopic,
      "temperature_state_template": "{% if value_json.desiredTemp is defined %}{{ value_json.desiredTemp }}{% elif value_json.targetDesiredTemp is defined  %}{{ value_json.targetDesiredTemp }}{% else %}unknown{% endif %}",
      "temperature_command_template": "{{value}}",
      "current_temperature_topic": stateTopic,
      "current_temperature_template": "{% if value_json.currentTemp is defined %}{{value_json.currentTemp}}{% else %}unknown{% endif %}",
      "precision": precision,
      "temp_step": tempStep,
      "temperature_unit": tempUnit,
      "min_temp": minTemp,
      "max_temp": maxTemp,
      "action_topic": actionTopic,
      "action_template": "{% if (value_json.value == \"OFF\") %}off{% elif (value_json.value == \"HIGH\") %}heating{% else %}off{% endif %}",
      "availability": self.getAvailabilityDiscovery(spa),
      "device": self.getDeviceDiscovery(spa)
    };
    logDebug(`Send discover config for spa climate: ${JSON.stringify(config)}`);
    self.mqtt.publish("homeassistant/climate/" + objectId + "/config", JSON.stringify(config), { retain: true });
  }

  handleMessage(topic, payload) {
    let self = this;
    if (topic === self.config.hassTopic) {
      logInfo("HA reloaded");
      self.publishSpaState();
      self.discovery();
      return;
    }
    let parts = topic.split("/");
    let id;
    let command = parts.pop();
    if (command === "set") {
      id = parts.pop();
      command = parts.pop();
    }
    
    switch(command) {
      case 'refresh': 
        self.spa.updateSpa();
        break;
      case 'heaterMode': 
        self.toggleHeaterMode(payload);
        break;
      case 'tempRange':
        self.setTempRange(payload);
        break;
      case 'temp':
        self.setTemp(payload);
        break;
      case 'panelLock':
        self.setPanelLock(payload);
        break;
      case 'light':
        self.setLightState(id, payload);
        break;
      case 'blower':
        self.setBlowerState(id, payload);
        break;
      case 'pump':
        self.setJetState(id, payload);
        break;            
      default:
        logError(`Unrecognized command ${command}`)
    } 
  }

  toggleHeaterMode(payload) {
    let self = this;
    self.spa.toggleHeaterMode();
  }

  setTempRange(payload) {
    let self = this;
    self.spa.setTempRange("HIGH" === payload);
  }

  setTemp(payload) {
    let self = this;
    self.spa.setTemp(parseFloat(payload).toFixed(1))
  }

  setPanelLock(payload) {
    let self = this;
    self.spa.setPanelLock(payload === 'LOCK');
  }

  setLightState(id, payload) {
    let self = this;
    self.spa.setLightState(id, payload);
  }

  setBlowerState(id, payload) {
    let self = this;
    self.spa.setBlowerState(id, payload);
  }

  setJetState(id, payload) {
    let self = this;
    self.spa.setJetState(id, payload);
  }
}
const app = new App(config);