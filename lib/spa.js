const EventEmitter = require('events');
const logDebug = require('debug')('spa:debug');
const logError = require('debug')('spa:error');
const logInfo = require('debug')('spa:info');

class Spa extends EventEmitter {
  client;
  initialized = false;
  refreshAfterUpdate = 5 * 1000;

  constructor(client, config) {
    super();

    this.client = client;
    this.client.waitForResult = true;

    this.registerListeners();
  }

  init() {
    this.client.init()
    .then(s => {
      this.initialized = true;
      this.emit('initialized')
      this.emit('status_updated');
    }).catch(err => logError(`Failed to initialize client: ${err}`));
  }

  registerListeners() {
    let self = this;
    self.on('initialized', () => {
      logInfo('Initialized')
      logInfo(`Client token data: ${JSON.stringify(self.client.tokenData)}`)
      setInterval(() => {
        self.refreshToken();
      }, self.tokenRefreshInterval());
    });
    self.on('token_updated', () => {
      setTimeout(() => {
        self.updateSpa();
      }, 100);
    });
  }

  refreshToken() {
    let self = this;
    self.client.login().then(res => {
      logDebug(`Token expires in ${self.client.tokenData.expires_in}`)
      self.emit('token_updated');
    }).catch(err => logError(`Failed to login:  ${err}`));

  }

  tokenRefreshInterval() {
    let self = this;
    let expires_in = self.client.tokenData.expires_in || 3600;
    return (expires_in - 60) * 1000;
  }

  updateSpa() {
    let self = this;
    self.client.getSpa().then(s => {
      self.emit('status_updated')
    }).catch(err => logError(`Failed to update spa:  ${err}`))
  }

  getDeviceInfo() {
    let spa = this.getCurrentSpa();
    let info = {
      serialNumber: spa.serialNumber,
      productName: 'N/A',//spa.productName,
      model: 'N/A',//spa.model,
      dealerName: spa.dealer.name,
      registrationDate: 'N/A',//spa.registrationDate,
      manufacturedDate: 'N/A',//spa.manufacturedDate,
      buildNumber: spa.systemInfo.buildNumber
    };
    return info;
  }

  getOwnerInfo() {
    let owner = this.getCurrentSpaOwner();
    let info = {
      firstName: owner.firstName,
      lastName: owner.lastName,
      phone: owner.phone,
      email: owner.email,
      address: owner.address?.address1,
      fullName: owner.firstName + ' ' + owner.lastName
    };
    return info;
  }

  getSpaId() {
    return this.client.currentSpaId;
  }

  isOnline() {
    return this.getCurrentState().isOnline;
  }

  useCelsius() {
    return this.getCurrentState().isCelsius;
  }

  getHeaterMode() {
    return this.getCurrentState().heaterMode;
  }

  getDesiredTemp() {
    let temp = this.getCurrentState().desiredTemp;
    if ("NaN" === temp || parseFloat(temp) <= 0) {
      return undefined;
    }
    return temp;
  }

  getCurrentTemp() {
    let temp = this.getCurrentState().currentTemp;
    if ("NaN" === temp || parseFloat(temp) <= 0) {
      return undefined;
    }
    return temp;
  }

  getTargetDesiredTemp() {
    let temp = this.getCurrentState().targetDesiredTemp;
    if ("NaN" === temp || parseFloat(temp) <= 0) {
      return undefined;
    }
    return temp;
  }

  getRangeLowTemp() {
    let temp = this.getTempRange() == "HIGH" ? this.getCurrentState().rangeLimits.highRangeLow : this.getCurrentState().rangeLimits.lowRangeLow;
    if (this.useCelsius()) {
      return Math.round(((parseFloat(temp) - 32) * (5 / 9)).toFixed(1) / 0.5) * 0.5;
    }
    return temp;
  }

  getRangeHighTemp() {
    let temp = this.getTempRange() == "HIGH" ? this.getCurrentState().rangeLimits.highRangeHigh : this.getCurrentState().rangeLimits.lowRangeHigh;
    if (this.useCelsius()) {
      return  Math.round(((parseFloat(temp) - 32) * (5 / 9)).toFixed(1) / 0.5) * 0.5;
    }
    return temp;
  }

