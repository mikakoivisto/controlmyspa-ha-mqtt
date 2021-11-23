const ControlMySpa = require('controlmyspajs')
const mqttApi = require ('mqtt')

var CONFIG
var mqttConnected = false

// Setup Exit Handwlers
process.on('exit', processExit.bind(null, 0))
process.on('SIGINT', processExit.bind(null, 0))
process.on('SIGTERM', processExit.bind(null, 0))
process.on('uncaughtException', function(err) {
    console.log(err)
    processExit(2)
})

// Set offline status on exit
async function processExit(exitCode) {
  // TODO set status to offline
  process.exit(exitCode)
}

// Initiate the connection to MQTT broker
function initMqtt() {
  const mqtt_user = CONFIG.mqtt_user ? CONFIG.mqtt_user : null
  const mqtt_pass = CONFIG.mqtt_pass ? CONFIG.mqtt_pass : null
  const mqtt = mqttApi.connect({
      host:CONFIG.host,
      port:CONFIG.port,
      username: mqtt_user,
      password: mqtt_pass
  });
  return mqtt
}

// MQTT initialization successful, setup actions for MQTT events
function startMqtt(mqttClient, spa) {
  // On MQTT connect/reconnect send config/state information after delay
  mqttClient.on('connect', async function () {
      if (!mqttConnected) {
          mqttConnected = true
          console.log('MQTT connection established, discovering spa...')
      }
      await discovery(mqttClient, spa)
      await sleep(5)
      online(mqttClient, spa)
      updateData(mqttClient, spa)
      setTimeout(function() {updateLogin(spa)}, (spa.tokenData.expires_in - 300)*1000)
  })

  mqttClient.on('reconnect', function () {
      if (mqttConnected) {
          console.log('Connection to MQTT broker lost. Attempting to reconnect...')
      } else {
          console.log('Attempting to reconnect to MQTT broker...')
      }
      mqttConnected = false
  })

  mqttClient.on('error', function (error) {
      console.log('Unable to connect to MQTT broker.', error.message)
      mqttConnected = false
  })

  // Process MQTT messages from subscribed command topics
  mqttClient.on('message', async function (topic, message) {
    processMqttMessage(topic, message, mqttClient, spa)
  })
}

 // Sleep function (seconds)
async function sleep(sec) {
  return msleep(sec*1000)
}

// Sleep function (milliseconds)
async function msleep(msec) {
  return new Promise(res => setTimeout(res, msec))
}

// Create CONFIG object from file or envrionment variables
async function initConfig(configFile) {
  console.log('Using configuration file: '+configFile)
  try {
      CONFIG = require(configFile)
  } catch (error) {
      console.log('Configuration file not found, attempting to use environment variables for configuration.')
      CONFIG = {
          "host": process.env.MQTTHOST,
          "port": process.env.MQTTPORT,
          "hass_topic": process.env.MQTTHASSTOPIC,
          "mqtt_user": process.env.MQTTUSER,
          "mqtt_pass": process.env.MQTTPASSWORD,
          "controlmyspa_user": process.env.CONTROLMYSPA_USER,
          "controlmyspa_pass": process.env.CONTROLMYSPA_PASS,
          "poll_interval": process.env.CONTROLMYSPA_POLL_INTERVAL
      }
  }
    // If there's no configured settings, force some defaults.
  CONFIG.host = CONFIG.host ? CONFIG.host : 'localhost'
  CONFIG.port = CONFIG.port ? CONFIG.port : '1883'
  CONFIG.hass_topic = CONFIG.hass_topic ? CONFIG.hass_topic : 'homeassistant/status'
  CONFIG.poll_interval = CONFIG.poll_interval ? CONFIG.poll_interval : 60
}

async function discovery(mqttClient, spa) {
  let entityId = "spa_" + spa.currentSpa._id  
  let discoveryMessage = {
    "name": "ControlMySpa " + spa.currentSpa._id,
    "mode_cmd_t":"homeassistant/climate/" + entityId + "/mode_command",
    "mode_stat_t":"homeassistant/climate/" + entityId + "/state",
    "mode_stat_tpl":"{{ value_json.mode}}",
    "avty_t":"homeassistant/climate/" + entityId + "/available",
    "pl_avail":"online",
    "pl_not_avail":"offline",
    "temp_cmd_t":"homeassistant/climate/" + entityId + "/target_temp_command",
    "temp_stat_t":"homeassistant/climate/" + entityId + "/state",
    "temp_stat_tpl":"{{ value_json.target_temp}}",
    "curr_temp_t":"homeassistant/climate/" + entityId + "/state",
    "curr_temp_tpl":"{{value_json.current_temp}}",
    "min_temp":"10",
    "max_temp":"40",
    "temp_step":"0.5",
    "temperature_unit":"C",  
    "modes":["off", "heat"]
  }

  console.log(JSON.stringify(discoveryMessage))
  mqttClient.publish("homeassistant/climate/"+ entityId + "/config", JSON.stringify(discoveryMessage), { qos: 1 })
  mqttClient.subscribe("homeassistant/climate/" + entityId + "/target_temp_command")
  mqttClient.subscribe("homeassistant/climate/" + entityId + "/mode_command")
}

