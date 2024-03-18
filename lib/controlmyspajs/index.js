const ControlMySpa = require('./controlmyspa');

const spa = new ControlMySpa('email@mail.mail', 'password'); // uses celsius
// let spaFahrenheit = new ControlMySpa("email@mail.mail", "password", false);

spa.init().then(result => {
  if (result) {
    console.log('Spa init success.');
    spa.waitForResult = true;
    console.log(JSON.stringify(spa.currentSpa));

    // available function calls

    spa.getSpa(); // refresh values for spa
    spa.toggleHeaterMode();
    spa.setTemp(38.5);
    spa.setTempRangeHigh();
    spa.setTempRangeLow();
    spa.lockPanel();
    spa.unlockPanel();
    spa.setJetState(0, 'OFF'); // "OFF"/"HIGH"
    spa.setBlowerState(0, 'HIGH'); // "OFF"/"HIGH"
    spa.setLightState(0, 'HIGH'); // "OFF"/"HIGH"

    spa.setFilterCycleIntervalSchedule(
      0,
      spa.scheduleFilterIntervalEnum.i9hours30minutes,
      '20:00'
    );
  } else {
    console.log('Spa init failed.');
  }
});