  getLights() {
    return this.getComponents("LIGHT");
  }

  getPumps() {
    return this.getComponents("PUMP");
  }

  getHeaters() {
    let heaters = this.getComponents("HEATER");
    
    // Workaround, API not sending heater data when heater is OFF
    if(!heaters.length) {
      let spa = this.getCurrentSpa();      
      let now = new Date();

      let heaterData = [{
        componentId: null,        
        serialNumber: spa.serialNumber,
        alertState: null,
        materialType: null,
        targetValue: null,
        name: 'HEATER',
        componentType: 'HEATER',
        value: 'OFF',
        availableValues: [],
        registeredTimestamp: now.toISOString(),
        port: 0,
        hour: null,
        minute: null, 
        durationMinutes: null
      },
      {
        componentId: null,        
        serialNumber: spa.serialNumber,
        alertState: null,
        materialType: null,
        targetValue: null,
        name: 'HEATER',
        componentType: 'HEATER',
        value: 'OFF',
        availableValues: [],
        registeredTimestamp: now.toISOString(),
        port: 1,
        hour: null,
        minute: null, 
        durationMinutes: null
      }];

      heaters = heaterData;
    }
      
    return heaters;
  }  

  getCirculationPumps() {
    return this.getComponents("CIRCULATION_PUMP");
  }

  getFilters() {
    return this.getComponents("FILTER");
  }

  getOzone() {
    return this.getComponents("OZONE");
  }

  getBlowers() {
    return this.getComponents("BLOWER");
  }


  getComponents(type) {
    logDebug(`Reading component ${type} value`);
    return this.getCurrentState().components.filter(x => x.componentType == type);
  } 

  getTempRange() {
    return this.getCurrentState().tempRange;
  }

  getTime() {
    const time = this.getCurrentState().time;

    if (!time || !time.includes(":")) {
      logError("Invalid time format");
      return null;
    }

    const [hour, minute] = time.split(":").map(Number);
    const paddedHour = String(hour).padStart(2, "0");
    const paddedMinute = String(minute).padStart(2, "0");

    return `${paddedHour}:${paddedMinute}`;
  }

  getFilterSchedule(port) {
    const filter = this.getComponents("FILTER").find(c => c.port === port);

    if (!filter) {
      logError(`Filter with port ${port} not found`);
      return null;
    }
    const hour = String(filter.hour).padStart(2, "0");
    const minute = String(filter.minute).padStart(2, "0");

    return {
      port: filter.port,
      time: `${hour}:${minute}`,
      durationMinutes: filter.durationMinutes
    };
  }

  getCurrentSpaOwner() {
    return this.client.userInfo;
  }

  getCurrentSpa() {
    return this.client.currentSpa;
  }

  getCurrentState() {
    return this.client.currentSpa;
  }

  isPanelLocked() {
    return this.getCurrentState().isPanelLocked;
  }