function online(mqttClient, spa) {
  let entityId = "spa_" + spa.currentSpa._id 
  mqttClient.publish("homeassistant/climate/" + entityId + "/available", "online")
}

function updateData(mqttClient, spa) {
  try {
    spa.getSpa()
    let payload = {
      "mode": spa.currentSpa.currentState.heaterMode == "REST" ? "off" : "heat"
    }
    try {
      payload.target_temp = parseFloat(spa.currentSpa.currentState.desiredTemp).toFixed(1)
    } catch (e) {}
    try {
      payload.current_temp = parseFloat(spa.currentSpa.currentState.currentTemp).toFixed(1)
    } catch (e) {}

    console.log(JSON.stringify(payload))
    let entityId = "spa_" + spa.currentSpa._id 
    mqttClient.publish("homeassistant/climate/" + entityId + "/state", JSON.stringify(payload))
  } catch (e) {
    console.log(e)
  }
  setTimeout(function() { updateData(mqttClient, spa)}, CONFIG.poll_interval*1000)
}

function updateLogin(spa) {
  console.log("Updating login tokens")
  try {
    spa.login()
    console.log("Token expires in " + spa.tokenData.expires_in)
  } catch (e) {
    console.log(e)
  }
  setTimeout(function() {updateLogin(spa)}, (spa.tokenData.expires_in - 300)*1000)
}

async function processMqttMessage(topic, message, mqttClient, spa) {
  message = message.toString()
  if (topic === CONFIG.hass_topic || topic === 'hass/status' || topic === 'hassio/status') {
    if (message == 'online') {
      console.log("Home assistant restart detected")
      discovery(mqttClient, spa)
    }
  } else {
    if (topic.endsWith("/mode_command")) {
      await spa.getSpa()
      if (spa.currentSpa.currentState.heaterMode == "REST" && message == "heat") {
        console.log("Toggle heater mode REST => READY")
        await spa.toggleHeaterMode()
      } else if (spa.currentSpa.currentState.heaterMode == "READY" && message == "off") {
        console.log("Toggle heater mode READY => REST")
        await spa.toggleHeaterMode()
      } else {
        console.log("Current heater mode already " + spa.currentSpa.currentState.heaterMode)
      }
    } else if (topic.endsWith("/target_temp_command")) {
      console.log("Set spa temp to " + message)
      await spa.setTemp(message)
    } else {
      console.log(topic + ": " + message)
    }
    updateData(mqttClient, spa)
    sleep(5)
    updateData(mqttClient, spa)
  }
}

// Main code loop
const main = async() => {
  let configFile = './config.json'
  let controlMySpaClient
  let mqttClient

  // Initiate CONFIG object from file or environment variables
  await initConfig(configFile)

  if (!CONFIG.controlmyspa_user || !CONFIG.controlmyspa_pass) {
    console.log("ControlMySpa credentials not configured")
    process.exit(2)
  }

  controlMySpaClient = new ControlMySpa(CONFIG.controlmyspa_user, CONFIG.controlmyspa_pass)

  await controlMySpaClient.init()
  controlMySpaClient.waitForResult = true
 
  // Initiate connection to MQTT broker
  try {
    console.log('Starting connection to MQTT broker...')
    mqttClient = initMqtt()
    if (mqttClient.connected) {
        mqttConnected = true
        console.log('MQTT connection established, sending config/state information in 5 seconds.')
    }
    // Monitor configured/default Home Assistant status topic
    mqttClient.subscribe(CONFIG.hass_topic)
    startMqtt(mqttClient, controlMySpaClient)
  } catch (error) {
      console.log(error)
      console.log( 'Couldn\'t authenticate to MQTT broker. Please check the broker and configuration settings.')
      process.exit(1)
  }

  // do {
  //   await controlMySpaClient.getSpa()
  //   let state = {
  //     "tempRange": controlMySpaClient.currentSpa.currentState.tempRange,
  //     "currentTemp": controlMySpaClient.currentSpa.currentState.currentTemp,
  //     "desiredTemp": controlMySpaClient.currentSpa.currentState.desiredTemp,
  //     "targetDesiredTemp": controlMySpaClient.currentSpa.currentState.targetDesiredTemp,
  //     "heaterMode": controlMySpaClient.currentSpa.currentState.heaterMode,
  //     "heaters": controlMySpaClient.currentSpa.currentState.components.filter(x => x.componentType == "HEATER"),
  //     "filters": controlMySpaClient.currentSpa.currentState.components.filter(x => x.componentType == "FILTER"),
  //     "pumps": controlMySpaClient.currentSpa.currentState.components.filter(x => x.componentType == "PUMP"),
  //     "circulationPump": controlMySpaClient.currentSpa.currentState.components.filter(x => x.componentType == "CIRCULATION_PUMP"),
  //     "ozone": controlMySpaClient.currentSpa.currentState.components.filter(x => x.componentType == "OZONE"),
  //     "lights": controlMySpaClient.currentSpa.currentState.components.filter(x => x.componentType == "LIGHT")
  //   }
  //   console.log(JSON.stringify(state))
  //   await sleep(10)
  // } while(1)
}

main()
