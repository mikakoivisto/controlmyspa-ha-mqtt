
<p align="center">
<img src="https://gitlab.com/VVlasy/controlmyspajs/-/raw/001917116dd56dfbe79ee8aea1665f7ff0682ecd/graphics/logo-transparent.png" width="150">
</p>

<span align="center">

# ControlMySpaJs
</span>

A library to facilitate connection to ControlMySpa API by Balboa

### Examples:

```js
const ControlMySpa = require('controlmyspajs');


let spa = new ControlMySpa("email@mail.mail", "password"); // uses celsius
// let spaFahrenheit = new ControlMySpa("email@mail.mail", "password", false);

spa.init().then((result) => {
    if (result) {
        console.log("Spa init success.");
        spa.waitForResult = true;
        console.log(spa.currentSpa);


        // available function calls
        
        spa.getSpa(); //refresh values for spa
        spa.toggleHeaterMode();
        spa.setTemp(38.5);
        spa.setTempRangeHigh();
        spa.setTempRangeLow();
        spa.lockPanel();
        spa.unlockPanel();
        spa.setJetState(0, "OFF"); // "OFF"/"HIGH"
        spa.setBlowerState(0, "HIGH"); // "OFF"/"HIGH"
        spa.setLightState(0, "HIGH"); // "OFF"/"HIGH"

        spa.setFilterCycleIntervalSchedule(0, spa.scheduleFilterIntervalEnum.i9hours30minutes, "20:00");         
    } else {
        console.log("Spa init failed.");
    };
});
```

### Supported features
    - get spa status
    - set temperature
    - set temperature range
    - toggle heater mode
    - lock/unlock panel
    - Control Jets, Blowers and Lights
    - set filter cycle intervals

* additional feature support can be added, I added all features my spa supported, although for me to add features from your spa I will need login credentials to sniff the API calls. Or you can sniff them yourself and send me the logs