  toggleHeaterMode() {
    let self = this;
    let newMode = 'READY';
    let curMode = this.getHeaterMode();
    if(curMode == 'READY') {
      newMode = 'REST';
    }
    self.client.setHeaterMode(newMode).then(res => {
      logDebug(`Toggle heater mode complete: ${JSON.stringify(res)}`)
      if (res && curMode !== this.getHeaterMode()) {
        this.emit('status_updated')
      } else {
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to toggle heater mode: ${err}`));
  }

  setLightState(light, state) {
    let self = this;
    self.client.setComponentState("light", light, state).then(res => {
      logDebug(`Set light '${light}' state '${state}' complete: ${JSON.stringify(res)}`)
      let curState = this.getLights()[light].value;
      if (res && curState === state) {
        this.emit('status_updated')
      } else {
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to set light ${light} state ${state}: ${err}`))
  }

  setBlowerState(blower, state) {
    let self = this;
    self.client.setComponentState("blower", blower, state).then(res => {
      logDebug(`Set blower ${blower} state ${state} complete: ${JSON.stringify(res)}`)
      let curState = this.getBlowers()[blower].value;
      if (res && curState === state) {
        this.emit('status_updated')
      } else {
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to set blower ${blower} state ${state}: ${err}`))
  }

  setJetState(jet, state) {
    let self = this;
    self.client.setComponentState("jet", jet, state).then(res => {
      logDebug(`Set jet ${jet} state ${state} complete: ${JSON.stringify(res)}`)
      let curState = this.getPumps()[jet].value;
      if (res && curState === state) {
        this.emit('status_updated')
      } else {
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to set jet ${jet} state ${state}: ${err}`))
  }

  setTempRange(high) {
    let self = this;
    self.client.setTempRange(high).then(res => {
      logDebug(`Set temp range high ${high} complete: ${JSON.stringify(res)}`)
      let desiredRange = high ? "HIGH" : "LOW";
      let curRange = this.getTempRange();
      if (res && desiredRange === curRange) {
        this.emit('temp_range_updated');
        this.emit('status_updated');
      } else {
        this.client.currentSpa.tempRange = desiredRange;
        this.emit('temp_range_updated');
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to set temp range high ${high}: ${err}`))
  }

  toggleTempRange() {
    let self = this;
    let newMode = 'HIGH';
    let curMode = this.getTempRange();
    if(curMode == 'HIGH') {
      newMode = 'LOW';
    }
    self.client.setTempRange(newMode == 'HIGH').then(res => {
      logDebug(`Toggle temp range complete: ${JSON.stringify(res)}`)
      if (res && curMode !== this.getTempRange()) {
        this.emit('status_updated')
      } else {
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to toggle temp range: ${err}`));
  }  

  setTemp(temp) {
    let self = this;
    self.client.setTemp(temp).then(res => {
      logDebug(`Set temp ${temp} complete: ${JSON.stringify(res)}`)
      let desiredTemp = this.getDesiredTemp() ? this.getDesiredTemp() : this.getTargetDesiredTemp();
      if (`${temp}` === `${desiredTemp}`) {
        this.emit('status_updated')
      } else {
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to set temp ${temp}: ${err}`))
  }

  setPanelLock(locked) {
    let self = this;
    self.client.setPanelLock(locked).then(res => {
      logDebug(`Set panel lock ${locked} complete: ${JSON.stringify(res)}`)
      if (res && this.isPanelLocked() === locked) {
        this.emit('status_updated')
      } else {
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to set panel lock ${locked}: ${err}`))
    }

  syncTime() {
    let self = this;
    let now = new Date();
    self.client.setTime(now).then(res => {
      logDebug(`Set time to ${now} complete: ${JSON.stringify(res)}`)
      if (res) {
        this.emit('status_updated')
      } else {
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to set time to ${now}: ${err}`))
  }

  setFilterSchedule(id, subCommand, payload) {
    let self = this;
    if (subCommand === "enabled") {
      self.client.setFilterCycle2State(payload).then(res => {
        logDebug(`Set filter 2 enabled to ${payload} complete: ${JSON.stringify(res)}`)
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }).catch(err => logError(`Failed to set filter 2 enabled to ${payload}: ${err}`))
    }
    else {
      console.log(`Setting filter schedule for id ${id} subCommand ${subCommand} with payload: ${JSON.stringify(payload)}`);
      let time;
      let durationMinutes;
      let filter = this.getCurrentState().components.find(c => c.port === id && c.componentType === "FILTER");
      if (subCommand === "duration") {
        time = `${filter.hour.toString().padStart(2, '0')}:${filter.minute.toString().padStart(2, '0')}`; // Get current time for the filter
        durationMinutes = payload / 15; // Convert 15-minute intervals to units of 15 minutes
      } else if (subCommand === "time") {
        time = payload; // Use the provided time directly
        durationMinutes = filter.durationMinutes / 15; // Get current duration for the filter and convert to units of 15 minutes
      } else {
        logError(`Invalid subCommand: ${subCommand}`);
        return;
      }
      self.client.setFilterCycleIntervalSchedule(id, durationMinutes, time).then(res => {
        console.log('Set filter schedule complete:', res);
        }).catch(err => logError(`Failed to set filter schedule for id ${id} subCommand ${subCommand}: ${err}`));
      }   
    }

}

module.exports = Spa;
