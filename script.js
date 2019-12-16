let thermostatDevice = "MyThermostat"
let heatingDevice = "CV Ketel"
let temperatureDevice = "Woonkamer temperatuur"


class TemperatureHistory {
    constructor(temp, time) {
        this.temperature = temp;
        this.time = time;
    }
}

const test = false
const heatingStateType = Object.freeze({"rising":"rising", "declining":"declining", "stable":"stable"})
let overshoot = 0.3
let undershoot = 0.2
let boostTime = 300*1000
let heatingDelay = 480*1000
let deltaInterval = 200*1000
let safetyTemperature = 23
let lastMeasureTemperatureHeatingKey = "lastMeasureTemperatureHeatingLog";
let boostEndTimeKey = "boostEndTime"
let heatingWaitKey = "heatingWait"
let lastRunTimeKey = "lastRunTimeSwitchHeating"
var heatingState

console.log("start", new Date().toLocaleTimeString())
let currentTime = _.now()

// Loop safety
let LastRunTime = global.get(lastRunTimeKey)

if (currentTime !== null && currentTime - LastRunTime < 2000)
{
    console.log("loop safety activated", currentTime - LastRunTime, "ms")
    return 
}

global.set(lastRunTimeKey, currentTime)

console.log("Get temperatures", new Date().toLocaleTimeString())

let measureTemperature = await getFlowToken(temperatureDevice, "measure_temperature.sensor1")
console.log("measureTemperature", measureTemperature)
let targetTemperature = await getFlowToken(thermostatDevice, "target_temperature")
console.log("targetTemperature", targetTemperature)

if(measureTemperature == null || targetTemperature == 0)
{
    console.log('fatal error. Cannot get tag values')
    return setHeating(false)
}

// temperature safety
if (measureTemperature > safetyTemperature)
{
    console.log('temperature above safety level', safetyTemperature)
    return setHeating(false)
} 


console.log("Check boost", new Date().toLocaleTimeString())

let boostEndTime = global.get(boostEndTimeKey)

if (boostEndTime !== null)
    if (currentTime > boostEndTime+boostTime)
    {
        global.set(boostEndTimeKey, null)
        setHeating(false)
    }
    else
    {
        console.log("boosting")
        return
    }

let heatingWait = global.get(heatingWaitKey)

if (heatingWait !== null)
    if (currentTime > heatingWait+heatingDelay)
    {
        global.set(heatingWaitKey, null)
    }
    else
    {
        console.log("waiting", heatingWait+heatingDelay-currentTime)
        return
    }

console.log("outside limits")
if (measureTemperature < (targetTemperature-overshoot))
{
    return setHeating(true)
}

if (measureTemperature > (targetTemperature+undershoot))
    return setHeating(false)

console.log("inside limits")
// Delta

// [] of temperatureHistory
let lastMeasureTemperatureHeating = global.get(lastMeasureTemperatureHeatingKey)

if (lastMeasureTemperatureHeating == null)
     lastMeasureTemperatureHeating = [new TemperatureHistory(measureTemperature, currentTime)]

_.sortBy(lastMeasureTemperatureHeating,['time'])
_.each(lastMeasureTemperatureHeating, (m) => {
    console.log(new Date(m.time).toLocaleTimeString(), m.temperature)
})
let oldestTemperatureEntry = _.first(lastMeasureTemperatureHeating)
console.log(oldestTemperatureEntry)
let delta = measureTemperature-oldestTemperatureEntry.temperature

// Cleanup log
lastMeasureTemperatureHeating = _.filter(lastMeasureTemperatureHeating, (t) => {return currentTime-t.time < deltaInterval})

lastMeasureTemperatureHeating.push(new TemperatureHistory(measureTemperature, currentTime))
global.set(lastMeasureTemperatureHeatingKey, lastMeasureTemperatureHeating)

if (delta > 0)
    heatingState = heatingStateType.rising
else if (delta < 0)
    heatingState = heatingStateType.declining
else
    heatingState = heatingStateType.stable

console.log('state=', heatingState)

if (heatingState == heatingStateType.rising)
    return setHeating(false)

// Boost to keep temperature constant
let restartTemperature = targetTemperature-overshoot+undershoot
if (heatingState == heatingStateType.declining && measureTemperature < restartTemperature)
{
    console.log("boost")
global.set(boostEndTimeKey, currentTime);
global.set(heatingWaitKey, currentTime)
return setHeating(true)
}

async function getFlowToken(dev,id) { 
    var tokens;

    if (tokens == undefined)
        tokens = await Homey.flowToken.getFlowTokens();

    let token = _.first(_.filter(tokens,(t)=> {return (t.uriObj.name==dev && t.id == id)}))

    if (token == null || token == undefined)
        {
            console.log('tag', id, 'device', dev, 'is not found')
            return null
        }
    else
        return token.value 
}

async function setHeating(state)
{
    console.log("set heating to", state)
    if (test) return state
    let devs = await Homey.devices.getDevices()
    let d = _.first(_.filter(devs, (d) => {return d.name == 'CV ketel'}))
    d.setCapabilityValue('onoff', state);
    return state
}

