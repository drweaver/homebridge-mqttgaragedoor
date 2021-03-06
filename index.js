// MQTT Garage Accessory plugin for HomeBridge
//Mqttgarage
// Remember to add accessory to config.json. Example:
// "accessories": [
//     {
//            "accessory": "mqttgarage",
//            "name": "PUT THE NAME OF YOUR SWITCH HERE",
//            "url": "PUT URL OF THE BROKER HERE",
//			  "username": "PUT USERNAME OF THE BROKER HERE",
//            "password": "PUT PASSWORD OF THE BROKER HERE"
// 			  "caption": "PUT THE LABEL OF YOUR SWITCH HERE",
// 			  "topicStatus": 	"PUT THE MQTT TOPIC FOR THE GETTING THE STATUS OF YOUR SWITCH HERE",
// 			  "topicTarget": 	"PUT THE MQTT TOPIC FOR THE SETTING THE STATUS OF YOUR SWITCH HERE"
//            "statusOpenedPayload": "opened",
//            "statusClosedPayload": "closed",
//            "statusOpeningPayload": "opening",
//            "statusClosingPayload": "closing",
//            "statusStoppedPayload": "stopped",
//            "targetOpenPayload": "open",
//            "targetClosePayload": "close"
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.

'use strict';

var Service, Characteristic;
var mqtt = require("mqtt");

function MqttGarageAccessory(log, config) {
    this.log = log;
    this.name = config["name"];
    this.url = config["url"];
    this.client_Id = 'mqttjs_' + Math.random().toString(16).substr(2, 8);
    this.options = {
        keepalive: 10,
        clientId: this.client_Id,
        protocolId: 'MQTT',
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
        will: {
            topic: 'WillMsg',
            payload: 'Connection Closed abnormally..!',
            qos: 0,
            retain: false
        },
        username: config["username"],
        password: config["password"],
        rejectUnauthorized: false
    };
    this.caption = config["caption"];
    this.topicStatus = config["topicStatus"]; // the target value sent to HomeKit
    this.topicTarget = config["topicTarget"]; // the actual value for door state
    
    this.statusOpenedPayload = config['statusOpenedPayload'];
    this.statusClosedPayload = config['statusClosedPayload'];
    this.statusOpeningPayload = config['statusOpeningPayload'];
    this.statusClosingPayload = config['statusClosingPayload'];
    this.targetOpenPayload = config['targetOpenPayload'];
    this.targetClosePayload = config['targetClosePayload'];

// The value property of CurrentDoorState must be one of the following:
// Characteristic.CurrentDoorState.OPEN = 0;
// Characteristic.CurrentDoorState.CLOSED = 1;
// Characteristic.CurrentDoorState.OPENING = 2;
// Characteristic.CurrentDoorState.CLOSING = 3;
// Characteristic.CurrentDoorState.STOPPED = 4;

    var that = this;
    this.translateStatus = function( status, callback ) {
      if ( status == that.statusOpenedPayload)   return callback(null, Characteristic.CurrentDoorState.OPEN);
      if ( status == that.statusClosedPayload)   return callback(null, Characteristic.CurrentDoorState.CLOSED);
      if ( status ==  that.statusOpeningPayload) return callback(null, Characteristic.CurrentDoorState.OPENING);
      if ( status ==  that.statusClosingPayload) return callback(null, Characteristic.CurrentDoorState.CLOSING);
      return callback("Invalid status: " + status);
    };
    
    this.translateTarget = function( target, callback ) {
      if ( target == that.targetOpenPayload)  return callback(null, Characteristic.CurrentDoorState.OPEN);
      if ( target == that.targetClosePayload) return callback(null, Characteristic.CurrentDoorState.CLOSED);
      return callback("Invalid target: " + target);
    };
    
    this.characteristicToTarget = function( target, callback ) {
        if( target == Characteristic.CurrentDoorState.OPEN) return callback(null, that.targetOpenPayload);
        if( target == Characteristic.CurrentDoorState.CLOSED) return callback(null, that.targetClosePayload);
        return callback("Invalid target: " + target); 
    };

    this.CachedGarageDoorState = null; // Characteristic.CurrentDoorState.CLOSED; // 1 = closed
    this.CachedGarageTargetDoorState = null; //Characteristic.CurrentDoorState.CLOSED; // 1 = closed
    this.CachedGarageObstructionDetectedState = false;

    this.service = new Service.GarageDoorOpener(this.name);

    this.service.getCharacteristic(Characteristic.CurrentDoorState).on('get', this.getDoorPositionState.bind(this));
    this.service.getCharacteristic(Characteristic.TargetDoorState).on('get', this.getDoorTargetPositionState.bind(this));
    this.service.getCharacteristic(Characteristic.ObstructionDetected).on('get', this.getObstructionDetected.bind(this));
    this.service.getCharacteristic(Characteristic.TargetDoorState).on('set', this.setDoorTargetPosition.bind(this));

    // connect to MQTT broker
    this.client = mqtt.connect(this.url, this.options);
    this.client.on('error', function () {
        that.log('Error event on MQTT');
    });

    this.client.on('message', function (topic, message) {
        that.log("MQTT Recieved on topic: " + topic + " message: " + message);
        if (topic == that.topicStatus) { // actual value changed
            that.translateStatus(message, (err,status) => {
                if( err ) {
                    return that.log("Error with message on topic: " + topic + ": " + err);
                }
                that.CachedGarageDoorState = status;
                that.service.getCharacteristic(Characteristic.CurrentDoorState).setValue(status, undefined, 'fromSetValue');
                if( that.CachedGarageTargetDoorState == null ) { // init target state
                    that.CachedGarageTargetDoorState = status;
                    that.service.getCharacteristic(Characteristic.TargetDoorState).setValue(status, undefined, 'fromSetValue');
                }
            });
        }
        if (topic == that.topicTarget) { // target value changed
            that.translateTarget(message, (err,status)=> {
                if( err ) {
                    return that.log("Error with message on topic: " + topic + ": " + err);
                }
                if (that.CachedGarageTargetDoorState != status) { // avoid loopback from own changes
                    that.CachedGarageTargetDoorState = status;
                    that.service.getCharacteristic(Characteristic.TargetDoorState).setValue(status, undefined, 'fromSetValue');
                }
            });
        }
    });
    this.client.subscribe(this.topicStatus);
    this.client.subscribe(this.topicTarget);
}

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-mqttgarage", "mqttgarage", MqttGarageAccessory);
};

MqttGarageAccessory.prototype.getDoorPositionState = function (callback) {
    this.log("getDoorPosition");
    callback(null, this.CachedGarageDoorState);
};

MqttGarageAccessory.prototype.getDoorTargetPositionState = function (callback) {
    this.log("getDoorTargetPosition");
    callback(null, this.CachedGarageTargetDoorState);
};

MqttGarageAccessory.prototype.setDoorTargetPosition = function (status, callback, context) {
    this.log("setDoorTargetPosition");
    this.CachedGarageTargetDoorState = status;
    this.characteristicToTarget(status, (err,target) => {
        if( err ) return callback(err);
        this.client.publish(this.topicTarget, String(target)); // send MQTT packet for new state
    });
    callback();
};

MqttGarageAccessory.prototype.getObstructionDetected = function (callback) {
    this.log("getObstructionDetected");
    callback(null, false); //Not implemented
};

MqttGarageAccessory.prototype.getServices = function () {
    return [this.service];
};
