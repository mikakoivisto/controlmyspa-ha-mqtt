const querystring = require('querystring');
const axios = require('axios').default;

const logDebug = require('debug')('spa:debug');
const logError = require('debug')('spa:error');
const logInfo = require('debug')('spa:info');

class ControlMySpa {
  constructor (email, password, celsius = true) {
    this.celsius = celsius;
    this.email = email;
    this.password = password;

    // Access token data
    this.tokenData = null;

    // WhoAMI / Owner
    this.userInfo = null;

    // Spa setup
    this.currentSpa = null;
    this.currentSpaId = null;

    // Urls
    this.tokenEndpoint = null;
    this.refreshEndpoint = null;
    this.whoami = null;

    // client info
    this.mobileClientId = null;
    this.mobileClientSecret = null;

    this.waitForResult = false;

    this.scheduleFilterIntervalEnum = null;
    this.createFilterScheduleIntervals();
  }

  async init () {
    return (
      (await this.idm()) &&
      (await this.login()) &&
      (await this.getProfile()) &&
      (await this.getSpa())
    );
  }

  async idm () {
    logDebug('Requesting IDM info');

    const req = await axios.get(
      'https://iot.controlmyspa.com/idm/tokenEndpoint',
      {
        headers: {
          Accept: '*/*',
          'User-Agent': 'okhttp/4.9.0',
          'Accept-Encoding': 'gzip',
          Connection: 'Keep-Alive'
        }
      }
    );

    if (req.status === 200) {
      const body = req.data;

      this.mobileClientId = body.mobileClientId;
      this.mobileClientSecret = body.mobileClientSecret;
      this.tokenEndpoint = body._links.tokenEndpoint.href;
      this.refreshEndpoint = body._links.refreshEndpoint.href;
      this.whoami = body._links.whoami.href;

      logDebug(`IDM data received ${JSON.stringify(body)}`);

    } else {
      logError('Error getting IDM info');
    }

    return req.status === 200;
  }

  async login () {
    logDebug('Trying to login, endpoint ' + this.tokenEndpoint);

    const form = {
      grant_type: 'password',
      password: this.password,
      scope: 'openid user_name',
      username: this.email,
      email: this.email
    };

    const formData = querystring.stringify(form);
    const contentLength = formData.length;

    const req = await axios.post(this.tokenEndpoint, formData, {
      headers: {
        Accept: '*/*',
        'User-Agent': 'okhttp/4.9.0',
        'Accept-Encoding': 'gzip',
        'Content-Length': contentLength,
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(
            this.mobileClientId + ':' + this.mobileClientSecret
          ).toString('base64')
      }
    });

    if (req.status === 200 || req.status === 201) {
      const body = req.data.data;
      this.tokenData = body;

      logDebug(`Login ok with received data: ${JSON.stringify(req.data)}`);
      return true;
    } else {
      throw new Error('Failed to login: ' + req.status);
    }
  }

  async getProfile () {
    logDebug('Requesting profile data');

    const req = await axios.get(
      'https://iot.controlmyspa.com/user-agreements/current', {
      headers: {
        Accept: '*/*',
        'User-Agent': 'okhttp/4.9.0',
        'Accept-Encoding': 'gzip',
        Connection: 'Keep-Alive',
        Authorization: 'Bearer ' + this.tokenData.accessToken
      }
    });

    if (req.status === 200) {
      const body = req.data.data.agreement.userId;
      this.userInfo = body;

      // Possible problem point if there are more spas
      this.currentSpaId = body.spaId;

      logDebug(`User profile found ${JSON.stringify(this.userInfo)}`);
      return this.userInfo;
    } else {
      throw new Error('Cannot get profile data: ' + req.status);
    }

    return false;
  }

  async getSpa () {
    logDebug('Requesting spa data');

    const req = await axios.get(
      'https://iot.controlmyspa.com/spas/' + this.currentSpaId + '/dashboard',
      {
        headers: {
          Accept: '*/*',
          'User-Agent': 'okhttp/4.9.0',
          'Accept-Encoding': 'gzip',
          Connection: 'Keep-Alive',
          Authorization: 'Bearer ' + this.tokenData.accessToken
        }
      }
    );

    if (req.status === 200) {
      const body = req.data.data;

      this.currentSpa = body;

      if (this.celsius) {
        this.currentSpa.desiredTemp = (
          (parseFloat(this.currentSpa.desiredTemp) - 32) *
          (5 / 9)
        ).toFixed(1);
               
        this.currentSpa.currentTemp = (
          (parseFloat(this.currentSpa.currentTemp) - 32) *
          (5 / 9)
        ).toFixed(1);
      }

      logDebug(`Current spa data: ${JSON.stringify(this.currentSpa)}`);
      return this.currentSpa;
    } else {
      logError('failed to get spa data');
    }

    return false;
  }

