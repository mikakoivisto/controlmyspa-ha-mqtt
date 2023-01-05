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
    });
  }

  registerListeners() {
    let self = this;
    self.on('initialized', () => {
      setInterval(() => {
        self.refreshToken();
      }, (self.client.tokenData.expires_in - 60) * 1000);
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
      productName: spa.productName,
      model: spa.model,
      dealerName: spa.dealerName,
      registrationDate: spa.registrationDate,
      manufacturedDate: spa.manufacturedDate,
      buildNumber: spa.buildNumber
    };
    return info;
  }

  getOwnerInfo() {
    let owner = this.getCurrentSpa().owner;
    let info = {
      firstName: owner.firstName,
      lastName: owner.lastName,
      phone: owner.phone,
      email: owner.email,
      address: owner.address,
      fullName: owner.fullName
    };
    return info;
  }

  getSpaId() {
    return this.client.currentSpa._id;
  }

  isOnline() {
    return this.getCurrentState().online;
  }

  useCelsius() {
    return this.getCurrentState().celsius;
  }

  getHeaterMode() {
    return this.getCurrentState().heaterMode;
  }

  getDesiredTemp() {
    let temp = this.getCurrentState().desiredTemp;
    if ("NaN" === temp) {
      return undefined;
    }
    return temp;
  }

  getCurrentTemp() {
    let temp = this.getCurrentState().currentTemp;
    if ("NaN" === temp) {
      return undefined;
    }
    return temp;
  }

  getTargetDesiredTemp() {
    let temp = this.getCurrentState().targetDesiredTemp;
    if ("NaN" === temp) {
      return undefined;
    }
    return temp;
  }

  getRangeLowTemp() {
    let temp = this.getTempRange() == "HIGH" ? this.getCurrentState().setupParams.highRangeLow : this.getCurrentState().setupParams.lowRangeLow;
    if (this.useCelsius()) {
      return Math.round(((parseFloat(temp) - 32) * (5 / 9)).toFixed(1) / 0.5) * 0.5;
    }
    return temp;
  }

  getRangeHighTemp() {
    let temp = this.getTempRange() == "HIGH" ? this.getCurrentState().setupParams.highRangeHigh : this.getCurrentState().setupParams.lowRangeHigh;
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
    return this.getComponents("HEATER");
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
    return this.getCurrentState().components.filter(x => x.componentType == type);
  } 

  getTempRange() {
    return this.getCurrentState().tempRange;
  }

  getCurrentSpa() {
    return this.client.currentSpa;
  }

  getCurrentState() {
    return this.client.currentSpa.currentState;
  }

  isPanelLocked() {
    return this.getCurrentState().panelLock;
  }

  toggleHeaterMode() {
    let self = this;
    let curMode = this.getHeaterMode();
    self.client.toggleHeaterMode().then(res => {
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
    self.client.setLightState(light, state).then(res => {
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
    self.client.setBlowerState(blower, state).then(res => {
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
    self.client.setJetState(jet, state).then(res => {
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
        this.emit('status_updated')
      } else {
        setTimeout(() => self.updateSpa(), self.refreshAfterUpdate);
      }
    }).catch(err => logError(`Failed to set temp range high ${high}: ${err}`))
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
}
module.exports = Spa;