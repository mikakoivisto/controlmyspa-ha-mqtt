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
  }

  async init () {
    return (
      (await this.idm()) &&
      (await this.login()) &&
      (await this.getProfile()) &&
      (await this.getDefaultSpa()) &&
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

      logDebug(`User profile found ${JSON.stringify(this.userInfo)}`);
      return this.userInfo;
    } else {
      throw new Error('Cannot get profile data: ' + req.status);
    }

    return false;
  }

  async getDefaultSpa () {
    logDebug('Requesting default spa data');

    const req = await axios.get(
      'https://iot.controlmyspa.com/spas/owned',
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

      // Take first spa
      this.currentSpaId = body.spas[0]._id;

      logDebug('Default spa id: ' + this.currentSpaId);
      return this.currentSpaId;
    } else {
      logError('Failed to get default spa data');
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
        
        if(this.currentSpa.targetDesiredTemp == undefined || parseFloat(this.currentSpa.targetDesiredTemp) <= 0) {
          this.currentSpa.targetDesiredTemp = this.currentSpa.desiredTemp;
        } else {
          this.currentSpa.targetDesiredTemp = (
            (parseFloat(this.currentSpa.targetDesiredTemp) - 32) *
            (5 / 9)
          ).toFixed(1);
        }

        this.currentSpa.currentTemp = (
          (parseFloat(this.currentSpa.currentTemp) - 32) *
          (5 / 9)
        ).toFixed(1);
      }

      logDebug(`Current spa data: ${JSON.stringify(this.currentSpa)}`);
      return this.currentSpa;
    } else {
      logError('Failed to get spa data');
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
      range: high ? 'HIGH' : 'LOW',
      spaId: this.currentSpaId,
      via: 'MOBILE'
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
      const oldRange = this.currentSpa.tempRange;

      if (this.waitForResult) {
        await this.sleep(3000);
        const newSpaData = await this.getSpa();

        logInfo(oldRange + ' => ' + newSpaData.tempRange);
        return newSpaData;
      }

      return true;
    } else {
      logError('Failed to set temp range');
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

    async setComponentState(logicalType, deviceNumber, desiredState) {

        const typeMap = {
            jet: 'PUMP',
            light: 'LIGHT',
            blower: 'BLOWER'
            // Add here
        };

        const hardwareType = typeMap[logicalType];
        if (!hardwareType) {
            throw new Error('Unknown logical component type: ${logicalType}');
        }

        // numbers 0,1,2  || states: HIGH , OFF
        if (desiredState !== 'OFF' && desiredState !== 'HIGH') {
            logError('Invalid value for desired state');
            return false;
        }

        const commandPayload = {
            componentType: logicalType,
            deviceNumber: Number(deviceNumber),
            spaId: this.currentSpaId,
            state: desiredState,
            via: 'MOBILE'
        };

        const req = await axios.post(
            'https://iot.controlmyspa.com/spa-commands/component-state',
            commandPayload,
            {
                headers: {
                    'User-Agent': 'okhttp/4.9.0',
                    'Accept-Encoding': 'gzip',
                    'Content-Length': JSON.stringify(commandPayload).length,
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + this.tokenData.accessToken,
                }
            }
        );

        if (req.status === 200) {
            const oldState = this.currentSpa.components.find(
                (el, id) => {
                    return (
                        el.componentType === hardwareType && el.port === deviceNumber.toString()
                    );
                }
            );

            if (this.waitForResult) {
                await this.sleep(3000);
                const newSpaData = await this.getSpa();

                const newState = newSpaData.components.find((el, id) => {
                    return (
                        el.componentType === hardwareType && el.port === deviceNumber.toString()
                    );
                });

                logInfo(`${hardwareType} ${deviceNumber}: ${oldState?.value} => ${newState?.value}`);
                return newSpaData;
            }

            return true;
        } else {
            logError(`Failed to set ${logicalType} state`);
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

    async setFilterCycle2State(desiredState) {
        if (desiredState === "true") {
            desiredState = 'ON';
        } else if (desiredState === "false") {
            desiredState = 'OFF';
        } else {
            logError('Invalid value for desired state');
            return false;
        }

        const payload = {
            spaId: this.currentSpaId,
            state: desiredState,
            via: 'MOBILE'
        };

        try {
            const response = await axios.post(
                'https://iot.controlmyspa.com/spa-commands/filter-cycles/toggle-filter2-state',
                payload,
                {
                    headers: {
                        Accept: 'application/json',
                        'User-Agent': 'okhttp/4.9.0',
                        'Accept-Encoding': 'gzip',
                        'Content-Length': JSON.stringify(payload).length,
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + this.tokenData.accessToken
                    }
                }
            );

        const body = response.data;

        if (
            response.status === 200 &&
            body?.statusCode === 200 &&
            body?.data?.success === true
        ) {
            logDebug('Filter cycle 2 state set successfully');
            return true;
        } else {
            logError('Unexpected response while setting filter cycle 2 state:', body);
        }
    } catch(err) {
        logError('Failed to set filter cycle 2 state:', err.message || err);
    }

    return false;
}

  async setFilterCycleIntervalSchedule (
    scheduleNumber,
    filterInterval,
    startTime
  ) {
      // scheduleNumber: 0 or 1
      // filterInterval: 1–96 (15 min intervals)
      // startTime: 'HH:mm'
    
    const schedule = {
      deviceNumber: Number(scheduleNumber),
      numOfIntervals: filterInterval, 
      spaId: this.currentSpaId,
      time: startTime,
      via: 'MOBILE'
      };

      console.log('schedule', schedule);

      const response = await axios.post(
        'https://iot.controlmyspa.com/spa-commands/filter-cycles/schedule',
        schedule,
        {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'okhttp/4.9.0',
                'Accept-Encoding': 'gzip',
                'Content-Length': JSON.stringify(schedule).length,
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + this.tokenData.accessToken
            }
        }
      );

      const body = response.data;

      if (
          response.status === 200 &&
          body?.statusCode === 200 &&
          body?.data?.success === true
      ) {
          logInfo('Filter cycle schedule set successfully');
          return true;
      } else {
          logError('Unexpected response while setting filter cycle schedule:', body);
      }
    return false;
    }

    async setTime(dateTime) {
        if (!(dateTime instanceof Date)) {
            logError('Invalid input: expected Date object');
            return false;
        }
        const mm = String(dateTime.getMonth() + 1).padStart(2, '0');
        const dd = String(dateTime.getDate()).padStart(2, '0');
        const yyyy = dateTime.getFullYear();

        const hours = String(dateTime.getHours()).padStart(2, '0');
        const minutes = String(dateTime.getMinutes()).padStart(2, '0');

        const payload = {
            date: `${mm}/${dd}/${yyyy}`,
            time: `${hours}:${minutes}`,
            isMilitaryFormat: true,
            spaId: this.currentSpaId,
            via: 'MOBILE'
        };  

        const response = await axios.post(
            'https://iot.controlmyspa.com/spa-commands/time',
            payload,
            {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'okhttp/4.9.0',
                    'Accept-Encoding': 'gzip',
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + this.tokenData.accessToken
                }
            }
        );

        const body = response.data;

        const resultOK =
            response.status === 200 &&
            body?.statusCode === 200 &&
            body?.data?.success === true;

        if (resultOK) {
            logInfo(`Time set successfully to ${payload.date} ${payload.time}`);
            return true;
        } else {
            logError('Failed to set time:', body);
            return false;
        }
        logError('Error in setTime():', err.message || err);
        return false;

    }

}

module.exports = ControlMySpa;