  async setTemp (temp) {
    let toSet = temp;
    if (this.celsius) {
      toSet = ((temp / 5) * 9 + 32).toFixed(1);
    }

    const tempData = {
      spaId: this.currentSpaId,
      value: parseFloat(toSet),
      via: 'MOBILE'
    };

    logDebug(`Setting spa temp, payload ${JSON.stringify(tempData)}`);

    const req = await axios.post(
      'https://iot.controlmyspa.com/spa-commands/temperature/value',
      tempData,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'okhttp/4.9.0',
          'Accept-Encoding': 'gzip',
          'Content-Length': JSON.stringify(tempData).length,
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.tokenData.accessToken
        }
      }
    );

    if (req.status === 200) {
      const body = req.data.data;
      
      this.currentSpa.desiredTemp = body.command.values.DESIREDTEMP;
      if (this.celsius) {
        this.currentSpa.desiredTemp = (
          (parseFloat(body.command.values.DESIREDTEMP) - 32) *
          (5 / 9)
        ).toFixed(1);
      }
    } else {
      logError('failed to set spa temp');
    }

    return req.status === 200;
  }

  async setTempRangeHigh () {
    return await this.setTempRange(true);
  }

  async setTempRangeLow () {
    return await this.setTempRange(false);
  }

  sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async setTempRange (high) {

    const tempData = {
      desiredState: high ? 'HIGH' : 'LOW'
    };

    logDebug(`Setting temp range, payload ${JSON.stringify(tempData)}`);

    const req = await axios.post(
      'https://iot.controlmyspa.com/spa-commands/temperature/range',
      tempData,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'okhttp/4.9.0',
          'Accept-Encoding': 'gzip',
          'Content-Length': JSON.stringify(tempData).length,
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.tokenData.accessToken
        }
      }
    );

    if (req.status === 200) {
      const oldTemp = this.currentSpa.desiredTemp;

      if (this.waitForResult) {
        await this.sleep(3000);
        const newSpaData = await this.getSpa();

        logInfo(
          oldTemp +
          (this.celsius ? ' C' : ' F') +
          ' => ' +
          newSpaData.desiredTemp +
          (this.celsius ? ' C' : ' F')
        );

        return newSpaData;
      }

      return true;
    } else {
      logError('failed to set temp');
    }

    return false;
  }

  async lockPanel () {
    return await this.setPanelLock(true);
  }

  async unlockPanel () {
    return await this.setPanelLock(false);
  }

  async setPanelLock (locked) {

    const panelData = {
      spaId: this.currentSpaId,
      state: locked ? 'LOCK_PANEL' : 'UNLOCK_PANEL',
      via: 'MOBILE'
    };

    logDebug(`Setting spa panel lock, payload ${JSON.stringify(panelData)}`);

    const req = await axios.post(
      'https://iot.controlmyspa.com/spa-commands/panel/state',
      panelData,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'okhttp/4.9.0',
          'Accept-Encoding': 'gzip',
          'Content-Length': JSON.stringify(panelData).length,
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.tokenData.accessToken
        }
      }
    );

    if (req.status === 200) {
      const oldState = this.currentSpa.isPanelLocked;

      if (this.waitForResult) {
        await this.sleep(3000);
        const newSpaData = await this.getSpa();

        logInfo(
          (oldState ? 'LOCKED' : 'UNLOCKED') +
          ' => ' +
          (newSpaData.isPanelLocked ? 'LOCKED' : 'UNLOCKED')
        );

        return newSpaData;
      }

      return true;
    } else {
      logError('failed to set panel lock');
    }

    return false;
  }

  async setJetState (deviceNumber, desiredState) {

    // numbers 0,1,2  || states: HIGH , OFF
    if (desiredState !== 'OFF' && desiredState !== 'HIGH') {
      logError('Invalid value for desired jet state');
      return false;
    }

    const jetState = {      
      deviceNumber: parseInt(deviceNumber),
      state: desiredState,
      spaId: this.currentSpaId,
      componentType: 'jet',
      via: 'MOBILE'
    };
    
    logDebug(`Setting jet state, payload ${JSON.stringify(jetState)}`);

    const req = await axios.post(
      'https://iot.controlmyspa.com/spa-commands/component-state',
      jetState,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'okhttp/4.9.0',
          'Accept-Encoding': 'gzip',
          'Content-Length': JSON.stringify(jetState).length,
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.tokenData.accessToken
        }
      }
    );

    if (req.status === 200) {
      const oldState = this.currentSpa.components.find(
        (el, id) => {
          return (
            el.componentType === 'PUMP' && el.port === deviceNumber.toString()
          );
        }
      );

      if (this.waitForResult) {
        await this.sleep(3000);
        const newSpaData = await this.getSpa();

        const newState = newSpaData.components.find((el, id) => {
          return (
            el.componentType === 'PUMP' && el.port === deviceNumber.toString()
          );
        });

        logInfo(oldState.value + ' => ' + newState.value);
        return newSpaData;
      }

      return true;
    } else {
      logError('Failed to set jet state');
    }

    return false;
  }

  async setBlowerState (deviceNumber, desiredState) {
    // numbers 0,1,2  || states: HIGH , OFF
    if (desiredState !== 'OFF' && desiredState !== 'HIGH') {
      logError('Invalid value for desired state');
      return false;
    }

    const blowerState = {
      deviceNumber: parseInt(deviceNumber),
      state: desiredState,
      spaId: this.currentSpaId,
      componentType: 'blower',
      via: 'MOBILE'
    };

    logDebug(`Setting blower state, payload ${JSON.stringify(jetState)}`);

    const req = await axios.post(
      'https://iot.controlmyspa.com/spa-commands/component-state',
      jetState,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'okhttp/4.9.0',
          'Accept-Encoding': 'gzip',
          'Content-Length': JSON.stringify(blowerState).length,
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.tokenData.accessToken
        }
      }
    );

    if (req.status === 200) {
      const oldState = this.currentSpa.components.find(
        (el, id) => {
          return (
            el.componentType === 'BLOWER' && el.port === deviceNumber.toString()
          );
        }
      );

      if (this.waitForResult) {
        await this.sleep(3000);
        const newSpaData = await this.getSpa();

        const newState = newSpaData.components.find((el, id) => {
          return (
            el.componentType === 'BLOWER' && el.port === deviceNumber.toString()
          );
        });

        logInfo(oldState.value + ' => ' + newState.value);
        return newSpaData;
      }

      return true;
    } else {
      logError('Failed to set blower state');
    }

    return false;
  }

  async setLightState (deviceNumber, desiredState) {

    // numbers 0,1,2  || states: HIGH , OFF
    if (desiredState !== 'OFF' && desiredState !== 'HIGH') {
      logError('Invalid value for desired state');
      return false;
    }

    const lightState = {
      spaId: this.currentSpaId,
      deviceNumber: parseInt(deviceNumber),
      state: desiredState,
      componentType: 'light',
      via: 'MOBILE'
    };

    logDebug(`Setting spa light, payload ${JSON.stringify(lightState)}`);

    const req = await axios.post(
      'https://iot.controlmyspa.com/spa-commands/component-state',
      lightState,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'okhttp/4.9.0',
          'Accept-Encoding': 'gzip',
          'Content-Length': JSON.stringify(lightState).length,
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.tokenData.accessToken
        }
      }
    );

    if (req.status === 200) {
      const oldState = this.currentSpa.components.find(
        (el, id) => {
          return (
            el.componentType === 'LIGHT' && el.port === deviceNumber.toString()
          );
        }
      );

      if (this.waitForResult) {
        await this.sleep(3000);
        const newSpaData = await this.getSpa();

        const newState = newSpaData.components.find((el, id) => {
          return (
            el.componentType === 'LIGHT' && el.port === deviceNumber.toString()
          );
        });

        logInfo(oldState.value + ' => ' + newState.value);
        return newSpaData;
      }

      return true;
    } else {
      logError('Failed to set light state');
    }

    return false;
  }

  async setHeaterMode (desiredState) {

    // numbers 0,1,2  || states: HIGH , OFF
    if (desiredState !== 'REST' && desiredState !== 'READY') {
      logError('Invalid value for desired state');
      return false;
    }

    const heaterMode = {
      mode: desiredState,
      spaId: this.currentSpaId,
      via: 'MOBILE'
    };

    logDebug(`Setting heater mode, payload ${JSON.stringify(heaterMode)}`);

    const req = await axios.post(
      'https://iot.controlmyspa.com/spa-commands/temperature/heater-mode',
      heaterMode,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'okhttp/4.9.0',
          'Accept-Encoding': 'gzip',
          'Content-Length': JSON.stringify(heaterMode).length,
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.tokenData.accessToken
        }
      }
    );

    if (req.status === 200) {
      const oldState = this.currentSpa.heaterMode;

      if (this.waitForResult) {
        await this.sleep(3000);
        const newSpaData = await this.getSpa();

        const newState = newSpaData.heaterMode;

        logInfo(oldState + ' => ' + newState);
        return newSpaData;
      }

      return true;
    } else {
      logError('Failed to set header mode');
    }

    return false;
  }

  // NOT MIGRATED YET AS SOMEHOW OBSOLETE
  async setFilterCycleIntervalSchedule (
    scheduleNumber,
    filterInterval,
    startTime
  ) {
    // scheduleNumber 0,1  || filterInterval: this.scheduleFilterIntervalEnum || time: 24 hour format eg 20:00
    const schedule = {
      deviceNumber: scheduleNumber.toString(), // 0 - first always enabled , 1 - can be disabled by setting interval number to 0
      originatorId: 'optional-filtercycle',
      intervalNumber: filterInterval,
      time: startTime
    };

    const req = await axios.post(
      'https://iot.controlmyspa.com/mobile/control/' +
      this.currentSpaId +
      '/setFilterCycleIntervalsSchedule',
      schedule,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'ControlMySpa/3.0.2 (com.controlmyspa.qa; build:1; iOS 14.2.0) Alamofire/5.2.2',
          'Accept-Encoding': 'br;q=1.0, gzip;q=0.9, deflate;q=0.8',
          'Accept-Language': 'en-US;q=1.0',
          'Content-Length': JSON.stringify(schedule).length,
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.tokenData.access_token
        }
      }
    );

    if (req.status === 202) {
      const oldState = this.currentSpa.components.find(
        (el, id) => {
          return (
            el.componentType === 'FILTER' && el.port === scheduleNumber.toString()
          );
        }
      );

      if (this.waitForResult) {
        await this.sleep(5000);
        const newSpaData = await this.getSpa();

        const newState = newSpaData.components.find((el, id) => {
          return (
            el.componentType === 'FILTER' && el.port === scheduleNumber.toString()
          );
        });

        console.log(oldState.value + ' => ' + newState.value);

        return newSpaData;
      }

      return true;
    } else {
      // error getting idm
      console.error('failed to set filter schedule');
    }

    return false;
  }

  createFilterScheduleIntervals () {
    this.scheduleFilterIntervalEnum = Object.freeze({
      idisabled: 0,
      i15minutes: 1,
      i30minutes: 2,
      i45minutes: 3,
      i1hour: 4,
      i1hour15minutes: 5,
      i1hour30minutes: 6,
      i1hour45minutes: 7,
      i2hours: 8,
      i2hours15minutes: 9,
      i2hours30minutes: 10,
      i2hours45minutes: 11,
      i3hours: 12,
      i3hours15minutes: 13,
      i3hours30minutes: 14,
      i3hours45minutes: 15,
      i4hours: 16,
      i4hours15minutes: 17,
      i4hours30minutes: 18,
      i4hours45minutes: 19,
      i5hours: 20,
      i5hours15minutes: 21,
      i5hours30minutes: 22,
      i5hours45minutes: 23,
      i6hours: 24,
      i6hours15minutes: 25,
      i6hours30minutes: 26,
      i6hours45minutes: 27,
      i7hours: 28,
      i7hours15minutes: 29,
      i7hours30minutes: 30,
      i7hours45minutes: 31,
      i8hours: 32,
      i8hours15minutes: 33,
      i8hours30minutes: 34,
      i8hours45minutes: 35,
      i9hours: 36,
      i9hours15minutes: 37,
      i9hours30minutes: 38,
      i9hours45minutes: 39,
      i10hours: 40,
      i10hours15minutes: 41,
      i10hours30minutes: 42,
      i10hours45minutes: 43,
      i11hours: 44,
      i11hours15minutes: 45,
      i11hours30minutes: 46,
      i11hours45minutes: 47,
      i12hours: 48,
      i12hours15minutes: 49,
      i12hours30minutes: 50,
      i12hours45minutes: 51,
      i13hours: 52,
      i13hours15minutes: 53,
      i13hours30minutes: 54,
      i13hours45minutes: 55,
      i14hours: 56,
      i14hours15minutes: 57,
      i14hours30minutes: 58,
      i14hours45minutes: 59,
      i15hours: 60,
      i15hours15minutes: 61,
      i15hours30minutes: 62,
      i15hours45minutes: 63,
      i16hours: 64,
      i16hours15minutes: 65,
      i16hours30minutes: 66,
      i16hours45minutes: 67,
      i17hours: 68,
      i17hours15minutes: 69,
      i17hours30minutes: 70,
      i17hours45minutes: 71,
      i18hours: 72,
      i18hours15minutes: 73,
      i18hours30minutes: 74,
      i18hours45minutes: 75,
      i19hours: 76,
      i19hours15minutes: 77,
      i19hours30minutes: 78,
      i19hours45minutes: 79,
      i20hours: 80,
      i20hours15minutes: 81,
      i20hours30minutes: 82,
      i20hours45minutes: 83,
      i21hours: 84,
      i21hours15minutes: 85,
      i21hours30minutes: 86,
      i21hours45minutes: 87,
      i22hours: 88,
      i22hours15minutes: 89,
      i22hours30minutes: 90,
      i22hours45minutes: 91,
      i23hours: 92,
      i23hours15minutes: 93,
      i23hours30minutes: 94,
      i23hours45minutes: 95,
      i24hours: 96
    });
  }
}

module.exports = ControlMySpa;
